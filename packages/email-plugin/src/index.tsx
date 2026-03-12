import React from "react";
import { gatekeeperDeps, TabLink } from "@sandclaw/gatekeeper-plugin-api";
import type { PluginEnvironment } from "@sandclaw/gatekeeper-plugin-api";
import { muteworkerDeps } from "@sandclaw/muteworker-plugin-api";
import type { MuteworkerEnvironment } from "@sandclaw/muteworker-plugin-api";
import type { EmailPluginConfig } from "./jmapClient";
import { EmailPanel, EmailQueuePanel, EmailVerificationRenderer } from "./components";
import { registerRoutes, registerEmailQueueRoutes } from "./routes";
import {
  createSendEmailTool,
  createListInboxTool,
  createSearchEmailsTool,
  createReadEmailTool,
} from "./tools";
import { emailJobHandlers } from "./jobHandlers";

export type { EmailPluginConfig } from "./jmapClient";
export { EmailPanel, EmailQueuePanel, EmailVerificationRenderer } from "./components";
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

          if (config.emailQueueDir) {
            function EmailQueueTab() {
              return <TabLink href="?page=email-queue" title="Email Queue" />;
            }
            components.register("tabs:primary", EmailQueueTab);
            components.register("page:email-queue", EmailQueuePanel);
          }

          routes.registerRoutes((app) => {
            registerRoutes(app, db, config);
            if (config.emailQueueDir) {
              registerEmailQueueRoutes(app, config.emailQueueDir);
            }
          });
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
