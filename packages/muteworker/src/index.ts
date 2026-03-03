import type { MuteworkerPlugin } from '@sandclaw/muteworker-plugin-api';
import path from 'path';
import { MuteworkerApiClient } from './apiClient';
import { DEFAULT_CONFIG, MuteworkerConfig } from './config';
import { createLogger } from './logger';
import { MuteworkerQueueLoop } from './queueLoop';

export type { MuteworkerConfig } from './config';

export interface MuteworkerOptions {
  /** Plugins to load into the muteworker. */
  plugins?: MuteworkerPlugin[];
  /** Config overrides (merged with defaults). */
  config?: Partial<MuteworkerConfig>;
  /**
   * Absolute path to the directory containing the agent's prompt files
   * (IDENTITY.md, SYSTEM.md, SOUL.md, USER.md, HEARTBEAT.md).
   */
  promptsDir: string;
  /**
   * Absolute path to the directory used for agent memory files.
   * Created automatically if it does not exist.
   */
  memoryDir: string;
}

/**
 * Starts the Sandclaw Muteworker queue loop.
 *
 * Polls the Gatekeeper for jobs, executes them with the Pi agent, and marks
 * them complete.  Runs until SIGINT/SIGTERM.
 *
 * @example
 * ```ts
 * import path from 'path';
 * import { startMuteworker } from '@sandclaw/muteworker';
 * import { whatsappMuteworkerPlugin } from '@sandclaw/whatsapp-plugin';
 *
 * startMuteworker({
 *   plugins: [whatsappMuteworkerPlugin],
 *   config: { apiBaseUrl: 'http://localhost:3000' },
 *   promptsDir: path.resolve('./prompts'),
 *   memoryDir:  path.resolve('./memory'),
 * });
 * ```
 */
export async function startMuteworker(options: MuteworkerOptions): Promise<void> {
  const config: MuteworkerConfig = { ...DEFAULT_CONFIG, ...options.config };
  const plugins = options.plugins ?? [];
  const promptsDir = path.resolve(options.promptsDir);
  const memoryDir = path.resolve(options.memoryDir);

  const logger = createLogger(config.logLevel);
  const client = new MuteworkerApiClient(config, logger);
  const loop = new MuteworkerQueueLoop(client, config, logger, plugins, promptsDir, memoryDir);

  const shutdown = () => {
    logger.info('muteworker.shutdown.requested');
    loop.stop();
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  logger.info('muteworker.startup', {
    apiBaseUrl: config.apiBaseUrl,
    modelProvider: config.modelProvider,
    modelId: config.modelId,
    plugins: plugins.map((p) => p.id),
    promptsDir,
    memoryDir,
  });

  await loop.start();
}
