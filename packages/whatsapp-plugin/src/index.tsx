import React from "react";
import { gatekeeperDeps, TabLink } from "@sandclaw/gatekeeper-plugin-api";
import type { PluginEnvironment } from "@sandclaw/gatekeeper-plugin-api";
import { muteworkerDeps } from "@sandclaw/muteworker-plugin-api";
import type { MuteworkerEnvironment } from "@sandclaw/muteworker-plugin-api";
import { waState } from "./state";
import {
  connectWhatsApp,
  disconnectWhatsApp,
  loadRecentConversations,
} from "./connection";
import { WhatsAppPanel, WhatsAppVerificationRenderer } from "./components";
import { registerRoutes } from "./routes";
import { migrations } from "./migrations";
import { createSendWhatsappTool } from "./tools";
import { createWhatsappJobHandlers } from "./jobHandlers";
import { WhatsAppStatusContext, useWhatsAppStatus } from "./statusContext";

export type { WhatsAppState, ConnectionStatus } from "./state";
export { WhatsAppPanel, WhatsAppVerificationRenderer } from "./components";
export { WhatsAppStatusContext, useWhatsAppStatus } from "./statusContext";
export { createSendWhatsappTool } from "./tools";

export interface WhatsappGatekeeperPluginOptions {
  /** JIDs that are trusted operators. Incoming messages from non-operator JIDs are
   *  ignored; sends to operator JIDs are auto-approved without human verification. */
  operatorJids?: string[];

  // Only process messages from the operator through the agent, and ignore messages from non-operators entirely.
  // This is useful if you want to use the plugin just for its send tool and not have incoming messages trigger agent runs.
  operatorOnly?: boolean;
}

export function buildWhatsappPlugin(
  options: WhatsappGatekeeperPluginOptions = {},
) {
  const operatorJids: ReadonlySet<string> = new Set(options.operatorJids ?? []);
  const operatorOnly = options.operatorOnly ?? false;

  return {
    id: "whatsapp" as const,
    verificationRenderer: WhatsAppVerificationRenderer,
    migrations,

    jobHandlers: createWhatsappJobHandlers(operatorJids),

    registerGateway(env: PluginEnvironment) {
      env.registerInit({
        deps: {
          db: gatekeeperDeps.db,
          hooks: gatekeeperDeps.hooks,
          components: gatekeeperDeps.components,
          routes: gatekeeperDeps.routes,
        },
        async init({ db, hooks, components, routes }) {
          function WhatsAppTab() {
            const { statusColor } = useWhatsAppStatus();
            return (
              <TabLink
                href="?page=whatsapp"
                title="WhatsApp"
                statusColor={statusColor}
              />
            );
          }

          function WhatsAppProvider({
            children,
          }: {
            children: React.ReactNode;
          }) {
            const statusColor = (() => {
              switch (waState.connectionStatus) {
                case "connected":
                  return "green" as const;
                case "connecting":
                case "qr_pending":
                  return "yellow" as const;
                case "disconnected":
                default:
                  return "red" as const;
              }
            })();
            return (
              <WhatsAppStatusContext.Provider value={{ statusColor }}>
                {children}
              </WhatsAppStatusContext.Provider>
            );
          }

          components.register("tabs:channels", WhatsAppTab);
          components.register("page:whatsapp", WhatsAppPanel);
          components.register("provider", WhatsAppProvider);

          routes.registerRoutes((app) => registerRoutes(app, db, operatorJids));

          hooks.register({
            "gatekeeper:start": async () => {
              await loadRecentConversations(db);
              await connectWhatsApp(db, {
                operatorOnly,
                operatorJids,
              });
            },
            "gatekeeper:stop": () => disconnectWhatsApp(),
          });
        },
      });
    },

    registerMuteworker(env: MuteworkerEnvironment) {
      env.registerInit({
        deps: { tools: muteworkerDeps.tools },
        init({ tools }) {
          tools.registerTools((ctx) => [createSendWhatsappTool(ctx)]);
        },
      });
    },
  };
}

/** Default plugin instance (no operator JIDs configured). */
export const whatsappPlugin = buildWhatsappPlugin();
