import { gatekeeperDeps } from '@sandclaw/gatekeeper-plugin-api';
import type { PluginEnvironment } from '@sandclaw/gatekeeper-plugin-api';
import { muteworkerDeps } from '@sandclaw/muteworker-plugin-api';
import type { MuteworkerEnvironment } from '@sandclaw/muteworker-plugin-api';
import { BrowserPanel, BrowserVerificationRenderer } from './components';
import { registerRoutes } from './routes';
import { createRequestBrowserTool } from './tools';
import { browserJobHandlers } from './jobHandlers';

export { BrowserPanel, BrowserVerificationRenderer } from './components';
export { createRequestBrowserTool } from './tools';

export function createBrowserPlugin() {
  return {
    id: 'browser' as const,
    verificationRenderer: BrowserVerificationRenderer,

    jobHandlers: browserJobHandlers,

    registerGateway(env: PluginEnvironment) {
      env.registerInit({
        deps: { db: gatekeeperDeps.db, tabs: gatekeeperDeps.tabs, routes: gatekeeperDeps.routes },
        init({ db, tabs, routes }) {
          tabs.registerTab({
            tabName: 'Browser',
            component: BrowserPanel,
          });

          routes.registerRoutes((app) => registerRoutes(app, db));
        },
      });
    },

    registerMuteworker(env: MuteworkerEnvironment) {
      env.registerInit({
        deps: { tools: muteworkerDeps.tools },
        init({ tools }) {
          tools.registerTools((ctx) => [createRequestBrowserTool(ctx)]);
        },
      });
    },
  };
}
