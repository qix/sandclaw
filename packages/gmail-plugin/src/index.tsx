import React from "react";
import { gatekeeperDeps, TabLink } from "@sandclaw/gatekeeper-plugin-api";
import type { PluginEnvironment } from "@sandclaw/gatekeeper-plugin-api";
import { muteworkerDeps } from "@sandclaw/muteworker-plugin-api";
import type { MuteworkerEnvironment } from "@sandclaw/muteworker-plugin-api";
import { sendEmail, type GmailPluginConfig } from "./gmailClient";
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
          verifications: gatekeeperDeps.verifications,
        },
        init({ db, components, routes, verifications }) {
          function GmailTab() {
            return <TabLink href="?page=gmail" title="Gmail" />;
          }
          components.register("tabs:primary", GmailTab);
          components.register("page:gmail", GmailPanel);

          routes.registerRoutes((app) => registerRoutes(app, db, config));

          verifications.registerVerificationCallback(async (request) => {
            const result = await sendEmail(
              config,
              request.data.to,
              request.data.subject,
              request.data.text,
            );
            const now = Date.now();
            await db("conversation_message").insert({
              conversation_id: 0,
              plugin: "gmail",
              channel: request.data.to,
              message_id: result.messageId,
              from: config.userEmail,
              to: request.data.to,
              timestamp: Math.floor(now / 1000),
              direction: "sent",
              text: request.data.text,
              created_at: now,
            });
          });
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
