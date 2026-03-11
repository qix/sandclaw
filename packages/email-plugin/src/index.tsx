import React from "react";
import { gatekeeperDeps, TabLink } from "@sandclaw/gatekeeper-plugin-api";
import type { PluginEnvironment } from "@sandclaw/gatekeeper-plugin-api";
import { muteworkerDeps } from "@sandclaw/muteworker-plugin-api";
import type { MuteworkerEnvironment } from "@sandclaw/muteworker-plugin-api";
import type { EmailPluginConfig } from "./jmapClient";
import { EmailPanel, EmailVerificationRenderer } from "./components";
import { registerRoutes } from "./routes";
import {
  createSendEmailTool,
  createListInboxTool,
  createSearchEmailsTool,
  createReadEmailTool,
} from "./tools";
import { emailJobHandlers } from "./jobHandlers";

export type { EmailPluginConfig } from "./jmapClient";
export { EmailPanel, EmailVerificationRenderer } from "./components";
export {
  createSendEmailTool,
  createListInboxTool,
  createSearchEmailsTool,
  createReadEmailTool,
} from "./tools";

export function createEmailPlugin(config: EmailPluginConfig) {
  return {
    id: "email" as const,
    verificationRenderer: EmailVerificationRenderer,

    jobHandlers: emailJobHandlers,

    registerGateway(env: PluginEnvironment) {
      env.registerInit({
        deps: {
          db: gatekeeperDeps.db,
          components: gatekeeperDeps.components,
          routes: gatekeeperDeps.routes,
        },
        init({ db, components, routes }) {
          function EmailTab() {
            return <TabLink href="?page=email" title="Email" />;
          }
          components.register("tabs:primary", EmailTab);
          components.register("page:email", EmailPanel);

          routes.registerRoutes((app) => registerRoutes(app, db, config));
        },
      });
    },

    registerMuteworker(env: MuteworkerEnvironment) {
      env.registerInit({
        deps: { tools: muteworkerDeps.tools },
        init({ tools }) {
          tools.registerTools((ctx) => [
            createSendEmailTool(ctx),
            createListInboxTool(ctx),
            createSearchEmailsTool(ctx),
            createReadEmailTool(ctx),
          ]);
        },
      });
    },
  };
}
