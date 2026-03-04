import type { MuteworkerPlugin, MuteworkerHooks, MuteworkerPluginContext, ToolsService } from '@sandclaw/muteworker-plugin-api';
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
}

/**
 * Starts the Sandclaw Muteworker queue loop.
 *
 * Polls the Gatekeeper for jobs, executes them with the Pi agent, and marks
 * them complete.  Runs until SIGINT/SIGTERM.
 *
 * @example
 * ```ts
 * import { startMuteworker } from '@sandclaw/muteworker';
 * import { createPromptsPlugin } from '@sandclaw/prompts-plugin';
 * import { createMemoryPlugin } from '@sandclaw/memory-plugin';
 *
 * startMuteworker({
 *   plugins: [
 *     createPromptsPlugin({ promptsDir: './prompts' }),
 *     createMemoryPlugin({ memoryDir: './memory' }),
 *   ],
 *   config: { apiBaseUrl: 'http://localhost:3000' },
 * });
 * ```
 */
export async function startMuteworker(options: MuteworkerOptions): Promise<void> {
  const config: MuteworkerConfig = { ...DEFAULT_CONFIG, ...options.config };
  const plugins = options.plugins ?? [];

  const logger = createLogger(config.logLevel);
  const client = new MuteworkerApiClient(config, logger);

  // Plugin lifecycle: create services, run registerMuteworker + init
  const startHooks: Array<() => Promise<void>> = [];
  const stopHooks: Array<() => Promise<void>> = [];
  const buildSystemPromptHooks: Array<(prev: string) => string | Promise<string>> = [];
  const hooksService: MuteworkerHooks = {
    register(hooks) {
      if (hooks['muteworker:start']) startHooks.push(async () => hooks['muteworker:start']!());
      if (hooks['muteworker:stop']) stopHooks.push(async () => hooks['muteworker:stop']!());
      if (hooks['muteworker:build-system-prompt']) buildSystemPromptHooks.push(hooks['muteworker:build-system-prompt']);
    },
  };

  // Collected tool factories from plugins
  const toolFactories: Array<(ctx: MuteworkerPluginContext) => any[]> = [];
  const toolsService: ToolsService = {
    registerTools(factory) {
      toolFactories.push(factory);
    },
  };

  const services = new Map<string, any>();
  services.set('core.hooks', hooksService);
  services.set('core.tools', toolsService);

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

  // Build the system prompt pipeline
  const buildSystemPrompt = async (): Promise<string> => {
    let prompt = '';
    for (const hook of buildSystemPromptHooks) {
      prompt = await hook(prompt);
    }
    return prompt;
  };

  const loop = new MuteworkerQueueLoop(client, config, logger, plugins, toolFactories, buildSystemPrompt);

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
  });

  // Fire start hooks
  for (const fn of startHooks) { await fn(); }

  await loop.start();
}
