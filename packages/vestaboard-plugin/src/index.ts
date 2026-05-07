import { gatekeeperDeps } from "@sandclaw/gatekeeper-plugin-api";
import type {
  GatekeeperPlugin,
  PluginEnvironment,
} from "@sandclaw/gatekeeper-plugin-api";
import { muteworkerDeps } from "@sandclaw/muteworker-plugin-api";
import type {
  MuteworkerEnvironment,
  MuteworkerPlugin,
} from "@sandclaw/muteworker-plugin-api";
import { createVestaboardWriteTool } from "./tools";
import { registerVestaboardRoutes } from "./routes";

export interface VestaboardConfig {
  /** Webhook URL the gatekeeper POSTs the rendered display payload to (e.g. process.env.VESTABOARD_POST_WEBHOOK_URL). */
  webhookUrl: string;
}

export { createVestaboardWriteTool } from "./tools";
export { registerVestaboardRoutes } from "./routes";
export { Vestaboard, UnsupportedChar, VestaCode } from "./vestaboard";
export type { VestaCell } from "./vestaboard";

export function createVestaboardPlugin(
  config: VestaboardConfig,
): GatekeeperPlugin & MuteworkerPlugin {
  return {
    id: "vestaboard",

    registerGateway(env: PluginEnvironment) {
      env.registerInit({
        deps: { routes: gatekeeperDeps.routes },
        init({ routes }) {
          routes.registerRoutes((app) => registerVestaboardRoutes(app, config));
        },
      });
    },

    registerMuteworker(env: MuteworkerEnvironment) {
      env.registerInit({
        deps: { tools: muteworkerDeps.tools },
        init({ tools }) {
          tools.registerTools((ctx) => [createVestaboardWriteTool(ctx)]);
        },
      });
    },
  };
}
