import { muteworkerDeps } from "@sandclaw/muteworker-plugin-api";
import type { MuteworkerEnvironment } from "@sandclaw/muteworker-plugin-api";
import { createPromptTools } from "./tools";
import { loadPromptsPrompt } from "./promptLoader";

export { createPromptTools } from "./tools";
export { loadPromptsPrompt } from "./promptLoader";

export interface PromptsPluginConfig {
  promptsDir: string;
}

export function createPromptsPlugin(config: PromptsPluginConfig) {
  return {
    id: "prompts" as const,

    registerGateway() {},

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
