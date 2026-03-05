import { gatekeeperDeps } from "@sandclaw/gatekeeper-plugin-api";
import type { PluginEnvironment } from "@sandclaw/gatekeeper-plugin-api";
import { muteworkerDeps } from "@sandclaw/muteworker-plugin-api";
import type { MuteworkerEnvironment } from "@sandclaw/muteworker-plugin-api";
import type { GmailPluginConfig } from "./gmailClient";
import { GmailPanel, GmailVerificationRenderer } from "./components";
import { registerRoutes } from "./routes";
import { createSendEmailTool } from "./tools";
import { gmailJobHandlers } from "./jobHandlers";

export type { GmailPluginConfig } from "./gmailClient";
export { GmailPanel, GmailVerificationRenderer } from "./components";
export { createSendEmailTool } from "./tools";

export function createGmailPlugin(config: GmailPluginConfig) {
  return {
    id: "gmail" as const,
    verificationRenderer: GmailVerificationRenderer,

    jobHandlers: gmailJobHandlers,

    registerGateway(env: PluginEnvironment) {
      env.registerInit({
        deps: {
          db: gatekeeperDeps.db,
          tabs: gatekeeperDeps.tabs,
          routes: gatekeeperDeps.routes,
        },
        init({ db, tabs, routes }) {
          tabs.registerTab({
            tabName: "Gmail",
            component: GmailPanel,
          });

          routes.registerRoutes((app) => registerRoutes(app, db, config));
        },
      });
    },

    registerMuteworker(env: MuteworkerEnvironment) {
      env.registerInit({
        deps: { tools: muteworkerDeps.tools },
        init({ tools }) {
          tools.registerTools((ctx) => [createSendEmailTool(ctx)]);
        },
      });
    },
  };
}
