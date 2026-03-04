import { muteworkerDeps } from '@sandclaw/muteworker-plugin-api';
import type { MuteworkerEnvironment } from '@sandclaw/muteworker-plugin-api';
import { createBraveWebSearchTool, WebSearchConfig } from './tools';

export { createBraveWebSearchTool } from './tools';
export type { WebSearchConfig } from './tools';

export function createWebSearchPlugin(config: WebSearchConfig) {
  return {
    id: 'web-search' as const,

    registerGateway() {},

    registerMuteworker(env: MuteworkerEnvironment) {
      env.registerInit({
        deps: { tools: muteworkerDeps.tools },
        init({ tools }) {
          tools.registerTools((ctx) => [createBraveWebSearchTool(ctx, config)]);
        },
      });
    },
  };
}
