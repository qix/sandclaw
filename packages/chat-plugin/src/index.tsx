import React, { useContext } from "react";
import {
  gatekeeperDeps,
  NavigationContext,
  TabVariantContext,
} from "@sandclaw/gatekeeper-plugin-api";
import type { PluginEnvironment } from "@sandclaw/gatekeeper-plugin-api";
import { muteworkerDeps } from "@sandclaw/muteworker-plugin-api";
import type { MuteworkerEnvironment } from "@sandclaw/muteworker-plugin-api";
import { Badge } from "@sandclaw/ui";
import { ChatPanel, ChatVerificationRenderer } from "./components";
import { registerRoutes } from "./routes";
import { onChatConnect, onChatMessage } from "./websocket";
import { createSendChatTool } from "./tools";
import { createChatJobHandlers } from "./jobHandlers";

export { ChatPanel, ChatVerificationRenderer } from "./components";
export { createSendChatTool } from "./tools";

function ChatTab() {
  const { activePage } = useContext(NavigationContext);
  const variant = useContext(TabVariantContext);
  const isActive = activePage === "chat";

  if (variant === "dropdown") {
    return (
      <a
        href="?page=chat"
        className={`sc-dropdown-item ${isActive ? "active" : ""}`}
        role="menuitem"
      >
        <span className="sc-dropdown-check">{isActive ? "\u2713" : ""}</span>
        <span className="sc-status-dot sc-status-dot-green" />
        Chat
        <span
          id="sc-mobile-chat-badge"
          style={{ display: "none", marginLeft: "auto" }}
        >
          <Badge bg="#ef4444" fg="#fff" style={{ fontSize: "0.65rem" }}>
            <span id="sc-mobile-chat-count">0</span>
          </Badge>
        </span>
      </a>
    );
  }

  return (
    <a
      href="?page=chat"
      className={`sc-nav-link ${isActive ? "active" : ""}`}
    >
      <span className="sc-status-dot sc-status-dot-green" />
      Chat
      <span
        id="sc-sidebar-chat-badge"
        style={{ display: "none", marginLeft: "0.4rem" }}
      >
        <Badge
          bg="#ef4444"
          fg="#fff"
          style={{ marginLeft: "0.4rem", fontSize: "0.65rem" }}
        >
          <span id="sc-sidebar-chat-count">0</span>
        </Badge>
      </span>
    </a>
  );
}

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
          notify: gatekeeperDeps.notify,
        },
        init({ db, components, routes, ws, notify }) {
          components.register("tabs:channels", ChatTab);
          components.register("page:chat", ChatPanel);

          routes.registerRoutes((app) => registerRoutes(app, db, ws, notify));

          ws.onConnect((client) => onChatConnect(client, db));
          ws.onMessage("chat-plugin", (client, data) =>
            onChatMessage(client, data, db, ws, notify),
          );
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
