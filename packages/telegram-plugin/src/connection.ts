import TelegramBot from "node-telegram-bot-api";
import type { ConversationSummary } from "@sandclaw/ui";
import { tgState } from "./state";

/** Look up or create a conversation row for the given chat ID, returning its auto-increment ID. */
export async function getOrCreateConversationId(
  db: any,
  chatId: string,
): Promise<number> {
  const existing = await db("conversations")
    .where({ plugin: "telegram", channel: "telegram", external_id: chatId })
    .first();
  if (existing) return existing.id;
  const [id] = await db("conversations").insert({
    plugin: "telegram",
    channel: "telegram",
    external_id: chatId,
    created_at: new Date().toISOString(),
  });
  return id;
}

/** Upsert the single telegram_sessions row. */
export async function upsertSession(db: any, data: Record<string, any>) {
  const existing = await db("telegram_sessions").first();
  if (existing) {
    await db("telegram_sessions").where("id", existing.id).update(data);
  } else {
    await db("telegram_sessions").insert(data);
  }
}

export async function loadRecentConversations(db: any): Promise<void> {
  const rows = await db("conversation_message")
    .where("plugin", "telegram")
    .whereNotNull("thread_id")
    .select("thread_id", "from", "text", "timestamp", "direction")
    .orderBy("timestamp", "desc")
    .limit(200);

  const seen = new Map<string, ConversationSummary>();
  for (const row of rows) {
    if (seen.has(row.thread_id)) continue;
    seen.set(row.thread_id, {
      threadId: row.thread_id,
      displayName: row.from || row.thread_id,
      lastMessage: row.text || "",
      lastTimestamp: row.timestamp,
      direction: row.direction,
    });
  }
  tgState.recentConversations = Array.from(seen.values());
}

/** Send a message via the bot and record it in conversation_message. Throws if bot is not connected. */
export async function deliverMessage(db: any, chatId: string, text: string) {
  if (!tgState.bot) throw new Error("Telegram bot not connected");
  await tgState.bot.sendMessage(chatId, text);
  const conversationId = await getOrCreateConversationId(db, chatId);
  await db("conversation_message").insert({
    conversation_id: conversationId,
    plugin: "telegram",
    channel: "telegram",
    message_id: `sent-${Date.now()}`,
    thread_id: chatId,
    from: tgState.botUsername,
    to: chatId,
    timestamp: new Date().toISOString(),
    direction: "outbound",
    text,
    created_at: new Date().toISOString(),
  });

  loadRecentConversations(db).catch((err) =>
    console.error("[telegram] Failed to load recent conversations:", err),
  );
}

export async function connectTelegram(db: any, token: string) {
  tgState.connectionStatus = "connecting";
  tgState.botToken = token;

  const bot = new TelegramBot(token, { polling: true });

  // Verify the token by calling getMe
  const me = await bot.getMe();
  tgState.bot = bot;
  tgState.botUsername = me.username ?? null;
  tgState.connectionStatus = "connected";

  await upsertSession(db, {
    status: "connected",
    bot_username: tgState.botUsername,
    bot_token: token,
    last_heartbeat: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  });

  console.log(`[telegram] Connected as @${tgState.botUsername}`);

  // Handle incoming messages
  bot.on("message", async (msg) => {
    // Ignore non-text messages
    if (!msg.text) return;

    const chatId = String(msg.chat.id);
    const text = msg.text;
    const messageId = String(msg.message_id);
    const timestamp = new Date(msg.date * 1000).toISOString();
    const firstName = msg.from?.first_name ?? null;
    const lastName = msg.from?.last_name ?? null;
    const username = msg.from?.username ?? null;
    const isGroup = msg.chat.type === "group" || msg.chat.type === "supergroup";
    const groupTitle = isGroup ? (msg.chat.title ?? null) : null;

    const replyToText = msg.reply_to_message?.text ?? null;

    const conversationId = await getOrCreateConversationId(db, chatId);

    // Store in conversation_message
    await db("conversation_message").insert({
      conversation_id: conversationId,
      plugin: "telegram",
      channel: "telegram",
      message_id: messageId,
      thread_id: chatId,
      from: chatId,
      to: tgState.botUsername,
      timestamp,
      direction: "inbound",
      text,
      created_at: new Date().toISOString(),
    });

    // Fetch recent history for context
    const recentMessages = await db("conversation_message")
      .where({ plugin: "telegram", thread_id: chatId })
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
      chatId,
      firstName,
      lastName,
      username,
      timestamp,
      text,
      isGroup,
      groupTitle,
      replyToText,
      history,
    };

    const now = new Date().toISOString();
    await db("job_queue").insert({
      executor: "muteworker",
      job_type: "telegram:incoming_message",
      data: JSON.stringify(payload),
      context: JSON.stringify({ channel: "telegram", chatId }),
      status: "pending",
      created_at: now,
      updated_at: now,
    });

    const displayName =
      [firstName, lastName].filter(Boolean).join(" ") || username || chatId;
    console.log(`[telegram] Queued incoming message from ${displayName}`);

    // Refresh conversation list
    loadRecentConversations(db).catch((err) =>
      console.error("[telegram] Failed to load recent conversations:", err),
    );
  });

  // Handle polling errors gracefully
  bot.on("polling_error", (err) => {
    console.error("[telegram] Polling error:", err.message);
  });
}

export async function disconnectTelegram(db: any) {
  if (tgState.bot) {
    await tgState.bot.stopPolling();
    tgState.bot = null;
  }
  tgState.connectionStatus = "disconnected";
  tgState.botUsername = null;
  tgState.botToken = null;

  await db("telegram_sessions").del();
  console.log("[telegram] Disconnected and session cleared.");
}
