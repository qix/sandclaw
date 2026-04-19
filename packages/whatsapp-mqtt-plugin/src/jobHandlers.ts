import type {
  MuteworkerPluginContext,
  RunAgentFn,
} from "@sandclaw/muteworker-plugin-api";
import {
  buildWhatsappMqttPrompt,
  clampReply,
  type IncomingWhatsappMqttPayload,
} from "./tools";

export function createWhatsappMqttJobHandlers(operatorJids: ReadonlySet<string>, modelId?: string) {
  return {
    async "whatsapp-mqtt:incoming_message"(
      ctx: MuteworkerPluginContext,
      runAgent: RunAgentFn,
    ) {
      let payload: IncomingWhatsappMqttPayload;
      try {
        payload = JSON.parse(ctx.job.data) as IncomingWhatsappMqttPayload;
      } catch {
        throw new Error(`Job ${ctx.job.id} has invalid JSON in data`);
      }

      if (!payload.jid)
        throw new Error(`Job ${ctx.job.id} payload missing jid`);

      const isOperator = operatorJids.has(payload.jid);
      const prompt = buildWhatsappMqttPrompt(payload, isOperator);
      const result = await runAgent(prompt, modelId ? { modelId } : undefined);

      if (result.reply && ctx.job.context) {
        try {
          const jobCtx = JSON.parse(ctx.job.context) as Record<string, unknown>;
          if (jobCtx.channel === "whatsapp-mqtt" && typeof jobCtx.jid === "string") {
            const reply = clampReply(result.reply);
            await fetch(`${ctx.gatekeeperInternalUrl}/api/whatsapp-mqtt/send`, {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({
                jid: jobCtx.jid,
                text: reply,
                jobContext: { worker: "muteworker", jobId: ctx.job.id },
              }),
            });

            ctx.artifacts.push({
              type: "text",
              label: "Auto-Reply",
              value: reply,
            });
            ctx.logger.info("whatsapp_mqtt.auto_reply", {
              jobId: ctx.job.id,
              jid: jobCtx.jid,
            });
          }
        } catch {
          ctx.logger.warn("whatsapp_mqtt.auto_reply.failed", { jobId: ctx.job.id });
        }
      }
    },
  };
}
