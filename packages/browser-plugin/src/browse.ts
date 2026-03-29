import type { ConfidantePluginContext } from "@sandclaw/confidante-plugin-api";
import { localTimestamp } from "@sandclaw/util";
import { runDockerBrowser } from "./docker";
import { DEFAULT_BROWSER_RESULT_JOB_TYPE } from "./constants";

interface BrowseRequestPayload {
  requestId: string;
  prompt: string;
  url?: string;
  image?: string;
  responseJobType?: string;
}

export interface BrowseConfig {
  image?: string;
  /** Resolves when the Docker image build finishes. Await before running. */
  buildReady?: Promise<void>;
}

export async function executeBrowse(
  ctx: ConfidantePluginContext,
  config: BrowseConfig,
): Promise<void> {
  let payload: BrowseRequestPayload;
  try {
    payload = JSON.parse(ctx.job.data);
  } catch {
    throw new Error(`Job ${ctx.job.id} has invalid JSON in data`);
  }

  const {
    requestId,
    prompt,
    url,
    image = config.image ?? "browser-plugin",
    responseJobType = DEFAULT_BROWSER_RESULT_JOB_TYPE,
  } = payload;

  ctx.logger.info("browser.browse.executing", {
    jobId: ctx.job.id,
    requestId,
    prompt,
    url,
  });

  if (config.buildReady) {
    ctx.logger.info("browser.browse.waiting_for_build", {
      jobId: ctx.job.id,
    });
    await config.buildReady;
  }

  const { finalResult, exitCode } = await runDockerBrowser({
    image,
    prompt,
    url,
    onStatus: ctx.reportStatus
      ? (event) => {
          ctx.reportStatus!({
            jobId: ctx.job.id,
            event: "step",
            data: {
              subtype: event.subtype,
              message: event.message,
            },
            createdAt: localTimestamp(new Date(event.timestamp)),
          });
        }
      : undefined,
  });

  ctx.logger.info("browser.browse.completed", {
    jobId: ctx.job.id,
    requestId,
    exitCode,
  });

  // Build result summary and post back to gatekeeper
  const resultParts = [`Browse completed (exit code: ${exitCode}).`];
  if (finalResult) {
    resultParts.push("", "--- Browse Result ---", finalResult);
  } else {
    resultParts.push("No result data returned.");
  }
  const result = resultParts.join("\n");

  const response = await fetch(
    `${ctx.gatekeeperInternalUrl}/api/browser/result`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        requestId,
        responseJobType,
        result,
      }),
    },
  );

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(
      `Failed to post browser result (${response.status}): ${body.slice(0, 200)}`,
    );
  }

  ctx.logger.info("browser.browse.result_posted", {
    jobId: ctx.job.id,
    requestId,
  });
}
