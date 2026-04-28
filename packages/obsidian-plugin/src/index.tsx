import { gatekeeperDeps } from "@sandclaw/gatekeeper-plugin-api";
import type { PluginEnvironment } from "@sandclaw/gatekeeper-plugin-api";
import { muteworkerDeps } from "@sandclaw/muteworker-plugin-api";
import type { MuteworkerEnvironment } from "@sandclaw/muteworker-plugin-api";
import { createFileVerificationCallback } from "@sandclaw/gatekeeper-util";
import { resolveVaultRoot } from "./pathUtils";
import { ObsidianVaultIndex } from "./vaultIndex";
import { ObsidianVerificationRenderer } from "./components";
import { registerRoutes } from "./routes";
import {
  createSearchTool,
  createListTool,
  createReadTool,
  createEditTool,
  createWriteTool,
  createAddDailyTaskTool,
  createModifyDailyTaskTool,
} from "./tools";

export type { ObsidianVaultIndex } from "./vaultIndex";
export { ObsidianPanel, ObsidianVerificationRenderer } from "./components";
export {
  createSearchTool,
  createListTool,
  createReadTool,
  createEditTool,
  createWriteTool,
  createAddDailyTaskTool,
  createModifyDailyTaskTool,
} from "./tools";

export interface ObsidianPluginConfig {
  /** Path to the Obsidian vault root. `~` is expanded to the home directory. */
  vaultRoot: string;
  /**
   * If set, the vault is mounted locally at this path for direct file access.
   * The muteworker will instruct Claude to use native Read/Grep/Glob tools
   * instead of obsidian_search/obsidian_list/obsidian_read.
   */
  localVaultPath?: string;
}

export function createObsidianPlugin(config: ObsidianPluginConfig) {
  const vaultRoot = resolveVaultRoot(config.vaultRoot);
  const vaultIndex = new ObsidianVaultIndex(vaultRoot);

  return {
    id: "obsidian" as const,
    verificationRenderer: ObsidianVerificationRenderer,

    registerGateway(env: PluginEnvironment) {
      env.registerInit({
        deps: {
          db: gatekeeperDeps.db,
          routes: gatekeeperDeps.routes,
          verifications: gatekeeperDeps.verifications,
        },
        init({ db, routes, verifications }) {
          routes.registerRoutes((app) =>
            registerRoutes(app, db, vaultRoot, vaultIndex),
          );

          verifications.registerVerificationCallback(
            createFileVerificationCallback({
              rootDir: vaultRoot,
              afterWrite: () => vaultIndex.markStale(),
            }),
          );
        },
      });
    },

    registerMuteworker(env: MuteworkerEnvironment) {
      env.registerInit({
        deps: { tools: muteworkerDeps.tools, hooks: muteworkerDeps.hooks },
        init({ tools, hooks }) {
          if (config.localVaultPath) {
            // Vault is mounted locally — only register write tools.
            // Reads go through native Claude Code tools (Read, Grep, Glob).
            tools.registerTools((ctx) => [
              createEditTool(ctx),
              createWriteTool(ctx),
              createAddDailyTaskTool(ctx),
              createModifyDailyTaskTool(ctx),
            ]);

            hooks.register({
              "muteworker:build-system-prompt": async (prev) => ({
                ...prev,
                "OBSIDIAN.md": [
                  `The Obsidian vault is mounted locally at \`${config.localVaultPath}\` (read-only).`,
                  `Use the built-in Read, Grep, and Glob tools to browse and search vault files directly.`,
                  `Do NOT attempt to write files to the vault directly — it is read-only.`,
                  `To write or modify vault files, use the obsidian_edit, obsidian_write, obsidian_add_daily_task, and obsidian_modify_daily_task tools which route through the Gatekeeper.`,
                ].join("\n"),
              }),
            });
          } else {
            // No local mount — register all tools including read tools.
            tools.registerTools((ctx) => [
              createSearchTool(ctx),
              createListTool(ctx),
              createReadTool(ctx),
              createEditTool(ctx),
              createWriteTool(ctx),
              createAddDailyTaskTool(ctx),
              createModifyDailyTaskTool(ctx),
            ]);
          }
        },
      });
    },
  };
}
