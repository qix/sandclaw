import { gatekeeperDeps } from '@sandclaw/gatekeeper-plugin-api';
import type { PluginEnvironment } from '@sandclaw/gatekeeper-plugin-api';
import { muteworkerDeps } from '@sandclaw/muteworker-plugin-api';
import type { MuteworkerEnvironment } from '@sandclaw/muteworker-plugin-api';
import { resolveVaultRoot } from './pathUtils';
import { ObsidianVaultIndex } from './vaultIndex';
import { ObsidianPanel, ObsidianVerificationRenderer } from './components';
import { registerRoutes } from './routes';
import { createSearchTool, createReadTool, createWriteTool } from './tools';

export type { ObsidianVaultIndex } from './vaultIndex';
export { ObsidianPanel, ObsidianVerificationRenderer } from './components';
export { createSearchTool, createReadTool, createWriteTool } from './tools';

export interface ObsidianPluginConfig {
  /** Path to the Obsidian vault root. `~` is expanded to the home directory. */
  vaultRoot: string;
}

export function createObsidianPlugin(config: ObsidianPluginConfig) {
  const vaultRoot = resolveVaultRoot(config.vaultRoot);
  const vaultIndex = new ObsidianVaultIndex(vaultRoot);

  return {
    id: 'obsidian' as const,
    verificationRenderer: ObsidianVerificationRenderer,

    registerGateway(env: PluginEnvironment) {
      env.registerInit({
        deps: { db: gatekeeperDeps.db, tabs: gatekeeperDeps.tabs, routes: gatekeeperDeps.routes },
        init({ db, tabs, routes }) {
          tabs.registerTab({
            tabName: 'Obsidian',
            component: ObsidianPanel,
          });

          routes.registerRoutes((app) => registerRoutes(app, db, vaultRoot, vaultIndex));
        },
      });
    },

    registerMuteworker(env: MuteworkerEnvironment) {
      env.registerInit({
        deps: { tools: muteworkerDeps.tools },
        init({ tools }) {
          tools.registerTools((ctx) => [createSearchTool(ctx), createReadTool(ctx), createWriteTool(ctx)]);
        },
      });
    },
  };
}
