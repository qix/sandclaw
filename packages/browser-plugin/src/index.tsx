import React from "react";
import { gatekeeperDeps, TabLink } from "@sandclaw/gatekeeper-plugin-api";
import type { PluginEnvironment } from "@sandclaw/gatekeeper-plugin-api";
import { muteworkerDeps } from "@sandclaw/muteworker-plugin-api";
import type { MuteworkerEnvironment } from "@sandclaw/muteworker-plugin-api";
import type { ConfidanteEnvironment } from "@sandclaw/confidante-plugin-api";
import { BrowserPanel, BrowserVerificationRenderer } from "./components";
import { registerRoutes } from "./routes";
import { createRequestBrowserTool } from "./tools";
import { browserJobHandlers } from "./jobHandlers";
import { browserConfidanteHandlers } from "./confidanteHandlers";

export { BrowserPanel, BrowserVerificationRenderer } from "./components";
export { createRequestBrowserTool } from "./tools";

export function createBrowserPlugin() {
  return {
    id: "browser" as const,
    verificationRenderer: BrowserVerificationRenderer,

    jobHandlers: browserJobHandlers,
    confidanteHandlers: browserConfidanteHandlers,

    registerGateway(env: PluginEnvironment) {
      env.registerInit({
        deps: {
          db: gatekeeperDeps.db,
          components: gatekeeperDeps.components,
          routes: gatekeeperDeps.routes,
        },
        init({ db, components, routes }) {
          function BrowserTab() {
            return <TabLink href="?page=browser" title="Browser" />;
          }
          components.register("tabs:primary", BrowserTab);
          components.register("page:browser", BrowserPanel);

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

    registerConfidante(_env: ConfidanteEnvironment) {
      // No additional init needed — confidanteHandlers are picked up automatically
    },
  };
}
