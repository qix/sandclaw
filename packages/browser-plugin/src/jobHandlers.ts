import type {
  MuteworkerPluginContext,
  RunAgentFn,
} from "@sandclaw/muteworker-plugin-api";

export const browserJobHandlers = {
  async "browser:research_result"(
    ctx: MuteworkerPluginContext,
    runAgent: RunAgentFn,
  ) {
    let payload: { requestId: string; result: string };
    try {
      payload = JSON.parse(ctx.job.data);
    } catch {
      throw new Error(`Job ${ctx.job.id} has invalid JSON in data`);
    }

    ctx.logger.info("browser.result.received", {
      jobId: ctx.job.id,
      requestId: payload.requestId,
    });

    ctx.artifacts.push({
      type: "text",
      label: "Browser Result",
      value: payload.result.slice(0, 200),
    });

    const prompt = [
      "--- Browser Research Result ---",
      `Request ID: ${payload.requestId}`,
      "",
      payload.result,
      "-------------------------------",
    ].join("\n");

    await runAgent(prompt);
  },
};
