import React from "react";
import { gatekeeperDeps, TabLink } from "@sandclaw/gatekeeper-plugin-api";
import type { PluginEnvironment } from "@sandclaw/gatekeeper-plugin-api";
import { muteworkerDeps } from "@sandclaw/muteworker-plugin-api";
import type { MuteworkerEnvironment } from "@sandclaw/muteworker-plugin-api";
import type { GoogleSheetsPluginConfig } from "./sheetsClient";
import {
  GoogleSheetsPanel,
  GoogleSheetsVerificationRenderer,
} from "./components";
import { registerRoutes } from "./routes";
import {
  createListTool,
  createReadTool,
  createInfoTool,
  createUpdateTool,
  createInsertRowsTool,
} from "./tools";

export type { GoogleSheetsPluginConfig } from "./sheetsClient";
export {
  GoogleSheetsPanel,
  GoogleSheetsVerificationRenderer,
} from "./components";
export {
  createListTool,
  createReadTool,
  createInfoTool,
  createUpdateTool,
  createInsertRowsTool,
} from "./tools";

export function createGoogleSheetsPlugin(config: GoogleSheetsPluginConfig) {
  return {
    id: "google-sheets" as const,
    verificationRenderer: GoogleSheetsVerificationRenderer,

    registerGateway(env: PluginEnvironment) {
      env.registerInit({
        deps: {
          db: gatekeeperDeps.db,
          components: gatekeeperDeps.components,
          routes: gatekeeperDeps.routes,
        },
        init({ db, components, routes }) {
          function GoogleSheetsTab() {
            return (
              <TabLink href="?page=google-sheets" title="Google Sheets" />
            );
          }
          components.register("tabs:primary", GoogleSheetsTab);
          components.register("page:google-sheets", GoogleSheetsPanel);

          routes.registerRoutes((app) => registerRoutes(app, db, config));
        },
      });
    },

    registerMuteworker(env: MuteworkerEnvironment) {
      env.registerInit({
        deps: { tools: muteworkerDeps.tools },
        init({ tools }) {
          tools.registerTools((ctx) => [
            createListTool(ctx),
            createReadTool(ctx),
            createInfoTool(ctx),
            createUpdateTool(ctx),
            createInsertRowsTool(ctx),
          ]);
        },
      });
    },
  };
}
