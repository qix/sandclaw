import { createWriteStream } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import os from "node:os";
import path from "node:path";
import type {
  MuteworkerPluginContext,
  RunAgentFn,
} from "@sandclaw/muteworker-plugin-api";
import {
  buildTelegramPrompt,
  clampReply,
  type IncomingTelegramAttachment,
  type IncomingTelegramPayload,
  type LocalAttachment,
} from "./tools";

const EXT_BY_MIME: Record<string, string> = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
  "image/gif": ".gif",
};

async function downloadAttachment(
  ctx: MuteworkerPluginContext,
  dir: string,
  attachment: IncomingTelegramAttachment,
): Promise<LocalAttachment> {
  const url = `${ctx.gatekeeperInternalUrl}/api/telegram/attachment/${attachment.id}`;
  const response = await fetch(url);
  if (!response.ok || !response.body) {
    throw new Error(
      `Failed to download attachment ${attachment.id}: ${response.status}`,
    );
  }
  const mimeType =
    response.headers.get("content-type") ?? attachment.mimeType ?? null;
  const ext = (mimeType && EXT_BY_MIME[mimeType]) ?? ".bin";
  const localPath = path.join(dir, `${attachment.id}${ext}`);
  await pipeline(
    Readable.fromWeb(response.body as any),
    createWriteStream(localPath),
  );
  return {
    id: attachment.id,
    kind: attachment.kind,
    localPath,
    mimeType,
  };
}

export interface TelegramJobHandlerOptions {
  conversationLogFile?: string | null;
}

export function createTelegramJobHandlers(
  operatorChatIds: ReadonlySet<string>,
  options: TelegramJobHandlerOptions = {},
) {
  const conversationLogFile = options.conversationLogFile ?? null;
  return {
    async "telegram:incoming_message"(
      ctx: MuteworkerPluginContext,
      runAgent: RunAgentFn,
    ) {
      let payload: IncomingTelegramPayload;
      try {
        payload = JSON.parse(ctx.job.data) as IncomingTelegramPayload;
      } catch {
        throw new Error(`Job ${ctx.job.id} has invalid JSON in data`);
      }

      if (!payload.chatId)
        throw new Error(`Job ${ctx.job.id} payload missing chatId`);

      // Download any attachments to a per-job tmp dir so Claude's Read tool
      // can pick them up locally. Cleaned up in `finally` below.
      let tmpDir: string | null = null;
      const localAttachments: LocalAttachment[] = [];
      if (payload.attachments?.length) {
        tmpDir = await mkdtemp(
          path.join(os.tmpdir(), `sandclaw-telegram-${ctx.job.id}-`),
        );
        for (const att of payload.attachments) {
          try {
            const local = await downloadAttachment(ctx, tmpDir, att);
            localAttachments.push(local);
            ctx.artifacts.push({
              type: "text",
              label: `Attachment (${att.kind})`,
              value: local.localPath,
            });
          } catch (err) {
            ctx.logger.warn("telegram.attachment.download_failed", {
              jobId: ctx.job.id,
              attachmentId: att.id,
              error: (err as Error).message,
            });
          }
        }
      }

      // Send typing indicator while the agent works
      const sendTyping = () =>
        fetch(`${ctx.gatekeeperInternalUrl}/api/telegram/typing`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ chatId: payload.chatId }),
        }).catch((err) =>
          console.error("[telegram] Failed to send typing action:", err),
        );
      await sendTyping();
      const typingInterval = setInterval(sendTyping, 4000);

      const isOperator = operatorChatIds.has(String(payload.chatId));
      const prompt = buildTelegramPrompt(
        payload,
        isOperator,
        localAttachments,
        { conversationLogFile },
      );
      let result: Awaited<ReturnType<RunAgentFn>>;
      try {
        result = await runAgent(prompt);
      } finally {
        clearInterval(typingInterval);
        if (tmpDir) {
          await rm(tmpDir, { recursive: true, force: true }).catch((err) =>
            ctx.logger.warn("telegram.attachment.cleanup_failed", {
              jobId: ctx.job.id,
              error: (err as Error).message,
            }),
          );
        }
      }

      if (result.reply && ctx.job.context) {
        try {
          const jobCtx = JSON.parse(ctx.job.context) as Record<string, unknown>;
          if (
            jobCtx.channel === "telegram" &&
            typeof jobCtx.chatId === "string"
          ) {
            const reply = clampReply(result.reply);
            await fetch(`${ctx.gatekeeperInternalUrl}/api/telegram/send`, {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({
                chatId: jobCtx.chatId,
                text: reply,
                jobContext: { worker: "muteworker", jobId: ctx.job.id },
              }),
            });
            ctx.artifacts.push({
              type: "text",
              label: "Auto-Reply",
              value: reply,
            });
            ctx.logger.info("telegram.auto_reply", {
              jobId: ctx.job.id,
              chatId: jobCtx.chatId,
            });
          }
        } catch {
          ctx.logger.warn("telegram.auto_reply.failed", { jobId: ctx.job.id });
        }
      }
    },
  };
}
