import { muteworkerDeps } from '@sandclaw/muteworker-plugin-api';
import type { MuteworkerEnvironment } from '@sandclaw/muteworker-plugin-api';
import { createGoogleMapsTool } from './tools';

export { createGoogleMapsTool } from './tools';

export function createGoogleMapsPlugin() {
  return {
    id: 'google-maps' as const,

    registerGateway() {},

    registerMuteworker(env: MuteworkerEnvironment) {
      env.registerInit({
        deps: { tools: muteworkerDeps.tools },
        init({ tools }) {
          tools.registerTools((ctx) => [createGoogleMapsTool(ctx)]);
        },
      });
    },
  };
}
