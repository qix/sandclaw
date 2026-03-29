import React from "react";
import { gatekeeperDeps, TabLink } from "@sandclaw/gatekeeper-plugin-api";
import type { PluginEnvironment } from "@sandclaw/gatekeeper-plugin-api";
import { muteworkerDeps } from "@sandclaw/muteworker-plugin-api";
import type { MuteworkerEnvironment } from "@sandclaw/muteworker-plugin-api";
import { createSkillTools } from "./tools";
import { loadSkillsPrompt } from "./skillLoader";
import { SkillsPanel } from "./components";
import { registerRoutes } from "./routes";

export { createSkillTools } from "./tools";
export { loadSkillsPrompt } from "./skillLoader";
export { SkillsPanel } from "./components";

export interface SkillsPluginConfig {
  skillsDir: string;
}

export function createSkillsPlugin(config: SkillsPluginConfig) {
  return {
    id: "skills" as const,

    registerGateway(env: PluginEnvironment) {
      env.registerInit({
        deps: {
          components: gatekeeperDeps.components,
          routes: gatekeeperDeps.routes,
        },
        init({ components, routes }) {
          function SkillsTab() {
            return <TabLink href="?page=skills" title="Skills" />;
          }
          components.register("tabs:primary", SkillsTab);
          components.register("page:skills", SkillsPanel);

          routes.registerRoutes((app) => registerRoutes(app, config.skillsDir));
        },
      });
    },

    registerMuteworker(env: MuteworkerEnvironment) {
      env.registerInit({
        deps: { hooks: muteworkerDeps.hooks, tools: muteworkerDeps.tools },
        init({ hooks, tools }) {
          tools.registerTools((ctx) => createSkillTools(ctx, config.skillsDir));

          hooks.register({
            "muteworker:build-system-prompt": async (prev) => {
              const sources = await loadSkillsPrompt(config.skillsDir);
              return { ...prev, ...sources };
            },
          });
        },
      });
    },
  };
}
