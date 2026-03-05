import { gatekeeperDeps } from "@sandclaw/gatekeeper-plugin-api";
import type { PluginEnvironment } from "@sandclaw/gatekeeper-plugin-api";
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
        deps: { db: gatekeeperDeps.db, routes: gatekeeperDeps.routes },
        init({ db, routes }) {
          routes.registerRoutes((app) =>
            registerRoutes(app, db, {
              autoPullPath: options?.autoPullPath,
              autoPullRepo: options?.autoPullRepo,
            }),
          );
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
