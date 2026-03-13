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
              try {
                await execFile("git", ["pull"], {
                  cwd: options.autoPullPath,
                });
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
