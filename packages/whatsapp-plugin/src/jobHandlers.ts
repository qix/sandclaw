import type { MuteworkerPluginContext, RunAgentFn } from '@sandclaw/muteworker-plugin-api';
import { buildWhatsappPrompt, clampReply, type IncomingWhatsappPayload } from './tools';

export function createWhatsappJobHandlers(operatorJids: ReadonlySet<string>) {
  return {
    async 'whatsapp:incoming_message'(ctx: MuteworkerPluginContext, runAgent: RunAgentFn) {
      let payload: IncomingWhatsappPayload;
      try {
        payload = JSON.parse(ctx.job.data) as IncomingWhatsappPayload;
      } catch {
        throw new Error(`Job ${ctx.job.id} has invalid JSON in data`);
      }

      if (!payload.jid) throw new Error(`Job ${ctx.job.id} payload missing jid`);

      const isOperator = operatorJids.has(payload.jid);
      const prompt = buildWhatsappPrompt(payload, isOperator);
      const result = await runAgent(prompt);

      if (result.reply && ctx.job.context) {
        try {
          const jobCtx = JSON.parse(ctx.job.context) as Record<string, unknown>;
          if (jobCtx.channel === 'whatsapp' && typeof jobCtx.jid === 'string') {
            const reply = clampReply(result.reply);
            await fetch(`${ctx.apiBaseUrl}/api/whatsapp/send`, {
              method: 'POST',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify({ jid: jobCtx.jid, text: reply }),
            });

            ctx.artifacts.push({ type: 'text', label: 'Auto-Reply', value: reply });
            ctx.logger.info('whatsapp.auto_reply', { jobId: ctx.job.id, jid: jobCtx.jid });
          }
        } catch {
          ctx.logger.warn('whatsapp.auto_reply.failed', { jobId: ctx.job.id });
        }
      }
    },
  };
}
