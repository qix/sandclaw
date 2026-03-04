import { gatekeeperDeps } from '@sandclaw/gatekeeper-plugin-api';
import type { PluginEnvironment } from '@sandclaw/gatekeeper-plugin-api';
import { muteworkerDeps } from '@sandclaw/muteworker-plugin-api';
import type { MuteworkerEnvironment } from '@sandclaw/muteworker-plugin-api';
import { GithubVerificationRenderer } from './components';
import { registerRoutes } from './routes';
import { createPullRequestTool } from './tools';

export { GithubVerificationRenderer } from './components';
export { createPullRequestTool } from './tools';

export function createGithubPlugin() {
  return {
    id: 'github' as const,
    verificationRenderer: GithubVerificationRenderer,

    registerGateway(env: PluginEnvironment) {
      env.registerInit({
        deps: { db: gatekeeperDeps.db, routes: gatekeeperDeps.routes },
        init({ db, routes }) {
          routes.registerRoutes((app) => registerRoutes(app, db));
        },
      });
    },

    registerMuteworker(env: MuteworkerEnvironment) {
      env.registerInit({
        deps: { tools: muteworkerDeps.tools },
        init({ tools }) {
          tools.registerTools((ctx) => [createPullRequestTool(ctx)]);
        },
      });
    },
  };
}
