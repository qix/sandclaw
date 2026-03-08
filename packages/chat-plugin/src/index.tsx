import React from "react";
import { gatekeeperDeps, TabLink } from "@sandclaw/gatekeeper-plugin-api";
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
          components: gatekeeperDeps.components,
          routes: gatekeeperDeps.routes,
          ws: gatekeeperDeps.ws,
        },
        init({ db, components, routes, ws }) {
          function ChatTab() {
            return (
              <TabLink href="?page=chat" title="Chat" statusColor="green" />
            );
          }
          components.register("tabs:channels", ChatTab);
          components.register("page:chat", ChatPanel);

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
