import type { ConfidantePluginContext } from "@sandclaw/confidante-plugin-api";
import {
  BROWSER_CONFIDANTE_JOB_TYPE,
  DEFAULT_BROWSER_RESULT_JOB_TYPE,
} from "./constants";

export const browserConfidanteHandlers = {
  async [BROWSER_CONFIDANTE_JOB_TYPE](
    ctx: ConfidantePluginContext,
  ): Promise<void> {
    let payload: {
      requestId: string;
      prompt: string;
      responseJobType?: string;
    };
    try {
      payload = JSON.parse(ctx.job.data);
    } catch {
      throw new Error(`Job ${ctx.job.id} has invalid JSON in data`);
    }

    ctx.logger.info("browser.confidante.executing", {
      jobId: ctx.job.id,
      requestId: payload.requestId,
      prompt: payload.prompt,
    });

    // Run the browser work inside a Docker container
    const result = await ctx.docker.run("alpine:latest", [
      "echo",
      "hello from inside docker",
    ]);

    if (result.exitCode !== 0) {
      throw new Error(
        `Docker command failed (exit ${result.exitCode}): ${result.stderr}`,
      );
    }

    const output = result.stdout.trim();

    ctx.logger.info("browser.confidante.docker.result", {
      jobId: ctx.job.id,
      requestId: payload.requestId,
      output,
    });

    // Post the result back to the gatekeeper's browser result endpoint,
    // which enqueues it on the safe_queue as a browser:result job
    const responseJobType =
      payload.responseJobType || DEFAULT_BROWSER_RESULT_JOB_TYPE;
    const response = await fetch(`${ctx.gatekeeperInternalUrl}/api/browser/result`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        requestId: payload.requestId,
        responseJobType,
        result: output,
      }),
    });

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      throw new Error(
        `Failed to post browser result (${response.status}): ${body.slice(0, 200)}`,
      );
    }

    ctx.logger.info("browser.confidante.result.posted", {
      jobId: ctx.job.id,
      requestId: payload.requestId,
    });
  },
};
