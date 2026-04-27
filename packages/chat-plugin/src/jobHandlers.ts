import type {
  MuteworkerPluginContext,
  RunAgentFn,
} from "@sandclaw/muteworker-plugin-api";
import { buildChatPrompt, type IncomingChatPayload } from "./tools";

export function createChatJobHandlers() {
  return {
    async "chat:incoming_message"(
      ctx: MuteworkerPluginContext,
      runAgent: RunAgentFn,
    ) {
      let payload: IncomingChatPayload;
      try {
        payload = JSON.parse(ctx.job.data) as IncomingChatPayload;
      } catch {
        throw new Error(`Job ${ctx.job.id} has invalid JSON in data`);
      }

      if (!payload.text)
        throw new Error(`Job ${ctx.job.id} payload missing text`);

      const prompt = buildChatPrompt(payload);
      // The agent's reply is dispatched by the muteworker core via the
      // job's `replyChannel` (set when the job is enqueued). No manual
      // dispatch here.
      await runAgent(prompt);
    },
  };
}
