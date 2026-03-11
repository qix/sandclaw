import makeWASocket, {
  DisconnectReason,
  fetchLatestBaileysVersion,
} from "@whiskeysockets/baileys";
import * as QRCode from "qrcode";
import pino from "pino";
import type { ConversationSummary } from "@sandclaw/ui";
import { waState } from "./state";
import { useDBAuthState } from "./auth";

/** Look up or create a conversation row for the given JID, returning its auto-increment ID. */
export async function getOrCreateConversationId(
  db: any,
  jid: string,
): Promise<number> {
  const existing = await db("conversations")
    .where({ plugin: "whatsapp", channel: "whatsapp", external_id: jid })
    .first();
  if (existing) return existing.id;
  const [id] = await db("conversations").insert({
    plugin: "whatsapp",
    channel: "whatsapp",
    external_id: jid,
    created_at: Date.now(),
  });
  return id;
}

/** Upsert the single whatsapp_sessions row. */
export async function upsertSession(db: any, data: Record<string, any>) {
  const existing = await db("whatsapp_sessions").first();
  if (existing) {
    await db("whatsapp_sessions").where("id", existing.id).update(data);
  } else {
    await db("whatsapp_sessions").insert(data);
  }
}

export async function loadRecentConversations(db: any): Promise<void> {
  const rows = await db("conversation_message")
    .where("plugin", "whatsapp")
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
  waState.recentConversations = Array.from(seen.values());
}

export async function connectWhatsApp(
  db: any,
  options: { operatorOnly: boolean; operatorJids: ReadonlySet<string> },
) {
  const { operatorOnly, operatorJids } = options;
  const logger = pino({ level: "silent" });
  const { version } = await fetchLatestBaileysVersion();
  const { state, saveCreds } = await useDBAuthState(db);

  const sock = makeWASocket({
    auth: state,
    logger,
    version,
  });

  waState.waSocket = sock;

  sock.ev.on("connection.update", async (update: any) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      waState.qrDataUrl = await QRCode.toDataURL(qr);
      waState.connectionStatus = "qr_pending";
      await upsertSession(db, {
        status: "qr_pending",
        qr_data_url: waState.qrDataUrl,
        updated_at: Date.now(),
      });
    }

    if (connection === "close") {
      waState.connectionStatus = "disconnected";
      waState.qrDataUrl = null;
      waState.waSocket = null;

      const statusCode = (lastDisconnect?.error as any)?.output?.statusCode;
      const loggedOut = statusCode === DisconnectReason.loggedOut;

      if (loggedOut) {
        await db("whatsapp_auth_state").del();
        await db("whatsapp_sessions").del();
        console.log(
          "[whatsapp] Logged out — auth state cleared. Restart to reconnect.",
        );
      } else {
        console.log(
          `[whatsapp] Disconnected (status=${statusCode}). Reconnecting in 3s...`,
        );
        setTimeout(() => connectWhatsApp(db, options), 3000);
      }
    }

    if (connection === "connecting") {
      waState.connectionStatus = "connecting";
    }

    if (connection === "open") {
      waState.connectionStatus = "connected";
      waState.qrDataUrl = null;
      waState.phoneNumber =
        sock.user?.id?.split(":")[0] ?? sock.user?.id ?? null;

      await upsertSession(db, {
        status: "connected",
        qr_data_url: null,
        phone_number: waState.phoneNumber,
        last_heartbeat: Date.now(),
        updated_at: Date.now(),
      });

      console.log(`[whatsapp] Connected as ${waState.phoneNumber}`);
    }
  });

  sock.ev.on("creds.update", saveCreds);

  sock.ev.on("messages.upsert", async ({ messages, type }: any) => {
    if (type !== "notify") return;

    for (const msg of messages) {
      if (msg.key.fromMe) continue;
      if (!msg.message) continue;

      const jid = msg.key.remoteJid;
      if (!jid) continue;

      const text =
        msg.message.conversation ||
        msg.message.extendedTextMessage?.text ||
        null;

      if (!text) continue;

      const pushName = msg.pushName ?? null;
      const timestamp =
        typeof msg.messageTimestamp === "number"
          ? msg.messageTimestamp
          : Number(msg.messageTimestamp) || Math.floor(Date.now() / 1000);
      const messageId = msg.key.id || `${Date.now()}`;
      const isGroup = jid.endsWith("@g.us");
      const conversationId = await getOrCreateConversationId(db, jid);

      // Store in conversation_message
      await db("conversation_message").insert({
        conversation_id: conversationId,
        plugin: "whatsapp",
        channel: "whatsapp",
        message_id: messageId,
        thread_id: jid,
        from: jid,
        to: waState.phoneNumber,
        timestamp,
        direction: "inbound",
        text,
        created_at: Date.now(),
      });

      if (!operatorOnly || operatorJids.has(jid)) {
        // Fetch recent history for context
        const recentMessages = await db("conversation_message")
          .where({ plugin: "whatsapp", thread_id: jid })
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

        // Build payload and enqueue
        const payload = {
          messageId,
          jid,
          pushName,
          timestamp,
          text,
          isGroup,
          groupJid: isGroup ? jid : null,
          replyToText:
            msg.message.extendedTextMessage?.contextInfo?.quotedMessage
              ?.conversation ?? null,
          history,
        };

        const now = Date.now();
        await db("safe_queue").insert({
          job_type: "whatsapp:incoming_message",
          data: JSON.stringify(payload),
          context: JSON.stringify({ channel: "whatsapp", jid, conversationId }),
          status: "pending",
          created_at: now,
          updated_at: now,
        });

        console.log(
          `[whatsapp] Queued incoming message from ${pushName ?? jid}`,
        );
      } else {
        console.log(
          `[whatsapp] Ignored incoming message from ${pushName ?? jid}`,
        );
      }

      // Refresh conversation list after storing the message
      loadRecentConversations(db).catch(() => {});
    }
  });
}

export function disconnectWhatsApp() {
  if (waState.waSocket) {
    waState.waSocket.end(undefined);
    waState.waSocket = null;
  }
  waState.connectionStatus = "disconnected";
  waState.qrDataUrl = null;
  waState.phoneNumber = null;
}
