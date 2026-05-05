import { createReadStream, statSync } from "node:fs";
import { Readable } from "node:stream";
import { localTimestamp } from "@sandclaw/util";
import type { JobService } from "@sandclaw/gatekeeper-plugin-api";
import { tgState } from "./state";
import {
  connectTelegram,
  disconnectTelegram,
  deliverMessage,
} from "./connection";

export function registerRoutes(
  app: any,
  db: any,
  jobs: JobService,
  operatorChatIds: ReadonlySet<string>,
  openaiApiKey?: string | null,
) {
  // GET /status — current connection state
  app.get("/status", (_c: any) => {
    return _c.json({
      status: tgState.connectionStatus,
      botUsername: tgState.botUsername,
    });
  });

  // POST /connect — accepts { token }, validates via getMe, starts polling
  app.post("/connect", async (c: any) => {
    let token: string;

    const contentType = c.req.header("content-type") || "";
    if (contentType.includes("application/json")) {
      const body = await c.req.json();
      token = body.token;
    } else {
      // Handle form submission
      const body = await c.req.parseBody();
      token = body.token as string;
    }

    if (!token || typeof token !== "string" || !token.trim()) {
      return c.json({ error: "token is required" }, 400);
    }

    token = token.trim();

    try {
      await connectTelegram(db, jobs, token, openaiApiKey);
      // If this was a form submission, redirect back to the plugin page
      if (!contentType.includes("application/json")) {
        return c.redirect("/?tab=telegram");
      }
      return c.json({ status: "connected", botUsername: tgState.botUsername });
    } catch (err: any) {
      tgState.connectionStatus = "disconnected";
      tgState.bot = null;
      tgState.botToken = null;
      const message = err?.message || "Failed to connect";
      if (!contentType.includes("application/json")) {
        return c.redirect("/?tab=telegram");
      }
      return c.json({ error: message }, 400);
    }
  });

  // POST /disconnect — stops bot, clears session
  app.post("/disconnect", async (c: any) => {
    await disconnectTelegram(db);
    const contentType = c.req.header("content-type") || "";
    if (!contentType.includes("application/json")) {
      return c.redirect("/?tab=telegram");
    }
    return c.json({ status: "disconnected" });
  });

  // POST /typing — send a "typing" chat action to a chat
  app.post("/typing", async (c: any) => {
    const body = await c.req.json();
    const { chatId } = body;

    if (!chatId || typeof chatId !== "string") {
      return c.json({ error: "chatId is required" }, 400);
    }

    if (!tgState.bot) {
      return c.json({ error: "Telegram bot not connected" }, 503);
    }

    try {
      await tgState.bot.sendChatAction(chatId, "typing");
      return c.json({ success: true });
    } catch (err: any) {
      return c.json(
        { error: err?.message || "Failed to send typing action" },
        500,
      );
    }
  });

  // POST /send — create a verification request for sending a message
  app.post("/send", async (c: any) => {
    const body = await c.req.json();
    const { chatId, text, jobContext } = body;

    if (!chatId || !text) {
      return c.json({ error: "chatId and text are required" }, 400);
    }

    const autoApprove = operatorChatIds.has(chatId);
    const now = localTimestamp();
    const [{ id }] = await db("verification_requests")
      .insert({
        plugin: "telegram",
        action: "send_message",
        data: JSON.stringify({ chatId, text }),
        status: autoApprove ? "approved" : "pending",
        ...(jobContext ? { job_context: JSON.stringify(jobContext) } : {}),
        created_at: now,
        updated_at: now,
      })
      .returning("id");

    if (autoApprove) {
      try {
        await deliverMessage(db, chatId, text);
      } catch (err) {
        console.error("[telegram] Failed to deliver message:", err);
        return c.json(
          { error: `Telegram send failed: ${(err as Error).message}` },
          503,
        );
      }
    }

    return c.json({
      verificationRequestId: id,
      verificationStatus: autoApprove ? "approved" : "pending",
    });
  });

  // GET /attachment/:id — stream a stored photo (or other media) back. Used by
  // the muteworker job handler to fetch attachments from the gatekeeper.
  app.get("/attachment/:id", async (c: any) => {
    const id = Number(c.req.param("id"));
    if (!Number.isFinite(id) || id <= 0) {
      return c.json({ error: "invalid id" }, 400);
    }
    const row = await db("telegram_attachments").where({ id }).first();
    if (!row) {
      return c.json({ error: "attachment not found" }, 404);
    }
    let size: number;
    try {
      size = statSync(row.file_path).size;
    } catch {
      return c.json({ error: "attachment file missing" }, 410);
    }
    const stream = Readable.toWeb(createReadStream(row.file_path));
    return c.body(stream as any, 200, {
      "Content-Type": row.mime_type ?? "application/octet-stream",
      "Content-Length": String(size),
      "X-Telegram-Attachment-Id": String(row.id),
      "X-Telegram-Attachment-Kind": row.kind,
    });
  });
}
