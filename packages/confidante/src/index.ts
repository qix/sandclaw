import type { ConfidantePlugin, ConfidanteHooks } from '@sandclaw/confidante-plugin-api';
import { ConfidanteApiClient } from './apiClient';
import { DEFAULT_CONFIG, ConfidanteConfig } from './config';
import { DockerServiceImpl } from './docker';
import { createLogger } from './logger';
import { ConfidanteQueueLoop } from './queueLoop';

export type { ConfidanteConfig } from './config';

export interface ConfidanteOptions {
  /** Plugins to load into the confidante. */
  plugins?: ConfidantePlugin[];
  /** Config overrides (merged with defaults). */
  config?: Partial<ConfidanteConfig>;
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
