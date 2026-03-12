import type { ConfidantePluginContext } from "@sandclaw/confidante-plugin-api";
import { GWS_CONFIDANTE_JOB_TYPE, GWS_RESULT_JOB_TYPE } from "./constants";
import { gwsExec, type GoogleWorkspacePluginConfig } from "./gwsClient";

interface GwsExecPayload {
  requestId: string;
  command: string[];
  responseJobType?: string;
  jobContext?: { worker: string; jobId: number };
}

export function createGwsConfidanteHandlers(
  config: GoogleWorkspacePluginConfig,
) {
  return {
    async [GWS_CONFIDANTE_JOB_TYPE](
      ctx: ConfidantePluginContext,
    ): Promise<void> {
      let payload: GwsExecPayload;
      try {
        payload = JSON.parse(ctx.job.data);
      } catch {
        throw new Error(`Job ${ctx.job.id} has invalid JSON in data`);
      }

      const {
        requestId,
        command,
        responseJobType = GWS_RESULT_JOB_TYPE,
        jobContext,
      } = payload;

      ctx.logger.info("gws.exec.executing", {
        jobId: ctx.job.id,
        requestId,
        command,
      });

      const args = command.filter(
        (a): a is string => typeof a === "string",
      );

      // Add --format json if not already present
      if (!args.includes("--format")) {
        args.push("--format", "json");
      }

      const execResult = await gwsExec(config, args);

      ctx.logger.info("gws.exec.completed", {
        jobId: ctx.job.id,
        requestId,
        exitCode: execResult.exitCode,
      });

      const resultParts = [
        `gws command completed (exit code: ${execResult.exitCode}).`,
      ];
      if (execResult.stdout) {
        resultParts.push("", "--- stdout ---", execResult.stdout);
      }
      if (execResult.stderr) {
        resultParts.push("", "--- stderr ---", execResult.stderr);
      }
      if (!execResult.stdout && !execResult.stderr) {
        resultParts.push("No output returned.");
      }
      const result = resultParts.join("\n");

      const response = await fetch(
        `${ctx.gatekeeperInternalUrl}/api/confidante/result`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            requestId,
            responseJobType,
            result,
            ...(jobContext ? { jobContext } : {}),
          }),
        },
      );

      if (!response.ok) {
        const body = await response.text().catch(() => "");
        throw new Error(
          `Failed to post gws result (${response.status}): ${body.slice(0, 200)}`,
        );
      }

      ctx.logger.info("gws.exec.result_posted", {
        jobId: ctx.job.id,
        requestId,
      });
    },
  };
}
