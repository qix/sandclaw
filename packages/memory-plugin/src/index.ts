import { muteworkerDeps } from "@sandclaw/muteworker-plugin-api";
import type { MuteworkerEnvironment } from "@sandclaw/muteworker-plugin-api";
import { createMemoryTools } from "./tools";
import { loadMemoryPrompt } from "./promptLoader";

export { createMemoryTools } from "./tools";
export { loadMemoryPrompt } from "./promptLoader";

export interface MemoryPluginConfig {
  memoryDir: string;
}

export function createMemoryPlugin(config: MemoryPluginConfig) {
  return {
    id: "memory" as const,

    registerGateway() {},

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
