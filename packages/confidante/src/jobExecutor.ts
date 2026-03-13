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

  // Parse job data for logging (best-effort)
  let jobDataPreview: Record<string, unknown> | undefined;
  try {
    const parsed = JSON.parse(job.data);
    // Include a subset of fields for visibility without flooding logs
    jobDataPreview = {};
    for (const key of Object.keys(parsed).slice(0, 6)) {
      const val = parsed[key];
      jobDataPreview[key] =
        typeof val === "string" && val.length > 200
          ? val.slice(0, 200) + "…"
          : val;
    }
  } catch {}

  logger.info("job.execution.started", {
    jobId: job.id,
    jobType: job.jobType,
    ...(jobDataPreview ? { jobData: jobDataPreview } : {}),
  });
  reportStatus?.({
    jobId: job.id,
    event: "started",
    data: {
      jobType: job.jobType,
      ...(jobDataPreview ? { jobData: jobDataPreview } : {}),
    },
    createdAt: startTime,
  });

  try {
    const ctx: ConfidantePluginContext = {
      gatekeeperInternalUrl: config.gatekeeperInternalUrl,
      logger,
      job,
      docker: args.docker,
      reportStatus,
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
    logger.info("job.execution.completed", {
      jobId: job.id,
      jobType: job.jobType,
      durationMs,
      hasResult: typeof result === "string",
    });
    reportStatus?.({
      jobId: job.id,
      event: "completed",
      data: { durationMs, jobType: job.jobType },
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
