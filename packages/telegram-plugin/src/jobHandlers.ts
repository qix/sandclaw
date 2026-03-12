import type {
  MuteworkerPluginContext,
  RunAgentFn,
} from "@sandclaw/muteworker-plugin-api";
import {
  buildTelegramPrompt,
  clampReply,
  type IncomingTelegramPayload,
} from "./tools";

export function createTelegramJobHandlers(
  operatorChatIds: ReadonlySet<string>,
) {
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

      // Send typing indicator while the agent works
      const sendTyping = () =>
        fetch(`${ctx.gatekeeperInternalUrl}/api/telegram/typing`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ chatId: payload.chatId }),
        }).catch(() => {});
      await sendTyping();
      const typingInterval = setInterval(sendTyping, 4000);

      const isOperator = operatorChatIds.has(String(payload.chatId));
      const prompt = buildTelegramPrompt(payload, isOperator);
      let result: Awaited<ReturnType<RunAgentFn>>;
      try {
        result = await runAgent(prompt);
      } finally {
        clearInterval(typingInterval);
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
              body: JSON.stringify({ chatId: jobCtx.chatId, text: reply, job: `muteworker:${ctx.job.id}` }),
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
