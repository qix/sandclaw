import { readFile } from "node:fs/promises";
import type {
  MuteworkerPluginContext,
  RunAgentFn,
  RunAgentOptions,
} from "@sandclaw/muteworker-plugin-api";
import {
  buildEmailPrompt,
  buildCalendarInvitePrompt,
  type IncomingEmailPayload,
  type CalendarInvitePayload,
} from "./tools";

export function createEmailJobHandlers(options: { systemPromptFile?: string }) {
  return {
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
      const agentOptions: RunAgentOptions = {};
      if (options.systemPromptFile) {
        agentOptions.systemPrompt = await readFile(
          options.systemPromptFile,
          "utf8",
        );
      }

      await runAgent(prompt, agentOptions);
    },

    async "email:calendar_invite_received"(
      ctx: MuteworkerPluginContext,
      runAgent: RunAgentFn,
    ) {
      let payload: CalendarInvitePayload;
      try {
        payload = JSON.parse(ctx.job.data) as CalendarInvitePayload;
      } catch {
        throw new Error(`Job ${ctx.job.id} has invalid JSON in data`);
      }

      if (!payload.eventId)
        throw new Error(`Job ${ctx.job.id} payload missing eventId`);

      const prompt = buildCalendarInvitePrompt(payload);

      // Read system prompt file if configured
      const agentOptions: RunAgentOptions = {};
      const systemPromptFile =
        payload.systemPromptFile || options.systemPromptFile;
      if (systemPromptFile) {
        try {
          agentOptions.systemPrompt = await readFile(systemPromptFile, "utf8");
        } catch {
          // System prompt file not found — continue without it
        }
      }

      await runAgent(prompt, agentOptions);
    },
  };
}
