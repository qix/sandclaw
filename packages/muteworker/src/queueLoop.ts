import type { MuteworkerPlugin } from '@sandclaw/muteworker-plugin-api';
import { ApiError, MuteworkerApiClient } from './apiClient';
import type { MuteworkerConfig } from './config';
import { executeMuteworkerJob } from './jobExecutor';
import type { Logger } from './logger';
import { assertValidJobResult } from './resultSchema';
import {
  createBackoffState,
  nextBackoffMs,
  resetBackoff,
  sleepWithStop,
} from './retry';

export class MuteworkerQueueLoop {
  private shouldRun = true;
  private readonly backoff = createBackoffState();

  constructor(
    private readonly client: MuteworkerApiClient,
    private readonly config: MuteworkerConfig,
    private readonly logger: Logger,
    private readonly plugins: MuteworkerPlugin[],
    private readonly promptsDir: string,
    private readonly memoryDir: string,
  ) {}

  stop(): void {
    this.shouldRun = false;
  }

  async start(): Promise<void> {
    this.logger.info('queue.loop.started', { pollIntervalMs: this.config.pollIntervalMs });

    while (this.shouldRun) {
      try {
        const job = await this.client.readNextJob();

        if (!job) {
          resetBackoff(this.backoff);
          if (this.config.longPollTimeoutMs <= 0) {
            await sleepWithStop(this.config.pollIntervalMs, () => !this.shouldRun);
          }
          continue;
        }

        resetBackoff(this.backoff);
        this.logger.info('queue.job.claimed', { jobId: job.id, jobType: job.jobType });

        const result = await executeMuteworkerJob({
          job,
          client: this.client,
          config: this.config,
          logger: this.logger,
          plugins: this.plugins,
          promptsDir: this.promptsDir,
          memoryDir: this.memoryDir,
        });

        assertValidJobResult(result);
        await this.client.markComplete(job.id);

        if (result.status === 'success') {
          this.logger.info('queue.job.completed', { jobId: job.id });
        } else {
          this.logger.warn('queue.job.failed.completed', {
            jobId: job.id,
            errorKind: result.error?.kind ?? 'unknown',
            error: result.error?.message ?? 'no error message',
          });
        }
      } catch (error) {
        if (error instanceof ApiError) {
          this.logger.error('queue.api.error', {
            status: error.status,
            message: error.message,
            body: error.body,
          });
        } else {
          const message = error instanceof Error ? error.message : 'Unknown queue loop error';
          this.logger.error('queue.loop.error', { message });
        }

        const backoffMs = nextBackoffMs(
          this.backoff,
          this.config.pollIntervalMs,
          this.config.pollIntervalMs * 16,
        );
        this.logger.warn('queue.loop.retrying', {
          attempts: this.backoff.attempts,
          backoffMs,
        });
        await sleepWithStop(backoffMs, () => !this.shouldRun);
      }
    }

    this.logger.info('queue.loop.stopped');
  }
}
