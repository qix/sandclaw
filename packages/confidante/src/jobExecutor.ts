import type {
  ConfidantePlugin,
  ConfidantePluginContext,
} from "@sandclaw/confidante-plugin-api";
import type { ConfidanteApiClient } from "./apiClient";
import type { ConfidanteConfig } from "./config";
import type { DockerServiceImpl } from "./docker";
import type { Logger } from "./logger";
import type { ConfidanteQueueJob } from "./types";

class ExecutionError extends Error {
  constructor(
    public readonly kind: "HandlerError" | "Timeout" | "NoHandler",
    message: string,
  ) {
    super(message);
  }
}

export interface ConfidanteJobArgs {
  client: ConfidanteApiClient;
  config: ConfidanteConfig;
  logger: Logger;
  job: ConfidanteQueueJob;
  plugins: ConfidantePlugin[];
  docker: DockerServiceImpl;
  reportStatus?: (event: {
    jobId: number;
    event: string;
    data?: Record<string, unknown>;
    createdAt?: number;
  }) => void;
}

export interface ConfidanteJobResult {
  jobId: number;
  status: "success" | "failed";
  /** Result string returned by the handler (if any). */
  result?: string;
  durationMs: number;
  error?: { kind: string; message: string };
}

export async function executeConfidanteJob(
  args: ConfidanteJobArgs,
): Promise<ConfidanteJobResult> {
  const { config, logger, job, reportStatus } = args;
  const startTime = Date.now();

  logger.info("job.execution.started", { jobId: job.id, jobType: job.jobType });
  reportStatus?.({
    jobId: job.id,
    event: "started",
    data: { jobType: job.jobType },
    createdAt: startTime,
  });

  try {
    const ctx: ConfidantePluginContext = {
      gatekeeperInternalUrl: config.gatekeeperInternalUrl,
      logger,
      job,
      docker: args.docker,
    };

    // Find a plugin that handles this job type
    let result: string | void = undefined;
    let handled = false;

    for (const plugin of args.plugins) {
      const handler = plugin.confidanteHandlers?.[job.jobType];
      if (handler) {
        result = await withTimeout(handler(ctx), config.jobTimeoutMs);
        handled = true;
        break;
      }
    }

    if (!handled) {
      throw new ExecutionError(
        "NoHandler",
        `No confidante handler for job type "${job.jobType}"`,
      );
    }

    const durationMs = Date.now() - startTime;
    reportStatus?.({
      jobId: job.id,
      event: "completed",
      data: { durationMs },
      createdAt: Date.now(),
    });

    return {
      jobId: job.id,
      status: "success",
      result: typeof result === "string" ? result : undefined,
      durationMs,
    };
  } catch (error) {
    const durationMs = Date.now() - startTime;
    const message =
      error instanceof Error ? error.message : "Unknown job execution error";
    const kind = error instanceof ExecutionError ? error.kind : "HandlerError";

    logger.error("job.execution.failed", {
      jobId: job.id,
      durationMs,
      kind,
      error: message,
    });

    reportStatus?.({
      jobId: job.id,
      event: "failed",
      data: { durationMs, kind, error: message },
      createdAt: Date.now(),
    });

    return {
      jobId: job.id,
      status: "failed",
      durationMs,
      error: { kind, message },
    };
  }
}

async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
): Promise<T> {
  let handle: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_, reject) => {
    handle = setTimeout(
      () => reject(new ExecutionError("Timeout", "Job timeout exceeded")),
      timeoutMs,
    );
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    if (handle) clearTimeout(handle);
  }
}
