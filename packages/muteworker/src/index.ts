import type { MuteworkerPlugin, MuteworkerHooks } from '@sandclaw/muteworker-plugin-api';
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
 * import { buildWhatsappMuteworkerPlugin } from '@sandclaw/whatsapp-plugin';
 *
 * startMuteworker({
 *   plugins: [buildWhatsappMuteworkerPlugin({ operatorJids: ['99999999@s.whatsapp.net'] })],
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

  // Plugin lifecycle: create services, run registerMuteworker + init
  const startHooks: Array<() => Promise<void>> = [];
  const stopHooks: Array<() => Promise<void>> = [];
  const hooksService: MuteworkerHooks = {
    register(hooks) {
      if (hooks['muteworker:start']) startHooks.push(async () => hooks['muteworker:start']!());
      if (hooks['muteworker:stop']) stopHooks.push(async () => hooks['muteworker:stop']!());
    },
  };

  const services = new Map<string, any>();
  services.set('core.hooks', hooksService);

  const initFns: Array<() => void | Promise<void>> = [];
  for (const plugin of plugins) {
    if (!plugin.registerMuteworker) {
      throw new Error(`Plugin "${plugin.id}" is missing required registerMuteworker method`);
    }
    plugin.registerMuteworker({
      registerInit({ deps, init }) {
        const resolved: Record<string, any> = {};
        for (const [key, ref] of Object.entries(deps)) {
          resolved[key] = services.get(ref.id);
        }
        initFns.push(() => init(resolved as any));
      },
    });
  }
  for (const fn of initFns) { await fn(); }

  const shutdown = async () => {
    logger.info('muteworker.shutdown.requested');
    loop.stop();
    for (const fn of stopHooks) { await fn(); }
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

  // Fire start hooks
  for (const fn of startHooks) { await fn(); }

  await loop.start();
}
