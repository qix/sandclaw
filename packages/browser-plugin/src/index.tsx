import { spawn } from "node:child_process";
import path from "node:path";
import { gatekeeperDeps } from "@sandclaw/gatekeeper-plugin-api";
import type { PluginEnvironment } from "@sandclaw/gatekeeper-plugin-api";
import { muteworkerDeps } from "@sandclaw/muteworker-plugin-api";
import type { MuteworkerEnvironment } from "@sandclaw/muteworker-plugin-api";
import {
  confidanteDeps,
  type ConfidanteEnvironment,
} from "@sandclaw/confidante-plugin-api";
import { BrowserVerificationRenderer } from "./components";
import { registerRoutes, type BrowserPluginConfig } from "./routes";
import { BROWSER_CONFIDANTE_JOB_TYPE } from "./constants";
import { createRequestBrowseTool } from "./tools";
import { browserJobHandlers } from "./jobHandlers";
import { createBrowserConfidanteHandlers } from "./confidanteHandlers";

export { BrowserPanel, BrowserVerificationRenderer } from "./components";
export { createRequestBrowseTool } from "./tools";
export type { BrowseConfig } from "./browse";

export interface BrowserPluginOptions {
  /** Docker image name. @default "browser-plugin" */
  image?: string;
}

export function createBrowserPlugin(options: BrowserPluginOptions = {}) {
  const config: BrowserPluginConfig = {
    image: options.image,
  };

  // Deferred promise so executeBrowse can await the background image build.
  let resolveBuild: () => void;
  let rejectBuild: (err: Error) => void;
  const buildReady = new Promise<void>((resolve, reject) => {
    resolveBuild = resolve;
    rejectBuild = reject;
  });

  return {
    id: "browser" as const,
    verificationRenderer: BrowserVerificationRenderer,

    jobHandlers: browserJobHandlers,
    confidanteHandlers: createBrowserConfidanteHandlers({
      image: config.image,
      buildReady,
    }),

    registerGateway(env: PluginEnvironment) {
      env.registerInit({
        deps: {
          db: gatekeeperDeps.db,
          routes: gatekeeperDeps.routes,
          verifications: gatekeeperDeps.verifications,
        },
        init({ db, routes, verifications }) {
          routes.registerRoutes((app) => registerRoutes(app, db, config));

          verifications.registerVerificationCallback(
            async (request, { queueJob }) => {
              await queueJob("confidante", BROWSER_CONFIDANTE_JOB_TYPE, {
                requestId: request.data.requestId,
                prompt: request.data.prompt,
                url: request.data.url,
                responseJobType: request.data.responseJobType,
                image: request.data.image,
              });
            },
          );
        },
      });
    },

    registerMuteworker(env: MuteworkerEnvironment) {
      env.registerInit({
        deps: { tools: muteworkerDeps.tools },
        init({ tools }) {
          tools.registerTools((ctx) => [createRequestBrowseTool(ctx)]);
        },
      });
    },

    registerConfidante(env: ConfidanteEnvironment) {
      env.registerInit({
        deps: { hooks: confidanteDeps.hooks },
        init({ hooks }) {
          hooks.register({
            "confidante:start": () => {
              const dockerDir = path.resolve(__dirname, "..", "docker");
              const imageName = config.image ?? "browser-plugin";
              console.log(
                `[browser-plugin] Building Docker image "${imageName}" in background...`,
              );
              const child = spawn(
                "docker",
                ["build", "-t", imageName, dockerDir],
                { stdio: ["ignore", "ignore", "pipe"] },
              );
              let stderr = "";
              child.stderr.on("data", (chunk: Buffer) => {
                stderr += chunk.toString();
              });
              child.on("close", (code) => {
                if (code === 0) {
                  console.log(
                    `[browser-plugin] Docker image "${imageName}" built successfully.`,
                  );
                  resolveBuild();
                } else {
                  const msg = `Docker build failed (exit code ${code}):\n${stderr}`;
                  console.error(`[browser-plugin] ${msg}`);
                  rejectBuild(new Error(msg));
                }
              });
            },
          });
        },
      });
    },
  };
}
