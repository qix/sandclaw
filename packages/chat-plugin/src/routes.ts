import { storeMessage } from "./websocket";
import { broadcast } from "./state";

export function registerRoutes(app: any, db: any) {
  // POST /send — store an outbound message and broadcast via WebSocket
  app.post("/send", async (c: any) => {
    const body = await c.req.json();
    const { text } = body;

    if (!text) {
      return c.json({ error: "text is required" }, 400);
    }

    const msg = await storeMessage(db, "outbound", "agent", text);
    broadcast({ type: "message", ...msg });

    return c.json({ success: true, messageId: msg.id });
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
