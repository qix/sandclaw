import React from "react";
import { gatekeeperDeps, TabLink } from "@sandclaw/gatekeeper-plugin-api";
import type { PluginEnvironment } from "@sandclaw/gatekeeper-plugin-api";
import { muteworkerDeps } from "@sandclaw/muteworker-plugin-api";
import type { MuteworkerEnvironment } from "@sandclaw/muteworker-plugin-api";
import type { EmailPluginConfig } from "./jmapClient";
import {
  EmailPanel,
  EmailQueuePanel,
  EmailPluginVerificationRenderer,
  EmailVerificationRenderer,
  CalendarResponseVerificationRenderer,
} from "./components";
import {
  registerRoutes,
  registerEmailQueueRoutes,
  startEmailPolling,
  startCalendarInvitePolling,
} from "./routes";
import {
  createSendEmailTool,
  createListInboxTool,
  createSearchEmailsTool,
  createReadEmailTool,
  createListCalendarInvitesTool,
  createReadCalendarEventTool,
  createRespondCalendarInviteTool,
} from "./tools";
import { createEmailJobHandlers } from "./jobHandlers";
import { migrations } from "./migrations";

export type { EmailPluginConfig } from "./jmapClient";
export {
  EmailPanel,
  EmailQueuePanel,
  EmailPluginVerificationRenderer,
  EmailVerificationRenderer,
  CalendarResponseVerificationRenderer,
} from "./components";
export {
  createSendEmailTool,
  createListInboxTool,
  createSearchEmailsTool,
  createReadEmailTool,
  createListCalendarInvitesTool,
  createReadCalendarEventTool,
  createRespondCalendarInviteTool,
} from "./tools";

export function createEmailPlugin(config: EmailPluginConfig) {
  return {
    id: "email" as const,
    verificationRenderer: EmailPluginVerificationRenderer,

    jobHandlers: createEmailJobHandlers({
      systemPromptFile: config.systemPromptFile,
    }),
    migrations,

    registerGateway(env: PluginEnvironment) {
      env.registerInit({
        deps: {
          db: gatekeeperDeps.db,
          hooks: gatekeeperDeps.hooks,
          components: gatekeeperDeps.components,
          routes: gatekeeperDeps.routes,
        },
        init({ db, hooks, components, routes }) {
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

          hooks.register({
            "gatekeeper:start": async () => {
              await startEmailPolling(
                config,
                db,
                config.pollIntervalMs ?? 30000,
              );
              await startCalendarInvitePolling(
                config,
                db,
                config.pollIntervalMs ?? 30000,
                { systemPromptFile: config.systemPromptFile },
              );
            },
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
            createListCalendarInvitesTool(ctx),
            createReadCalendarEventTool(ctx),
            createRespondCalendarInviteTool(ctx),
          ]);
        },
      });
    },
  };
}
