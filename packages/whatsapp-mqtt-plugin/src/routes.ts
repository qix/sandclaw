import type { VerificationsService } from "@sandclaw/gatekeeper-plugin-api";
import { localTimestamp } from "@sandclaw/util";
import { wamState } from "./state";
import {
  getOrCreateConversationId,
  loadRecentConversations,
  publishOutgoing,
} from "./connection";

const PLUGIN = "whatsapp-mqtt";
const CHANNEL = "whatsapp-mqtt";

/** Send a WhatsApp message via MQTT and record it in conversation_message. */
export async function deliverMessage(
  db: any,
  topicOutgoing: string,
  jid: string,
  text: string,
) {
  publishOutgoing(topicOutgoing, jid, text);

  const conversationId = await getOrCreateConversationId(db, jid);
  await db("conversation_message").insert({
    conversation_id: conversationId,
    plugin: PLUGIN,
    channel: CHANNEL,
    message_id: `sent-${Date.now()}`,
    thread_id: jid,
    from: null,
    to: jid,
    timestamp: localTimestamp(),
    direction: "outbound",
    text,
    created_at: localTimestamp(),
  });

  loadRecentConversations(db).catch((err) =>
    console.error("[whatsapp-mqtt] Failed to load recent conversations:", err),
  );
}

export function registerRoutes(
  app: any,
  db: any,
  topicOutgoing: string,
  operatorJids: ReadonlySet<string>,
  verifications: VerificationsService,
) {
  // GET /settings/watch-inbox
  app.get("/settings/watch-inbox", async (c: any) => {
    const row = await db("plugin_kv")
      .where({ plugin: PLUGIN, key: "watch_inbox" })
      .first();
    return c.json({ enabled: row?.value === "true" });
  });

  // POST /settings/watch-inbox
  app.post("/settings/watch-inbox", async (c: any) => {
    const body = await c.req.json();
    const enabled = !!body.enabled;

    const existing = await db("plugin_kv")
      .where({ plugin: PLUGIN, key: "watch_inbox" })
      .first();

    if (existing) {
      await db("plugin_kv")
        .where({ plugin: PLUGIN, key: "watch_inbox" })
        .update({ value: String(enabled) });
    } else {
      await db("plugin_kv").insert({
        plugin: PLUGIN,
        key: "watch_inbox",
        value: String(enabled),
      });
    }

    return c.json({ enabled });
  });

  // GET /status
  app.get("/status", (_c: any) => {
    return _c.json({
      status: wamState.connectionStatus,
    });
  });

  // POST /send
  app.post("/send", async (c: any) => {
    const body = await c.req.json();
    const { jid, text, jobContext } = body;

    if (!jid || !text) {
      return c.json({ error: "jid and text are required" }, 400);
    }

    try {
      const { id, status } = await verifications.requestVerification({
        action: "send_message",
        data: { jid, text },
        jobContext,
        autoApprove: operatorJids.has(jid),
      });
      return c.json({ verificationRequestId: id, verificationStatus: status });
    } catch (err) {
      console.error("[whatsapp-mqtt] Failed to deliver message:", err);
      return c.json(
        { error: `WhatsApp MQTT send failed: ${(err as Error).message}` },
        503,
      );
    }
  });
}
