import { execFile as execFileCb } from "node:child_process";
import { promisify } from "node:util";
import { gatekeeperDeps } from "@sandclaw/gatekeeper-plugin-api";
import type { PluginEnvironment } from "@sandclaw/gatekeeper-plugin-api";

const execFile = promisify(execFileCb);
import { muteworkerDeps } from "@sandclaw/muteworker-plugin-api";
import type { MuteworkerEnvironment } from "@sandclaw/muteworker-plugin-api";
import { GithubVerificationRenderer } from "./components";
import { registerRoutes } from "./routes";
import { createPullRequestTool } from "./tools";

export { GithubVerificationRenderer } from "./components";
export { createPullRequestTool } from "./tools";

export interface GithubPluginOptions {
  /** If set, `git pull` will be run in this directory after a PR is merged on the matching repo. */
  autoPullPath?: string;
  /** The GitHub repo (owner/name) that must match for auto-pull to trigger. */
  autoPullRepo?: string;
}

export function createGithubPlugin(options?: GithubPluginOptions) {
  return {
    id: "github" as const,
    verificationRenderer: GithubVerificationRenderer,

    registerGateway(env: PluginEnvironment) {
      env.registerInit({
        deps: {
          db: gatekeeperDeps.db,
          routes: gatekeeperDeps.routes,
          verifications: gatekeeperDeps.verifications,
        },
        init({ db, routes, verifications }) {
          routes.registerRoutes((app) =>
            registerRoutes(app, db, {
              autoPullPath: options?.autoPullPath,
              autoPullRepo: options?.autoPullRepo,
            }),
          );

          verifications.registerVerificationCallback(async (request) => {
            const data = request.data as {
              repo: string;
              prNumber: number;
            };
            await execFile("gh", [
              "pr",
              "merge",
              String(data.prNumber),
              "--repo",
              data.repo,
              "--rebase",
              "--auto",
            ]);
            if (
              options?.autoPullPath &&
              options?.autoPullRepo &&
              data.repo === options.autoPullRepo
            ) {
              const pullCwd = { cwd: options.autoPullPath };
              try {
                // Check for uncommitted changes
                const { stdout: status } = await execFile(
                  "git",
                  ["status", "--porcelain"],
                  pullCwd,
                );
                if (status.trim()) {
                  console.log(
                    "Auto-pull skipped: working directory has uncommitted changes",
                  );
                  return;
                }

                // Get the current branch
                const { stdout: branch } = await execFile(
                  "git",
                  ["rev-parse", "--abbrev-ref", "HEAD"],
                  pullCwd,
                );
                const currentBranch = branch.trim();

                // Fetch latest from origin
                await execFile("git", ["fetch", "origin", "main"], pullCwd);

                if (currentBranch === "main") {
                  // Already on main — fast-forward pull
                  await execFile("git", ["rebase", "origin/main"], pullCwd);
                } else {
                  // On a different branch — dry-run rebase to check for conflicts
                  try {
                    await execFile(
                      "git",
                      ["rebase", "--no-fork-point", "origin/main"],
                      pullCwd,
                    );
                  } catch {
                    // Rebase failed (conflicts) — abort and skip
                    await execFile("git", ["rebase", "--abort"], pullCwd);
                    console.log(
                      `Auto-pull skipped: rebase from origin/main onto ${currentBranch} would cause conflicts`,
                    );
                    return;
                  }
                }
              } catch (err) {
                console.error("Auto-pull failed:", err);
              }
            }
          });
        },
      });
    },

    registerMuteworker(env: MuteworkerEnvironment) {
      env.registerInit({
        deps: { tools: muteworkerDeps.tools },
        init({ tools }) {
          tools.registerTools((ctx) => [createPullRequestTool(ctx)]);
        },
      });
    },
  };
}
