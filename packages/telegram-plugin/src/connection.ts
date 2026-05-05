import { createWriteStream, existsSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import TelegramBot from "node-telegram-bot-api";
import type { ConversationSummary } from "@sandclaw/ui";
import { localTimestamp } from "@sandclaw/util";
import type { JobService } from "@sandclaw/gatekeeper-plugin-api";
import { createContext } from "@sandclaw/gatekeeper-plugin-api";
import { tgState } from "./state";
import { transcribeVoiceMessage } from "./transcribe";

interface StoredAttachment {
  id: number;
  kind: "photo";
  mimeType: string | null;
  fileSize: number | null;
}

/** Look up or create a conversation row for the given chat ID, returning its auto-increment ID. */
export async function getOrCreateConversationId(
  db: any,
  chatId: string,
): Promise<number> {
  const existing = await db("conversations")
    .where({ plugin: "telegram", channel: "telegram", external_id: chatId })
    .first();
  if (existing) return existing.id;
  const [{ id }] = await db("conversations")
    .insert({
      plugin: "telegram",
      channel: "telegram",
      external_id: chatId,
      created_at: localTimestamp(),
    })
    .returning("id");
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
    timestamp: localTimestamp(),
    direction: "outbound",
    text,
    created_at: localTimestamp(),
  });

  loadRecentConversations(db).catch((err) =>
    console.error("[telegram] Failed to load recent conversations:", err),
  );
}

export async function connectTelegram(
  db: any,
  jobs: JobService,
  token: string,
  openaiApiKey?: string | null,
) {
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
    last_heartbeat: localTimestamp(),
    updated_at: localTimestamp(),
  });

  console.log(`[telegram] Connected as @${tgState.botUsername}`);

  // Handle incoming messages
  bot.on("message", async (msg) => {
    const chatId = String(msg.chat.id);
    const messageId = String(msg.message_id);
    const photos = Array.isArray(msg.photo) && msg.photo.length > 0
      ? msg.photo
      : null;
    const caption = msg.caption ?? null;

    // Determine text content: prefer explicit text, then caption, then a
    // transcribed voice note. We only transcribe when there's no text/caption
    // already present so we don't waste a Whisper call on voice notes that
    // also carry a typed caption.
    let text: string | null = msg.text ?? caption ?? null;
    let transcribedFromVoice = false;

    if (!text && msg.voice) {
      if (!openaiApiKey) {
        console.warn(
          "[telegram] Received voice message but no OPENAI_API_KEY configured — ignoring",
        );
        try {
          await bot.sendMessage(
            chatId,
            "Sorry, voice message transcription is not configured. Please send a text message instead.",
          );
        } catch {}
        return;
      }

      try {
        text = await transcribeVoiceMessage(
          bot,
          msg.voice.file_id,
          openaiApiKey,
        );
        transcribedFromVoice = true;
        console.log(
          `[telegram] Transcribed voice message (${msg.voice.duration}s) from chat ${msg.chat.id}`,
        );
      } catch (err) {
        console.error("[telegram] Voice transcription failed:", err);
        try {
          await bot.sendMessage(
            chatId,
            "Sorry, I couldn't transcribe your voice message. Please try again or send a text message.",
          );
        } catch {}
        return;
      }
    }

    if (!text && !photos) return; // ignore unsupported media (stickers, video, etc.)

    let attachments: StoredAttachment[] = [];
    if (photos) {
      try {
        attachments = await persistPhotoAttachment(
          db,
          bot,
          chatId,
          messageId,
          photos,
          caption,
        );
      } catch (err) {
        console.error("[telegram] Failed to persist photo:", err);
      }
    }

    const messageBody = buildInboundMessageText(text, attachments);
    const timestamp = localTimestamp(new Date(msg.date * 1000));
    const firstName = msg.from?.first_name ?? null;
    const lastName = msg.from?.last_name ?? null;
    const username = msg.from?.username ?? null;
    const isGroup = msg.chat.type === "group" || msg.chat.type === "supergroup";
    const groupTitle = isGroup ? (msg.chat.title ?? null) : null;

    const replyToText = msg.reply_to_message?.text ?? null;

    await db.transaction(async (trx: any) => {
      const ctx = createContext({ trx });
      const conversationId = await getOrCreateConversationId(trx, chatId);

      // Store in conversation_message
      await trx("conversation_message").insert({
        conversation_id: conversationId,
        plugin: "telegram",
        channel: "telegram",
        message_id: messageId,
        thread_id: chatId,
        from: chatId,
        to: tgState.botUsername,
        timestamp,
        direction: "inbound",
        text: messageBody,
        created_at: localTimestamp(),
      });

      // Fetch recent history for context
      const recentMessages = await trx("conversation_message")
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

      // Build payload and enqueue via JobService so interceptors can act.
      const payload = {
        messageId,
        chatId,
        firstName,
        lastName,
        username,
        timestamp,
        text: text ?? null,
        caption,
        isGroup,
        groupTitle,
        replyToText,
        transcribedFromVoice,
        history,
        attachments,
      };

      await jobs.createJob(ctx, {
        executor: "muteworker",
        jobType: "telegram:incoming_message",
        data: payload,
        context: { channel: "telegram", chatId },
      });
    });

    const displayName =
      [firstName, lastName].filter(Boolean).join(" ") || username || chatId;
    const msgType = transcribedFromVoice ? "voice message" : "message";
    console.log(`[telegram] Queued incoming ${msgType} from ${displayName}`);

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

function buildInboundMessageText(
  text: string | null | undefined,
  attachments: StoredAttachment[],
): string {
  const parts: string[] = [];
  if (attachments.length > 0) {
    const photoCount = attachments.filter((a) => a.kind === "photo").length;
    if (photoCount > 0) {
      parts.push(photoCount === 1 ? "[Photo]" : `[${photoCount} photos]`);
    }
  }
  if (text && text.trim()) parts.push(text);
  return parts.join(" ").trim() || "[Empty message]";
}

async function persistPhotoAttachment(
  db: any,
  bot: TelegramBot,
  chatId: string,
  messageId: string,
  photos: Array<{ file_id: string; file_unique_id: string; file_size?: number }>,
  caption: string | null,
): Promise<StoredAttachment[]> {
  if (!tgState.photosDir) {
    throw new Error("photosDir not configured");
  }
  const largest = photos[photos.length - 1];

  // De-dupe: if we've already stored this exact photo (same file_unique_id) for
  // this chat, reuse the existing row + file.
  const existing = await db("telegram_attachments")
    .where({ chat_id: chatId, file_unique_id: largest.file_unique_id })
    .first();
  if (existing) {
    return [
      {
        id: existing.id,
        kind: "photo",
        mimeType: existing.mime_type,
        fileSize: existing.file_size,
      },
    ];
  }

  // Resolve telegram's stored path so we can pick a sensible extension.
  const fileMeta = await bot.getFile(largest.file_id);
  const remotePath = (fileMeta as any).file_path as string | undefined;
  const ext = remotePath ? path.extname(remotePath) || ".jpg" : ".jpg";
  const chatDir = path.join(tgState.photosDir, chatId);
  await mkdir(chatDir, { recursive: true });
  const target = path.join(chatDir, `${largest.file_unique_id}${ext}`);

  if (!existsSync(target)) {
    const stream = bot.getFileStream(largest.file_id);
    await pipeline(stream, createWriteStream(target));
  }

  const mimeType =
    ext === ".png"
      ? "image/png"
      : ext === ".webp"
        ? "image/webp"
        : ext === ".gif"
          ? "image/gif"
          : "image/jpeg";

  const [{ id }] = await db("telegram_attachments")
    .insert({
      message_id: messageId,
      chat_id: chatId,
      kind: "photo",
      file_path: target,
      file_unique_id: largest.file_unique_id,
      mime_type: mimeType,
      file_size: largest.file_size ?? null,
      caption,
      created_at: localTimestamp(),
    })
    .returning("id");

  return [
    {
      id,
      kind: "photo",
      mimeType,
      fileSize: largest.file_size ?? null,
    },
  ];
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
