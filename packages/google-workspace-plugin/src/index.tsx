import React from "react";
import { gatekeeperDeps, TabLink } from "@sandclaw/gatekeeper-plugin-api";
import type { PluginEnvironment } from "@sandclaw/gatekeeper-plugin-api";
import { muteworkerDeps } from "@sandclaw/muteworker-plugin-api";
import type { MuteworkerEnvironment } from "@sandclaw/muteworker-plugin-api";
import type { ConfidanteEnvironment } from "@sandclaw/confidante-plugin-api";
import type { GoogleWorkspacePluginConfig } from "./gwsClient";
import {
  GoogleWorkspacePanel,
  GoogleWorkspaceVerificationRenderer,
} from "./components";
import { registerRoutes } from "./routes";
import { createReadTool, createExecTool } from "./tools";
import { createGwsConfidanteHandlers } from "./confidanteHandlers";

export type { GoogleWorkspacePluginConfig } from "./gwsClient";
export {
  GoogleWorkspacePanel,
  GoogleWorkspaceVerificationRenderer,
} from "./components";
export { createReadTool, createExecTool } from "./tools";

export function createGoogleWorkspacePlugin(
  config: GoogleWorkspacePluginConfig = {},
) {
  return {
    id: "google-workspace" as const,
    verificationRenderer: GoogleWorkspaceVerificationRenderer,

    confidanteHandlers: createGwsConfidanteHandlers(config),

    registerGateway(env: PluginEnvironment) {
      env.registerInit({
        deps: {
          db: gatekeeperDeps.db,
          components: gatekeeperDeps.components,
          routes: gatekeeperDeps.routes,
        },
        init({ db, components, routes }) {
          function GoogleWorkspaceTab() {
            return (
              <TabLink
                href="?page=google-workspace"
                title="Google Workspace"
              />
            );
          }
          components.register("tabs:primary", GoogleWorkspaceTab);
          components.register("page:google-workspace", GoogleWorkspacePanel);

          routes.registerRoutes((app) => registerRoutes(app, db));
        },
      });
    },

    registerMuteworker(env: MuteworkerEnvironment) {
      env.registerInit({
        deps: { tools: muteworkerDeps.tools },
        init({ tools }) {
          tools.registerTools((ctx) => [
            createReadTool(ctx, config),
            createExecTool(ctx),
          ]);
        },
      });
    },

    registerConfidante(_env: ConfidanteEnvironment) {
      // No additional init needed — confidanteHandlers are picked up automatically
    },
  };
}
