import type { ConfidantePluginContext } from "@sandclaw/confidante-plugin-api";
import {
  runDockerPi,
  runDockerCommand,
  prepareWorkDir,
  detectAndCommitChanges,
} from "@sandclaw/confidante-util";
import {
  BUILDER_CONFIDANTE_JOB_TYPE,
  DEFAULT_BUILDER_RESULT_JOB_TYPE,
} from "./constants";

interface BuildRequestPayload {
  requestId: string;
  prompt: string;
  repo: string;
  branch?: string;
  image?: string;
  responseJobType?: string;
}

export interface BuilderConfidanteConfig {
  workDir: string;
}

export function createBuilderConfidanteHandlers(
  config: BuilderConfidanteConfig,
) {
  const { workDir } = config;

  return {
    async [BUILDER_CONFIDANTE_JOB_TYPE](
      ctx: ConfidantePluginContext,
    ): Promise<void> {
      let payload: BuildRequestPayload;
      try {
        payload = JSON.parse(ctx.job.data);
      } catch {
        throw new Error(`Job ${ctx.job.id} has invalid JSON in data`);
      }

      const {
        requestId,
        prompt,
        repo,
        branch = "main",
        image = "builder-plugin",
        responseJobType = DEFAULT_BUILDER_RESULT_JOB_TYPE,
      } = payload;

      ctx.logger.info("builder.confidante.executing", {
        jobId: ctx.job.id,
        requestId,
        prompt,
        repo,
        workDir,
      });

      // Step 1: Prepare working directory (clone or verify clean)
      await prepareWorkDir({ repo, workDir, branch });

      // Step 2: npm install in Docker
      ctx.logger.info("builder.confidante.npm_install", {
        jobId: ctx.job.id,
        requestId,
      });
      const npmResult = await runDockerCommand({
        image,
        command: ["npm", "install"],
        dockerArgs: ["-v", `${workDir}:/workspace`],
      });

      if (npmResult.exitCode !== 0) {
        throw new Error(
          `npm install failed with exit code ${npmResult.exitCode}`,
        );
      }

      // Step 3: Run pi in Docker with firewall + prompt
      ctx.logger.info("builder.confidante.running_pi", {
        jobId: ctx.job.id,
        requestId,
      });
      const { finalReply, exitCode: piExitCode } = await runDockerPi({
        image,
        prompt,
        dockerArgs: [
          "--cap-add=NET_ADMIN",
          "--cap-add=NET_RAW",
          "-v",
          `${workDir}:/workspace`,
          "-e",
          `PI_PROMPT=${prompt}`,
        ],
        command: [
          "bash",
          "-c",
          'sudo /usr/local/bin/init-firewall.sh && pi --mode json --print "$PI_PROMPT"',
        ],
      });

      ctx.logger.info("builder.confidante.pi_completed", {
        jobId: ctx.job.id,
        requestId,
        piExitCode,
      });

      // Step 4: Detect and commit changes
      const commitResult = detectAndCommitChanges({
        workDir,
        commitMessage: prompt,
      });

      ctx.logger.info("builder.confidante.commit_result", {
        jobId: ctx.job.id,
        requestId,
        changed: commitResult.changed,
        headBefore: commitResult.headBefore,
        headAfter: commitResult.headAfter,
      });

      // Build result summary
      const resultParts = [
        `Build completed (pi exit code: ${piExitCode}).`,
        commitResult.changed
          ? `Changes committed: ${commitResult.headBefore.slice(0, 8)}..${commitResult.headAfter.slice(0, 8)}`
          : "No changes detected.",
      ];
      if (finalReply) {
        resultParts.push("", "--- Pi Reply ---", finalReply);
      }
      const result = resultParts.join("\n");

      // Post result back to gatekeeper
      const response = await fetch(`${ctx.apiBaseUrl}/api/builder/result`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          requestId,
          responseJobType,
          result,
        }),
      });

      if (!response.ok) {
        const body = await response.text().catch(() => "");
        throw new Error(
          `Failed to post builder result (${response.status}): ${body.slice(0, 200)}`,
        );
      }

      ctx.logger.info("builder.confidante.result.posted", {
        jobId: ctx.job.id,
        requestId,
      });
    },
  };
}
