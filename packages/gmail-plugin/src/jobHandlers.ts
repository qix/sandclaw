import type {
  MuteworkerPluginContext,
  RunAgentFn,
} from "@sandclaw/muteworker-plugin-api";
import { buildEmailPrompt, type IncomingEmailPayload } from "./tools";

export const gmailJobHandlers = {
  async "gmail:incoming_email"(
    ctx: MuteworkerPluginContext,
    runAgent: RunAgentFn,
  ) {
    let payload: IncomingEmailPayload;
    try {
      payload = JSON.parse(ctx.job.data) as IncomingEmailPayload;
    } catch {
      throw new Error(`Job ${ctx.job.id} has invalid JSON in data`);
    }

    if (!payload.from)
      throw new Error(`Job ${ctx.job.id} payload missing from`);

    const prompt = buildEmailPrompt(payload);
    await runAgent(prompt);
  },
};
