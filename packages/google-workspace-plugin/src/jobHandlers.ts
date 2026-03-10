import type {
  MuteworkerPluginContext,
  RunAgentFn,
} from "@sandclaw/muteworker-plugin-api";
import { GWS_RESULT_JOB_TYPE } from "./constants";

export const gwsJobHandlers = {
  async [GWS_RESULT_JOB_TYPE](
    ctx: MuteworkerPluginContext,
    runAgent: RunAgentFn,
  ) {
    let payload: { requestId: string; result: string };
    try {
      payload = JSON.parse(ctx.job.data);
    } catch {
      throw new Error(`Job ${ctx.job.id} has invalid JSON in data`);
    }

    ctx.logger.info("gws.result.received", {
      jobId: ctx.job.id,
      requestId: payload.requestId,
    });

    ctx.artifacts.push({
      type: "text",
      label: "GWS Exec Result",
      value: payload.result.slice(0, 200),
    });

    const prompt = [
      "--- Google Workspace Exec Result ---",
      `Request ID: ${payload.requestId}`,
      "",
      payload.result,
      "------------------------------------",
    ].join("\n");

    await runAgent(prompt);
  },
};
