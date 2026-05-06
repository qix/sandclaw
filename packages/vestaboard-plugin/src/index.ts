import { muteworkerDeps } from "@sandclaw/muteworker-plugin-api";
import type {
  MuteworkerEnvironment,
  MuteworkerPlugin,
} from "@sandclaw/muteworker-plugin-api";
import type { GatekeeperPlugin } from "@sandclaw/gatekeeper-plugin-api";
import { createVestaboardWriteTool, VestaboardConfig } from "./tools";

export { createVestaboardWriteTool } from "./tools";
export type { VestaboardConfig } from "./tools";
export { Vestaboard, UnsupportedChar, VestaCode } from "./vestaboard";
export type { VestaCell } from "./vestaboard";

export function createVestaboardPlugin(
  config: VestaboardConfig,
): GatekeeperPlugin & MuteworkerPlugin {
  return {
    id: "vestaboard",

    registerGateway() {},

    registerMuteworker(env: MuteworkerEnvironment) {
      env.registerInit({
        deps: { tools: muteworkerDeps.tools },
        init({ tools }) {
          tools.registerTools((ctx) => [createVestaboardWriteTool(ctx, config)]);
        },
      });
    },
  };
}
