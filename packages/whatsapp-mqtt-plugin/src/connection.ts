import mqtt from "mqtt";
import type { ConversationSummary } from "@sandclaw/ui";
import { localTimestamp } from "@sandclaw/util";
import { wamState } from "./state";

const PLUGIN = "whatsapp-mqtt";
const CHANNEL = "whatsapp-mqtt";

/** MQTT payload published by the whatsapp-bridge on the incoming topic. */
export interface IncomingPayload {
  id: string;
  remoteJid: string;
  fromMe: boolean;
  participant?: string;
  messageType: string;
  body: string;
  timestamp: number;
  pushName?: string;
  groupName?: string;
}

/** Check whether the "watch inbox" toggle is enabled (defaults to OFF). */
export async function isWatchInboxEnabled(db: any): Promise<boolean> {
  const row = await db("plugin_kv")
    .where({ plugin: PLUGIN, key: "watch_inbox" })
    .first();
  return row?.value === "true";
}

/** Look up or create a conversation row for the given JID, returning its auto-increment ID. */
export async function getOrCreateConversationId(
  db: any,
  jid: string,
): Promise<number> {
  const existing = await db("conversations")
    .where({ plugin: PLUGIN, channel: CHANNEL, external_id: jid })
    .first();
  if (existing) return existing.id;
  const [id] = await db("conversations").insert({
    plugin: PLUGIN,
    channel: CHANNEL,
    external_id: jid,
    created_at: localTimestamp(),
  });
  return id;
}

/** Upsert the single whatsapp_mqtt_sessions row. */
export async function upsertSession(db: any, data: Record<string, any>) {
  const existing = await db("whatsapp_mqtt_sessions").first();
  if (existing) {
    await db("whatsapp_mqtt_sessions").where("id", existing.id).update(data);
  } else {
    await db("whatsapp_mqtt_sessions").insert(data);
  }
}

export async function loadRecentConversations(db: any): Promise<void> {
  const rows = await db("conversation_message")
    .where("plugin", PLUGIN)
    .whereNotNull("thread_id")
    .select("thread_id", "from", "text", "timestamp", "direction")
    .orderBy("timestamp", "desc")
    .limit(200);

  const seen = new Map<string, ConversationSummary>();
  for (const row of rows) {
    if (seen.has(row.thread_id)) continue;
    const displayName =
      row.direction === "inbound"
        ? row.from?.replace(/@.*$/, "") || row.thread_id
        : row.thread_id.replace(/@.*$/, "");
    seen.set(row.thread_id, {
      threadId: row.thread_id,
      displayName,
      lastMessage: row.text || "",
      lastTimestamp: row.timestamp,
      direction: row.direction,
    });
  }
  wamState.recentConversations = Array.from(seen.values());
}

export interface MqttConnectionOptions {
  mqttUrl: string;
  mqttUser?: string;
  mqttPassword?: string;
  topicIncoming: string;
  topicOutgoing: string;
  operatorOnly: boolean;
  operatorJids: ReadonlySet<string>;
  modelId?: string;
}

export async function connectMqtt(
  db: any,
  options: MqttConnectionOptions,
) {
  const {
    mqttUrl,
    mqttUser,
    mqttPassword,
    topicIncoming,
    topicOutgoing,
    operatorOnly,
    operatorJids,
    modelId,
  } = options;

  wamState.connectionStatus = "connecting";
  await upsertSession(db, {
    status: "connecting",
    mqtt_url: mqttUrl,
    updated_at: localTimestamp(),
  });

  const client = mqtt.connect(mqttUrl, {
    username: mqttUser,
    password: mqttPassword,
  });

  wamState.mqttClient = client;

  client.on("connect", async () => {
    wamState.connectionStatus = "connected";
    await upsertSession(db, {
      status: "connected",
      last_heartbeat: localTimestamp(),
      updated_at: localTimestamp(),
    });
    console.log(`[whatsapp-mqtt] Connected to MQTT broker at ${mqttUrl}`);

    client.subscribe(topicIncoming, (err) => {
      if (err) {
        console.error(
          `[whatsapp-mqtt] Failed to subscribe to ${topicIncoming}: ${err.message}`,
        );
      } else {
        console.log(
          `[whatsapp-mqtt] Subscribed to ${topicIncoming}`,
        );
      }
    });
  });

  client.on("message", async (_topic, payload) => {
    let msg: IncomingPayload;
    try {
      msg = JSON.parse(payload.toString());
    } catch {
      console.error("[whatsapp-mqtt] Failed to parse incoming MQTT message");
      return;
    }

    if (msg.fromMe) return;
    if (!msg.remoteJid) return;

    const jid = msg.remoteJid;
    const text = msg.body;
    if (!text) return;

    const pushName = msg.pushName ?? null;
    const timestamp = localTimestamp(new Date(msg.timestamp * 1000));
    const messageId = msg.id || `${Date.now()}`;
    const isGroup = jid.endsWith("@g.us");
    const conversationId = await getOrCreateConversationId(db, jid);

    // Store in conversation_message
    await db("conversation_message").insert({
      conversation_id: conversationId,
      plugin: PLUGIN,
      channel: CHANNEL,
      message_id: messageId,
      thread_id: jid,
      from: jid,
      to: null,
      timestamp,
      direction: "inbound",
      text,
      created_at: localTimestamp(),
    });

    const watchEnabled = await isWatchInboxEnabled(db);
    const llmDisabled = modelId === "none";
    if (watchEnabled && !llmDisabled && (!operatorOnly || operatorJids.has(jid))) {
      // Fetch recent history for context
      const recentMessages = await db("conversation_message")
        .where({ plugin: PLUGIN, thread_id: jid })
        .orderBy("timestamp", "desc")
        .limit(10);

      const history = recentMessages
        .reverse()
        .filter((m: any) => m.message_id !== messageId)
        .map((m: any) => ({
          role:
            m.direction === "inbound"
              ? ("user" as const)
              : ("assistant" as const),
          text: m.text || "",
          timestamp: m.timestamp,
        }));

      const jobPayload = {
        messageId,
        jid,
        pushName,
        timestamp,
        text,
        isGroup,
        groupJid: isGroup ? jid : null,
        replyToText: null,
        history,
      };

      const now = localTimestamp();
      await db("job_queue").insert({
        executor: "muteworker",
        job_type: "whatsapp-mqtt:incoming_message",
        data: JSON.stringify(jobPayload),
        context: JSON.stringify({ channel: CHANNEL, jid, conversationId }),
        status: "pending",
        created_at: now,
        updated_at: now,
      });

      console.log(
        `[whatsapp-mqtt] Queued incoming message from ${pushName ?? jid}`,
      );
    } else {
      console.log(
        `[whatsapp-mqtt] Saved message from ${pushName ?? jid} (${llmDisabled ? "model=none, log only" : watchEnabled ? "queue enabled, operator-only filtered" : "queue disabled"})`,
      );
    }

    // Refresh conversation list
    loadRecentConversations(db).catch((err) =>
      console.error("[whatsapp-mqtt] Failed to load recent conversations:", err),
    );
  });

  client.on("error", async (err) => {
    console.error(`[whatsapp-mqtt] MQTT error: ${err.message}`);
  });

  client.on("offline", async () => {
    wamState.connectionStatus = "disconnected";
    await upsertSession(db, {
      status: "disconnected",
      updated_at: localTimestamp(),
    });
    console.log("[whatsapp-mqtt] MQTT client offline");
  });

  client.on("reconnect", () => {
    wamState.connectionStatus = "connecting";
    console.log("[whatsapp-mqtt] MQTT reconnecting...");
  });
}

export function disconnectMqtt() {
  if (wamState.mqttClient) {
    wamState.mqttClient.end();
    wamState.mqttClient = null;
  }
  wamState.connectionStatus = "disconnected";
}

/** Publish a message to the MQTT outgoing topic for the bridge to send via WhatsApp. */
export function publishOutgoing(
  topicOutgoing: string,
  jid: string,
  text: string,
) {
  if (!wamState.mqttClient || !wamState.mqttClient.connected) {
    throw new Error("MQTT not connected");
  }
  wamState.mqttClient.publish(
    topicOutgoing,
    JSON.stringify({ jid, text }),
    { qos: 1 },
  );
}
