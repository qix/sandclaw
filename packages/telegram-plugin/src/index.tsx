import { gatekeeperDeps } from "@sandclaw/gatekeeper-plugin-api";
import type { PluginEnvironment } from "@sandclaw/gatekeeper-plugin-api";
import { muteworkerDeps } from "@sandclaw/muteworker-plugin-api";
import type { MuteworkerEnvironment } from "@sandclaw/muteworker-plugin-api";
import { tgState } from "./state";
import {
  connectTelegram,
  disconnectTelegram,
  loadRecentConversations,
} from "./connection";
import { TelegramPanel, TelegramVerificationRenderer } from "./components";
import { registerRoutes } from "./routes";
import { migrations } from "./migrations";
import { createSendTelegramTool } from "./tools";
import { createTelegramJobHandlers } from "./jobHandlers";

export type { TelegramState, ConnectionStatus } from "./state";
export { TelegramPanel, TelegramVerificationRenderer } from "./components";
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
        },
        async init({ db, hooks, components, routes }) {
          components.register("tabs:channels", Object.assign(
            function TelegramTab() { return null; },
            {
              title: "Telegram",
              href: "?page=telegram",
              statusColor: () => {
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
              },
            },
          ));
          components.register("page:telegram", TelegramPanel);

          routes.registerRoutes((app) =>
            registerRoutes(app, db, operatorChatIds),
          );

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
                  await connectTelegram(db, session.bot_token);
                } else if (options.botToken) {
                  console.log(
                    "[telegram] Connecting with configured bot token...",
                  );
                  await connectTelegram(db, options.botToken);
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
