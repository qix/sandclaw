import React from "react";
import { gatekeeperDeps, TabLink } from "@sandclaw/gatekeeper-plugin-api";
import type { PluginEnvironment } from "@sandclaw/gatekeeper-plugin-api";
import { muteworkerDeps } from "@sandclaw/muteworker-plugin-api";
import type { MuteworkerEnvironment } from "@sandclaw/muteworker-plugin-api";
import { createMemoryTools } from "./tools";
import { loadMemoryPrompt } from "./promptLoader";
import { MemoryPanel } from "./components";
import { registerRoutes } from "./routes";

export { createMemoryTools } from "./tools";
export { loadMemoryPrompt } from "./promptLoader";
export { MemoryPanel } from "./components";

export interface MemoryPluginConfig {
  memoryDir: string;
}

export function createMemoryPlugin(config: MemoryPluginConfig) {
  return {
    id: "memory" as const,

    registerGateway(env: PluginEnvironment) {
      env.registerInit({
        deps: {
          components: gatekeeperDeps.components,
          routes: gatekeeperDeps.routes,
        },
        init({ components, routes }) {
          function MemoryTab() {
            return <TabLink href="?page=memory" title="Memory" />;
          }
          components.register("tabs:primary", MemoryTab);
          components.register("page:memory", MemoryPanel);

          routes.registerRoutes((app) =>
            registerRoutes(app, config.memoryDir),
          );
        },
      });
    },

    registerMuteworker(env: MuteworkerEnvironment) {
      env.registerInit({
        deps: { hooks: muteworkerDeps.hooks, tools: muteworkerDeps.tools },
        init({ hooks, tools }) {
          tools.registerTools((ctx) =>
            createMemoryTools(ctx, config.memoryDir),
          );

          hooks.register({
            "muteworker:build-system-prompt": async (prev) => {
              const sources = await loadMemoryPrompt(config.memoryDir);
              return { ...prev, ...sources };
            },
          });
        },
      });
    },
  };
}
