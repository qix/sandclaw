import { readFile } from "node:fs/promises";
import type {
  MuteworkerPluginContext,
  RunAgentFn,
  RunAgentOptions,
} from "@sandclaw/muteworker-plugin-api";
import { buildEmailPrompt, type IncomingEmailPayload } from "./tools";

export const emailJobHandlers = {
  async "email:email_received"(
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

    const emailPrompt = buildEmailPrompt(payload);

    // If an email queue prompt matched, prepend it as system-level context
    const prompt = payload.emailQueuePrompt
      ? `--- Email Queue Instructions ---\n${payload.emailQueuePrompt}\n--- End Email Queue Instructions ---\n\n${emailPrompt}`
      : emailPrompt;

    // Read system prompt file if configured
    const options: RunAgentOptions = {};
    if (payload.systemPromptFile) {
      options.systemPrompt = await readFile(payload.systemPromptFile, "utf8");
    }

    await runAgent(prompt, options);
  },
};
