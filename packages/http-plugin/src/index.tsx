import React, { useContext } from "react";
import {
  gatekeeperDeps,
  NavigationContext,
  TabVariantContext,
} from "@sandclaw/gatekeeper-plugin-api";
import type { PluginEnvironment } from "@sandclaw/gatekeeper-plugin-api";
import { muteworkerDeps } from "@sandclaw/muteworker-plugin-api";
import type { MuteworkerEnvironment } from "@sandclaw/muteworker-plugin-api";

import { runHttpMigrations } from "./migrations";
import { loadHttpState } from "./state";
import { registerHttpRoutes } from "./routes";
import { HttpPanel } from "./components";
import { createHttpRequestTool } from "./tools";

export { createHttpRequestTool } from "./tools";
export { HttpPanel } from "./components";

function HttpTab() {
  const { activePage } = useContext(NavigationContext);
  const variant = useContext(TabVariantContext);
  const isActive = activePage === "http";

  if (variant === "dropdown") {
    return (
      <a
        href="?page=http"
        className={`sc-dropdown-item ${isActive ? "active" : ""}`}
        role="menuitem"
      >
        <span className="sc-dropdown-check">{isActive ? "✓" : ""}</span>
        HTTP
      </a>
    );
  }

  return (
    <a
      href="?page=http"
      className={`sc-nav-link ${isActive ? "active" : ""}`}
    >
      HTTP
    </a>
  );
}

export function createHttpPlugin() {
  return {
    id: "http" as const,

    migrations: runHttpMigrations,

    registerGateway(env: PluginEnvironment) {
      env.registerInit({
        deps: {
          db: gatekeeperDeps.db,
          components: gatekeeperDeps.components,
          routes: gatekeeperDeps.routes,
          ws: gatekeeperDeps.ws,
        },
        async init({ db, components, routes, ws }) {
          await loadHttpState(db);

          components.register("tabs:primary", HttpTab);
          components.register("page:http", HttpPanel);

          routes.registerRoutes((app) => registerHttpRoutes(app, db, ws));
        },
      });
    },

    registerMuteworker(env: MuteworkerEnvironment) {
      env.registerInit({
        deps: { tools: muteworkerDeps.tools },
        init({ tools }) {
          tools.registerTools((ctx) => [createHttpRequestTool(ctx)]);
        },
      });
    },
  };
}
