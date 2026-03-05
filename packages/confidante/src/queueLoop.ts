import type { ConfidantePlugin } from "@sandclaw/confidante-plugin-api";
import { ApiError, ConfidanteApiClient } from "./apiClient";
import type { ConfidanteConfig } from "./config";
import type { DockerServiceImpl } from "./docker";
import { executeConfidanteJob } from "./jobExecutor";
import type { Logger } from "./logger";
import {
  createBackoffState,
  nextBackoffMs,
  resetBackoff,
  sleepWithStop,
} from "./retry";

export class ConfidanteQueueLoop {
  private shouldRun = true;
  private pollAbort: AbortController | null = null;
  private readonly backoff = createBackoffState();

  constructor(
    private readonly client: ConfidanteApiClient,
    private readonly config: ConfidanteConfig,
    private readonly logger: Logger,
    private readonly plugins: ConfidantePlugin[],
    private readonly docker: DockerServiceImpl,
  ) {}

  stop(): void {
    this.shouldRun = false;
    this.pollAbort?.abort();
  }

  async start(): Promise<void> {
    this.logger.info("queue.loop.started", {
      pollIntervalMs: this.config.pollIntervalMs,
    });

    while (this.shouldRun) {
      try {
        this.pollAbort = new AbortController();
        const job = await this.client.readNextJob(this.pollAbort.signal);

        if (!job) {
          resetBackoff(this.backoff);
          if (this.config.longPollTimeoutMs <= 0) {
            await sleepWithStop(
              this.config.pollIntervalMs,
              () => !this.shouldRun,
            );
          }
          continue;
        }

        resetBackoff(this.backoff);
        this.logger.info("queue.job.claimed", {
          jobId: job.id,
          jobType: job.jobType,
        });

        const result = await executeConfidanteJob({
          job,
          client: this.client,
          config: this.config,
          logger: this.logger,
          plugins: this.plugins,
          docker: this.docker,
        });

        await this.client.markComplete(job.id, result.result);

        if (result.status === "success") {
          this.logger.info("queue.job.completed", {
            jobId: job.id,
            durationMs: result.durationMs,
          });
        } else {
          this.logger.warn("queue.job.failed.completed", {
            jobId: job.id,
            errorKind: result.error?.kind ?? "unknown",
            error: result.error?.message ?? "no error message",
          });
        }
      } catch (error) {
        if (
          !this.shouldRun &&
          error instanceof Error &&
          error.name === "AbortError"
        ) {
          break;
        }
        if (error instanceof ApiError) {
          this.logger.error("queue.api.error", {
            status: error.status,
            message: error.message,
            body: error.body,
          });
        } else {
          const message =
            error instanceof Error ? error.message : "Unknown queue loop error";
          this.logger.error("queue.loop.error", { message });
        }

        const backoffMs = nextBackoffMs(
          this.backoff,
          this.config.pollIntervalMs,
          10_000,
        );
        this.logger.warn("queue.loop.retrying", {
          attempts: this.backoff.attempts,
          backoffMs,
        });
        await sleepWithStop(backoffMs, () => !this.shouldRun);
      }
    }

    this.logger.info("queue.loop.stopped");
  }
}
