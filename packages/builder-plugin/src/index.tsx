import { gatekeeperDeps } from "@sandclaw/gatekeeper-plugin-api";
import type { PluginEnvironment } from "@sandclaw/gatekeeper-plugin-api";
import { muteworkerDeps } from "@sandclaw/muteworker-plugin-api";
import type { MuteworkerEnvironment } from "@sandclaw/muteworker-plugin-api";
import type { ConfidanteEnvironment } from "@sandclaw/confidante-plugin-api";
import { BuilderPanel, BuilderVerificationRenderer } from "./components";
import { registerRoutes, type BuilderPluginConfig } from "./routes";
import { createRequestBuildTool } from "./tools";
import { builderJobHandlers } from "./jobHandlers";
import { createBuilderConfidanteHandlers } from "./confidanteHandlers";

export { BuilderPanel, BuilderVerificationRenderer } from "./components";
export { createRequestBuildTool } from "./tools";

export interface BuilderPluginOptions {
  /** Git repo URL to clone/build against. */
  repo: string;
  /** Absolute path for the working directory. */
  workDir: string;
  /** Branch to checkout. @default "main" */
  branch?: string;
  /** Docker image name. @default "builder-plugin" */
  image?: string;
}

export function createBuilderPlugin(options: BuilderPluginOptions) {
  const config: BuilderPluginConfig = {
    repo: options.repo,
    workDir: options.workDir,
    branch: options.branch,
    image: options.image,
  };

  return {
    id: "builder" as const,
    verificationRenderer: BuilderVerificationRenderer,

    jobHandlers: builderJobHandlers,
    confidanteHandlers: createBuilderConfidanteHandlers({
      workDir: config.workDir,
    }),

    registerGateway(env: PluginEnvironment) {
      env.registerInit({
        deps: {
          db: gatekeeperDeps.db,
          tabs: gatekeeperDeps.tabs,
          routes: gatekeeperDeps.routes,
        },
        init({ db, tabs, routes }) {
          tabs.registerTab({
            tabName: "Builder",
            component: BuilderPanel,
          });

          routes.registerRoutes((app) => registerRoutes(app, db, config));
        },
      });
    },

    registerMuteworker(env: MuteworkerEnvironment) {
      env.registerInit({
        deps: { tools: muteworkerDeps.tools },
        init({ tools }) {
          tools.registerTools((ctx) => [createRequestBuildTool(ctx)]);
        },
      });
    },

    registerConfidante(_env: ConfidanteEnvironment) {
      // No additional init needed — confidanteHandlers are picked up automatically
    },
  };
}
