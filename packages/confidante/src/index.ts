import * as readline from 'node:readline';
import type { ConfidantePlugin, ConfidanteHooks } from '@sandclaw/confidante-plugin-api';
import { ConfidanteApiClient } from './apiClient';
import { DEFAULT_CONFIG, ConfidanteConfig } from './config';
import { DockerServiceImpl } from './docker';
import { executeConfidanteJob } from './jobExecutor';
import { createLogger } from './logger';
import { ConfidanteQueueLoop } from './queueLoop';

export type { ConfidanteConfig } from './config';

export interface ConfidanteOptions {
  /** Plugins to load into the confidante. */
  plugins?: ConfidantePlugin[];
  /** Config overrides (merged with defaults). */
  config?: Partial<ConfidanteConfig>;
}

export interface ConfidanteScriptOptions extends ConfidanteOptions {
  /** Replay a specific job by ID instead of running the queue loop. */
  replayJobId?: number;
}

/**
 * Starts the Sandclaw Confidante queue loop.
 *
 * Polls the Gatekeeper for approved confidante jobs, executes them
 * (typically inside Docker containers), and marks them complete.
 * Runs until SIGINT/SIGTERM.
 *
 * @example
 * ```ts
 * import { startConfidante } from '@sandclaw/confidante';
 * import { createBrowserPlugin } from '@sandclaw/browser-plugin';
 *
 * startConfidante({
 *   plugins: [createBrowserPlugin()],
 *   config: { apiBaseUrl: 'http://localhost:3000' },
 * });
 * ```
 */
export async function startConfidante(options: ConfidanteOptions): Promise<void> {
  const config: ConfidanteConfig = { ...DEFAULT_CONFIG, ...options.config };
  const plugins = options.plugins ?? [];

  const logger = createLogger(config.logLevel);
  const client = new ConfidanteApiClient(config, logger);
  const docker = new DockerServiceImpl(logger);

  // Plugin lifecycle: create services, run registerConfidante + init
  const startHooks: Array<() => Promise<void>> = [];
  const stopHooks: Array<() => Promise<void>> = [];
  const hooksService: ConfidanteHooks = {
    register(hooks) {
      if (hooks['confidante:start']) startHooks.push(async () => hooks['confidante:start']!());
      if (hooks['confidante:stop']) stopHooks.push(async () => hooks['confidante:stop']!());
    },
  };

  const services = new Map<string, any>();
  services.set('core.hooks', hooksService);
  services.set('core.docker', docker);

  const initFns: Array<() => void | Promise<void>> = [];
  for (const plugin of plugins) {
    if (plugin.registerConfidante) {
      plugin.registerConfidante({
        registerInit({ deps, init }) {
          const resolved: Record<string, any> = {};
          for (const [key, ref] of Object.entries(deps)) {
            resolved[key] = services.get(ref.id);
          }
          initFns.push(() => init(resolved as any));
        },
      });
    }
  }
  for (const fn of initFns) { await fn(); }

  const loop = new ConfidanteQueueLoop(client, config, logger, plugins, docker);

  const shutdown = async () => {
    logger.info('confidante.shutdown.requested');
    loop.stop();
    for (const fn of stopHooks) { await fn(); }
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  logger.info('confidante.startup', {
    apiBaseUrl: config.apiBaseUrl,
    dockerImage: config.dockerImage,
    plugins: plugins.map((p) => p.id),
  });

  // Fire start hooks
  for (const fn of startHooks) { await fn(); }

  await loop.start();
}

/**
 * Confidante CLI script entry point.
 *
 * When `replay` is set, fetches the specified job from the gatekeeper,
 * displays its details, prompts for confirmation, and executes it.
 * Otherwise falls through to the normal queue loop.
 */
export async function confidanteScript(options: ConfidanteScriptOptions): Promise<void> {
  if (options.replayJobId == null) {
    return startConfidante(options);
  }

  const config: ConfidanteConfig = { ...DEFAULT_CONFIG, ...options.config };
  const plugins = options.plugins ?? [];
  const logger = createLogger(config.logLevel);
  const client = new ConfidanteApiClient(config, logger);
  const docker = new DockerServiceImpl(logger);

  // Initialize plugins
  const startHooks: Array<() => Promise<void>> = [];
  const stopHooks: Array<() => Promise<void>> = [];
  const hooksService: ConfidanteHooks = {
    register(hooks) {
      if (hooks['confidante:start']) startHooks.push(async () => hooks['confidante:start']!());
      if (hooks['confidante:stop']) stopHooks.push(async () => hooks['confidante:stop']!());
    },
  };

  const services = new Map<string, any>();
  services.set('core.hooks', hooksService);
  services.set('core.docker', docker);

  const initFns: Array<() => void | Promise<void>> = [];
  for (const plugin of plugins) {
    if (plugin.registerConfidante) {
      plugin.registerConfidante({
        registerInit({ deps, init }) {
          const resolved: Record<string, any> = {};
          for (const [key, ref] of Object.entries(deps)) {
            resolved[key] = services.get(ref.id);
          }
          initFns.push(() => init(resolved as any));
        },
      });
    }
  }
  for (const fn of initFns) { await fn(); }

  for (const fn of startHooks) { await fn(); }

  // Fetch the job
  const job = await client.getJob(options.replayJobId);
  if (!job) {
    logger.error('replay.job.not_found', { jobId: options.replayJobId });
    console.error(`Job ${options.replayJobId} not found.`);
    process.exitCode = 1;
    for (const fn of stopHooks) { await fn(); }
    return;
  }

  // Display job details
  console.log('\n--- Job Details ---');
  console.log(`  ID:      ${job.id}`);
  console.log(`  Type:    ${job.jobType}`);
  console.log(`  Status:  ${job.status}`);
  console.log(`  Data:    ${job.data}`);
  console.log('-------------------\n');

  // Prompt for confirmation
  const confirmed = await confirm('Proceed with executing this job?');
  if (!confirmed) {
    console.log('Aborted.');
    for (const fn of stopHooks) { await fn(); }
    return;
  }

  // Execute the job using the same path as the queue loop
  logger.info('replay.job.started', { jobId: job.id, jobType: job.jobType });
  const result = await executeConfidanteJob({
    job,
    client,
    config,
    logger,
    plugins,
    docker,
  });

  await client.markComplete(job.id, result.result);

  if (result.status === 'success') {
    logger.info('replay.job.completed', { jobId: job.id, durationMs: result.durationMs });
    console.log(`Job ${job.id} completed successfully (${result.durationMs}ms).`);
  } else {
    logger.warn('replay.job.failed', {
      jobId: job.id,
      errorKind: result.error?.kind ?? 'unknown',
      error: result.error?.message ?? 'no error message',
    });
    console.error(`Job ${job.id} failed: ${result.error?.message ?? 'unknown error'}`);
    process.exitCode = 1;
  }

  for (const fn of stopHooks) { await fn(); }
}

function confirm(question: string): Promise<boolean> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(`${question} [y/N] `, (answer) => {
      rl.close();
      resolve(answer.trim().toLowerCase() === 'y');
    });
  });
}
