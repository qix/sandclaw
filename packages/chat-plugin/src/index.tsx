import { gatekeeperDeps } from "@sandclaw/gatekeeper-plugin-api";
import type { PluginEnvironment } from "@sandclaw/gatekeeper-plugin-api";
import { muteworkerDeps } from "@sandclaw/muteworker-plugin-api";
import type { MuteworkerEnvironment } from "@sandclaw/muteworker-plugin-api";
import { ChatPanel, ChatVerificationRenderer } from "./components";
import { registerRoutes } from "./routes";
import { handleUpgrade } from "./websocket";
import { createSendChatTool } from "./tools";
import { createChatJobHandlers } from "./jobHandlers";

export { ChatPanel, ChatVerificationRenderer } from "./components";
export { createSendChatTool } from "./tools";

export function buildChatPlugin() {
  return {
    id: "chat" as const,
    verificationRenderer: ChatVerificationRenderer,

    jobHandlers: createChatJobHandlers(),

    registerGateway(env: PluginEnvironment) {
      env.registerInit({
        deps: {
          db: gatekeeperDeps.db,
          tabs: gatekeeperDeps.tabs,
          routes: gatekeeperDeps.routes,
          ws: gatekeeperDeps.ws,
        },
        init({ db, tabs, routes, ws }) {
          tabs.registerTab({
            tabName: "Chat",
            component: ChatPanel,
            statusColor: () => "green" as const,
          });

          routes.registerRoutes((app) => registerRoutes(app, db));

          ws.onUpgrade("/api/chat/ws", handleUpgrade(db));
        },
      });
    },

    registerMuteworker(env: MuteworkerEnvironment) {
      env.registerInit({
        deps: { tools: muteworkerDeps.tools },
        init({ tools }) {
          tools.registerTools((ctx) => [createSendChatTool(ctx)]);
        },
      });
    },
  };
}

/** Default plugin instance. */
export const chatPlugin = buildChatPlugin();
