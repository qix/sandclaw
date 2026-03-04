import type { MuteworkerPluginContext, RunAgentFn } from '@sandclaw/muteworker-plugin-api';
import { buildChatPrompt, clampReply, type IncomingChatPayload } from './tools';

export function createChatJobHandlers() {
  return {
    async 'chat:incoming_message'(ctx: MuteworkerPluginContext, runAgent: RunAgentFn) {
      let payload: IncomingChatPayload;
      try {
        payload = JSON.parse(ctx.job.data) as IncomingChatPayload;
      } catch {
        throw new Error(`Job ${ctx.job.id} has invalid JSON in data`);
      }

      if (!payload.text) throw new Error(`Job ${ctx.job.id} payload missing text`);

      const prompt = buildChatPrompt(payload);
      const result = await runAgent(prompt);

      if (result.reply) {
        try {
          const reply = clampReply(result.reply);
          await fetch(`${ctx.apiBaseUrl}/api/chat/send`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ text: reply }),
          });

          ctx.artifacts.push({ type: 'text', label: 'Chat Auto-Reply', value: reply });
          ctx.logger.info('chat.auto_reply', { jobId: ctx.job.id });
        } catch {
          ctx.logger.warn('chat.auto_reply.failed', { jobId: ctx.job.id });
        }
      }
    },
  };
}
