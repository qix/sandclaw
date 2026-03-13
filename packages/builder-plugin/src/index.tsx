import React from "react";
import { gatekeeperDeps, TabLink } from "@sandclaw/gatekeeper-plugin-api";
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
export type { BuildConfig } from "./build";

export interface BuilderPluginOptions {
  /** Git repo URL to clone/build against. */
  repo: string;
  /** Absolute path for the working directory. */
  workDir: string;
  /** Branch to checkout. @default "main" */
  branch?: string;
  /** Docker image name. @default "builder-plugin" */
  image?: string;
  /** Override for docker mount arguments  */
  dockerArgsOverride?: string[];
  /** Path to a file whose content is passed as the system prompt to claude inside the container. */
  systemPromptFile?: string;
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
      repo: config.repo,
      dockerArgsOverride: options.dockerArgsOverride,
      systemPromptFile: options.systemPromptFile,
    }),

    registerGateway(env: PluginEnvironment) {
      env.registerInit({
        deps: {
          db: gatekeeperDeps.db,
          hooks: gatekeeperDeps.hooks,
          components: gatekeeperDeps.components,
          routes: gatekeeperDeps.routes,
        },
        init({ db, hooks, components, routes }) {
          function BuilderTab() {
            return <TabLink href="?page=builder" title="Builder" />;
          }
          components.register("tabs:primary", BuilderTab);
          components.register("page:builder", BuilderPanel);

          routes.registerRoutes((app) =>
            registerRoutes(app, db, config, (event) =>
              hooks.fireAgentStatus(event),
            ),
          );
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
