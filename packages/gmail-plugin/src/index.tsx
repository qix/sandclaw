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
          components: gatekeeperDeps.components,
          routes: gatekeeperDeps.routes,
        },
        init({ db, components, routes }) {
          components.register("tabs:primary", Object.assign(
            function GmailTab() { return null; },
            { title: "Gmail", href: "?page=gmail" },
          ));
          components.register("page:gmail", GmailPanel);

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
