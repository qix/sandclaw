import { waState } from "./state";
import {
  getOrCreateConversationId,
  loadRecentConversations,
} from "./connection";

/** Send a WhatsApp message and record it in conversation_message. */
export async function deliverMessage(db: any, jid: string, text: string) {
  if (!waState.waSocket) {
    throw new Error("WhatsApp not connected");
  }

  await waState.waSocket.sendMessage(jid, { text });

  const conversationId = await getOrCreateConversationId(db, jid);
  await db("conversation_message").insert({
    conversation_id: conversationId,
    plugin: "whatsapp",
    channel: "whatsapp",
    message_id: `sent-${Date.now()}`,
    thread_id: jid,
    from: waState.phoneNumber,
    to: jid,
    timestamp: Math.floor(Date.now() / 1000),
    direction: "outbound",
    text,
    created_at: Date.now(),
  });

  loadRecentConversations(db).catch(() => {});
}

export function registerRoutes(
  app: any,
  db: any,
  operatorJids: ReadonlySet<string>,
) {
  // GET /status — current connection state
  app.get("/status", (_c: any) => {
    return _c.json({
      status: waState.connectionStatus,
      phoneNumber: waState.phoneNumber,
      hasQr: !!waState.qrDataUrl,
    });
  });

  // POST /send — create a verification request for sending a message
  app.post("/send", async (c: any) => {
    const body = await c.req.json();
    const { jid, text } = body;

    if (!jid || !text) {
      return c.json({ error: "jid and text are required" }, 400);
    }

    const autoApprove = operatorJids.has(jid);
    const now = Date.now();
    const [id] = await db("verification_requests").insert({
      plugin: "whatsapp",
      action: "send_message",
      data: JSON.stringify({ jid, text }),
      status: autoApprove ? "approved" : "pending",
      created_at: now,
      updated_at: now,
    });

    if (autoApprove) {
      try {
        await deliverMessage(db, jid, text);
      } catch {
        return c.json({ error: "WhatsApp not connected" }, 503);
      }
    }

    return c.json({
      verificationRequestId: id,
      verificationStatus: autoApprove ? "approved" : "pending",
    });
  });

  // POST /approve/:id — approve a pending send request and deliver the message
  app.post("/approve/:id", async (c: any) => {
    const id = parseInt(c.req.param("id"), 10);
    if (!id || isNaN(id)) return c.json({ error: "Invalid id" }, 400);

    const request = await db("verification_requests").where("id", id).first();
    if (!request || request.status !== "pending") {
      return c.json({ error: "Not found or already resolved" }, 404);
    }
    if (request.plugin !== "whatsapp" || request.action !== "send_message") {
      return c.json({ error: "Not a WhatsApp send request" }, 400);
    }

    const { jid, text } = JSON.parse(request.data);

    try {
      await deliverMessage(db, jid, text);
    } catch {
      return c.json({ error: "WhatsApp not connected" }, 503);
    }

    await db("verification_requests")
      .where("id", id)
      .update({ status: "approved", updated_at: Date.now() });

    return c.json({ success: true, verificationStatus: "approved" });
  });
}
