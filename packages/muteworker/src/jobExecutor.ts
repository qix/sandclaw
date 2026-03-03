import type { MuteworkerPlugin, MuteworkerPluginContext, RunAgentFn } from '@sandclaw/muteworker-plugin-api';
import type { MuteworkerApiClient } from './apiClient';
import type { MuteworkerConfig } from './config';
import type { Logger } from './logger';
import { runWithPi } from './piRuntime';
import type { Artifact, ToolArgs } from './tools/index';
import type { MuteworkerJobResult, MuteworkerQueueJob } from './types';

class ExecutionError extends Error {
  constructor(
    public readonly kind: 'ModelError' | 'Timeout' | 'PolicyViolation' | 'ParseError',
    message: string,
  ) {
    super(message);
  }
}

export interface JobArgs {
  client: MuteworkerApiClient;
  config: MuteworkerConfig;
  logger: Logger;
  job: MuteworkerQueueJob;
  plugins: MuteworkerPlugin[];
  promptsDir: string;
  memoryDir: string;
}

export async function executeMuteworkerJob(args: JobArgs): Promise<MuteworkerJobResult> {
  const { config, logger, job } = args;
  const artifacts: Artifact[] = [];
  const startTime = Date.now();

  logger.info('job.execution.started', {
    jobId: job.id,
    jobType: job.jobType,
    timeoutMs: config.jobTimeoutMs,
    maxSteps: config.maxSteps,
  });

  try {
    const pluginCtx: MuteworkerPluginContext = {
      apiBaseUrl: config.apiBaseUrl,
      verificationUiUrl: config.verificationUiUrl,
      logger,
      job,
      artifacts,
    };

    const toolArgs: ToolArgs = {
      client: args.client,
      config: args.config,
      logger: args.logger,
      job: args.job,
      plugins: args.plugins,
      promptsDir: args.promptsDir,
      memoryDir: args.memoryDir,
      context: job.data,
    };

    const runAgent: RunAgentFn = async (prompt: string) => {
      const result = await runWithPi(prompt, { ...toolArgs, context: prompt });
      return { reply: result?.reply ?? null };
    };

    // Find a plugin that handles this job type
    let handled = false;
    for (const plugin of args.plugins) {
      const handler = plugin.jobHandlers?.[job.jobType];
      if (handler) {
        await withTimeout(handler(pluginCtx, runAgent), config.jobTimeoutMs);
        handled = true;
        break;
      }
    }

    // Default handler: run Pi agent with the raw job data as the prompt
    if (!handled) {
      const prompt = job.data;
      if (!prompt) {
        return {
          jobId: job.id,
          status: 'success',
          summary: 'No job data provided',
          artifacts,
          logs: { durationMs: Date.now() - startTime, steps: 0 },
        };
      }

      logger.info('job.execution.default_handler', { jobId: job.id, jobType: job.jobType });
      await withTimeout(runAgent(prompt), config.jobTimeoutMs);
    }

    return {
      jobId: job.id,
      status: 'success',
      summary: 'Job completed',
      artifacts,
      logs: { durationMs: Date.now() - startTime, steps: artifacts.length },
    };
  } catch (error) {
    const durationMs = Date.now() - startTime;
    const message = error instanceof Error ? error.message : 'Unknown job execution error';
    const kind = error instanceof ExecutionError ? error.kind : 'ModelError';

    logger.error('job.execution.failed', { jobId: job.id, durationMs, kind, error: message });

    return {
      jobId: job.id,
      status: 'failed',
      summary: 'Muteworker job execution failed',
      artifacts,
      logs: { durationMs, steps: 0 },
      error: { kind, message },
    };
  }
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  let handle: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_, reject) => {
    handle = setTimeout(
      () => reject(new ExecutionError('Timeout', 'Job timeout exceeded')),
      timeoutMs,
    );
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    if (handle) clearTimeout(handle);
  }
}
