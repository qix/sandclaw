import type {
  MuteworkerPluginContext,
  RunAgentFn,
} from "@sandclaw/muteworker-plugin-api";

export const browserJobHandlers = {
  async "browser:response"(ctx: MuteworkerPluginContext, runAgent: RunAgentFn) {
    let payload: { requestId: string; result?: string; error?: string };
    try {
      payload = JSON.parse(ctx.job.data);
    } catch {
      throw new Error(`Job ${ctx.job.id} has invalid JSON in data`);
    }

    const failed = payload.error !== undefined;

    ctx.logger.info("browser.result.received", {
      jobId: ctx.job.id,
      requestId: payload.requestId,
      failed,
    });

    ctx.artifacts.push({
      type: "text",
      label: failed ? "Browse Error" : "Browse Result",
      value: (failed ? payload.error! : payload.result ?? "").slice(0, 200),
    });

    const prompt = failed
      ? [
          "--- Browse Request Failed ---",
          `Request ID: ${payload.requestId}`,
          "",
          "The browse request did not complete successfully. Error:",
          "",
          payload.error,
          "",
          "Decide how to proceed. If the failure looks fixable (e.g. a bad URL,",
          "an unclear or malformed prompt, or a transient issue), submit a new",
          "browse request via the request_browse tool with the corrections.",
          "If the failure is not fixable, summarize what went wrong and stop.",
          "-----------------------------",
        ].join("\n")
      : [
          "--- Browse Result ---",
          `Request ID: ${payload.requestId}`,
          "",
          payload.result,
          "---------------------",
        ].join("\n");

    await runAgent(prompt);
  },
};
