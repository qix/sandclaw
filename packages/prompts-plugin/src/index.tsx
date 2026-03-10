import React from "react";
import { gatekeeperDeps, TabLink } from "@sandclaw/gatekeeper-plugin-api";
import type { PluginEnvironment } from "@sandclaw/gatekeeper-plugin-api";
import { muteworkerDeps } from "@sandclaw/muteworker-plugin-api";
import type { MuteworkerEnvironment } from "@sandclaw/muteworker-plugin-api";
import { createPromptTools } from "./tools";
import { loadPromptsPrompt } from "./promptLoader";
import { PromptsPanel } from "./components";
import { registerRoutes } from "./routes";

export { createPromptTools } from "./tools";
export { loadPromptsPrompt } from "./promptLoader";
export { PromptsPanel } from "./components";

export interface PromptsPluginConfig {
  promptsDir: string;
}

export function createPromptsPlugin(config: PromptsPluginConfig) {
  return {
    id: "prompts" as const,

    registerGateway(env: PluginEnvironment) {
      env.registerInit({
        deps: {
          components: gatekeeperDeps.components,
          routes: gatekeeperDeps.routes,
        },
        init({ components, routes }) {
          function PromptsTab() {
            return <TabLink href="?page=prompts" title="Prompts" />;
          }
          components.register("tabs:primary", PromptsTab);
          components.register("page:prompts", PromptsPanel);

          routes.registerRoutes((app) =>
            registerRoutes(app, config.promptsDir),
          );
        },
      });
    },

    registerMuteworker(env: MuteworkerEnvironment) {
      env.registerInit({
        deps: { hooks: muteworkerDeps.hooks, tools: muteworkerDeps.tools },
        init({ hooks, tools }) {
          tools.registerTools((ctx) =>
            createPromptTools(ctx, config.promptsDir),
          );

          hooks.register({
            "muteworker:build-system-prompt": async (prev) => {
              const promptsSection = await loadPromptsPrompt(config.promptsDir);
              return promptsSection ? `${prev}\n${promptsSection}` : prev;
            },
          });
        },
      });
    },
  };
}
