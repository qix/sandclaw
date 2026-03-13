import { gatekeeperDeps } from "@sandclaw/gatekeeper-plugin-api";
import type { PluginEnvironment } from "@sandclaw/gatekeeper-plugin-api";
import { muteworkerDeps } from "@sandclaw/muteworker-plugin-api";
import type { MuteworkerEnvironment } from "@sandclaw/muteworker-plugin-api";
import type { ConfidanteEnvironment } from "@sandclaw/confidante-plugin-api";
import type { GoogleWorkspacePluginConfig } from "./gwsClient";
import {
  GoogleWorkspacePanel,
  GoogleWorkspaceVerificationRenderer,
} from "./components";
import { registerRoutes } from "./routes";
import { GWS_CONFIDANTE_JOB_TYPE } from "./constants";
import { createReadTool, createExecTool } from "./tools";
import { createGwsConfidanteHandlers } from "./confidanteHandlers";

export type { GoogleWorkspacePluginConfig } from "./gwsClient";
export {
  GoogleWorkspacePanel,
  GoogleWorkspaceVerificationRenderer,
} from "./components";
export { createReadTool, createExecTool } from "./tools";

export function createGoogleWorkspacePlugin(
  config: GoogleWorkspacePluginConfig = {},
) {
  return {
    id: "google-workspace" as const,
    verificationRenderer: GoogleWorkspaceVerificationRenderer,

    confidanteHandlers: createGwsConfidanteHandlers(config),

    registerGateway(env: PluginEnvironment) {
      env.registerInit({
        deps: {
          db: gatekeeperDeps.db,
          components: gatekeeperDeps.components,
          routes: gatekeeperDeps.routes,
          verifications: gatekeeperDeps.verifications,
        },
        init({ db, components, routes, verifications }) {
          components.register("page:google-workspace", GoogleWorkspacePanel);

          routes.registerRoutes((app) => registerRoutes(app, db));

          verifications.registerVerificationCallback(
            async (request, { queueJob }) => {
              await queueJob("confidante", GWS_CONFIDANTE_JOB_TYPE, {
                requestId: request.data.requestId,
                command: request.data.command,
                responseJobType: request.data.responseJobType,
                ...(request.jobContext
                  ? { jobContext: request.jobContext }
                  : {}),
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
          tools.registerTools((ctx) => [
            createReadTool(ctx, config),
            createExecTool(ctx),
          ]);
        },
      });
    },

    registerConfidante(_env: ConfidanteEnvironment) {
      // No additional init needed — confidanteHandlers are picked up automatically
    },
  };
}
