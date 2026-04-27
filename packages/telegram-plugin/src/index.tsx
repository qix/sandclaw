import React from "react";
import { gatekeeperDeps, TabLink } from "@sandclaw/gatekeeper-plugin-api";
import type { PluginEnvironment } from "@sandclaw/gatekeeper-plugin-api";
import { muteworkerDeps } from "@sandclaw/muteworker-plugin-api";
import type { MuteworkerEnvironment } from "@sandclaw/muteworker-plugin-api";
import { tgState } from "./state";
import {
  connectTelegram,
  disconnectTelegram,
  deliverMessage,
  loadRecentConversations,
} from "./connection";
import { TelegramPanel, TelegramVerificationRenderer } from "./components";
import { registerRoutes } from "./routes";
import { migrations } from "./migrations";
import { createSendTelegramTool } from "./tools";
import { createTelegramJobHandlers } from "./jobHandlers";
import { TelegramStatusContext, useTelegramStatus } from "./statusContext";

export type { TelegramState, ConnectionStatus } from "./state";
export { TelegramPanel, TelegramVerificationRenderer } from "./components";
export { TelegramStatusContext, useTelegramStatus } from "./statusContext";
export { createSendTelegramTool } from "./tools";

export interface TelegramGatekeeperPluginOptions {
  /** Chat IDs that are trusted operators. Sends to operator chat IDs are
   *  auto-approved without human verification. */
  operatorChatIds?: string[];
  /** Bot token to connect with on startup, bypassing the UI setup flow. */
  botToken?: string;
}

export function buildTelegramPlugin(
  options: TelegramGatekeeperPluginOptions = {},
) {
  const operatorChatIds: ReadonlySet<string> = new Set(
    options.operatorChatIds ?? [],
  );

  return {
    id: "telegram" as const,
    verificationRenderer: TelegramVerificationRenderer,
    migrations,

    jobHandlers: createTelegramJobHandlers(operatorChatIds),

    registerGateway(env: PluginEnvironment) {
      env.registerInit({
        deps: {
          db: gatekeeperDeps.db,
          hooks: gatekeeperDeps.hooks,
          components: gatekeeperDeps.components,
          routes: gatekeeperDeps.routes,
          verifications: gatekeeperDeps.verifications,
          jobs: gatekeeperDeps.jobs,
        },
        async init({ db, hooks, components, routes, verifications, jobs }) {
          function TelegramTab() {
            const { statusColor } = useTelegramStatus();
            return (
              <TabLink
                href="?page=telegram"
                title="Telegram"
                statusColor={statusColor}
              />
            );
          }

          function TelegramProvider({
            children,
          }: {
            children: React.ReactNode;
          }) {
            const statusColor = (() => {
              switch (tgState.connectionStatus) {
                case "connected":
                  return "green" as const;
                case "connecting":
                  return "yellow" as const;
                case "disconnected":
                case "waiting_for_token":
                default:
                  return "red" as const;
              }
            })();
            return (
              <TelegramStatusContext.Provider value={{ statusColor }}>
                {children}
              </TelegramStatusContext.Provider>
            );
          }

          components.register("tabs:channels", TelegramTab);
          components.register("page:telegram", TelegramPanel);
          components.register("provider", TelegramProvider);

          routes.registerRoutes((app) =>
            registerRoutes(app, db, jobs, operatorChatIds),
          );

          verifications.registerVerificationCallback(async (request) => {
            await deliverMessage(db, request.data.chatId, request.data.text);
          });

          hooks.register({
            async "gatekeeper:start"() {
              await loadRecentConversations(db);
              try {
                const session = await db("telegram_sessions")
                  .where("status", "connected")
                  .first();
                if (session?.bot_token) {
                  console.log(
                    "[telegram] Found existing session, auto-reconnecting...",
                  );
                  await connectTelegram(db, jobs, session.bot_token);
                } else if (options.botToken) {
                  console.log(
                    "[telegram] Connecting with configured bot token...",
                  );
                  await connectTelegram(db, jobs, options.botToken);
                }
              } catch (err: any) {
                console.error("[telegram] Auto-reconnect failed:", err.message);
              }
            },
            "gatekeeper:stop": () => disconnectTelegram(db),
          });
        },
      });
    },

    registerMuteworker(env: MuteworkerEnvironment) {
      env.registerInit({
        deps: { tools: muteworkerDeps.tools },
        init({ tools }) {
          tools.registerTools((ctx) => [createSendTelegramTool(ctx)]);
        },
      });
    },
  };
}

export const telegramPlugin = buildTelegramPlugin();
