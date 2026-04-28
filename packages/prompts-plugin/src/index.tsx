import React from "react";
import { gatekeeperDeps, TabLink } from "@sandclaw/gatekeeper-plugin-api";
import type { PluginEnvironment } from "@sandclaw/gatekeeper-plugin-api";
import { muteworkerDeps } from "@sandclaw/muteworker-plugin-api";
import type { MuteworkerEnvironment } from "@sandclaw/muteworker-plugin-api";
import { FileVerificationRenderer } from "@sandclaw/ui";
import { createFileVerificationCallback } from "@sandclaw/gatekeeper-util";
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
    verificationRenderer: FileVerificationRenderer,

    registerGateway(env: PluginEnvironment) {
      env.registerInit({
        deps: {
          components: gatekeeperDeps.components,
          db: gatekeeperDeps.db,
          routes: gatekeeperDeps.routes,
          verifications: gatekeeperDeps.verifications,
        },
        init({ components, db, routes, verifications }) {
          function PromptsTab() {
            return <TabLink href="?page=prompts" title="Prompts" />;
          }
          components.register("tabs:primary", PromptsTab);
          components.register("page:prompts", PromptsPanel);

          routes.registerRoutes((app) =>
            registerRoutes(app, config.promptsDir, db),
          );

          verifications.registerVerificationCallback(
            createFileVerificationCallback({
              rootDir: config.promptsDir,
            }),
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
              const sources = await loadPromptsPrompt(config.promptsDir);
              return { ...prev, ...sources };
            },
          });
        },
      });
    },
  };
}
