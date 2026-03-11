import type { NotifyService } from "@sandclaw/gatekeeper-plugin-api";
import { storeMessage } from "./websocket";
import { broadcast } from "./state";

export function registerRoutes(app: any, db: any, notify: NotifyService) {
  // POST /send — store an outbound message and broadcast via WebSocket
  app.post("/send", async (c: any) => {
    const body = await c.req.json();
    const { text } = body;

    if (!text) {
      return c.json({ error: "text is required" }, 400);
    }

    const msg = await storeMessage(db, "outbound", "agent", text);
    broadcast({ type: "message", ...msg });
    notify.notifyCountChange();

    return c.json({ success: true, messageId: msg.id });
  });

  // POST /mark-read — mark messages up to a given ID as read
  app.post("/mark-read", async (c: any) => {
    const body = await c.req.json();
    const messageId = Number(body.messageId);

    if (!messageId || isNaN(messageId)) {
      return c.json({ error: "messageId is required" }, 400);
    }

    const existing = await db("plugin_kv")
      .where({ plugin: "chat", key: "last_read_message_id" })
      .first();

    if (existing) {
      if (messageId > Number(existing.value)) {
        await db("plugin_kv")
          .where({ plugin: "chat", key: "last_read_message_id" })
          .update({ value: String(messageId) });
      }
    } else {
      await db("plugin_kv").insert({
        plugin: "chat",
        key: "last_read_message_id",
        value: String(messageId),
      });
    }

    notify.notifyCountChange();
    return c.json({ success: true });
  });

  // GET /history — fetch recent messages (fallback for non-WS clients)
  app.get("/history", async (c: any) => {
    const limit = parseInt(c.req.query("limit") || "50", 10);
    const convRow = await db("conversations")
      .where({ plugin: "chat", channel: "chat", external_id: "operator" })
      .first();

    if (!convRow) {
      return c.json({ messages: [] });
    }

    const rows = await db("conversation_message")
      .where({ conversation_id: convRow.id })
      .orderBy("created_at", "desc")
      .limit(Math.min(limit, 200));

    const messages = rows.reverse().map((r: any) => ({
      id: r.id,
      from: r.from,
      text: r.text,
      direction: r.direction,
      timestamp: r.timestamp,
    }));

    return c.json({ messages });
  });
}
