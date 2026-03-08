import type { ConfidantePluginContext } from "@sandclaw/confidante-plugin-api";
import { BUILDER_CONFIDANTE_JOB_TYPE } from "./constants";
import { executeBuild, type BuildConfig } from "./build";

export function createBuilderConfidanteHandlers(config: BuildConfig) {
  return {
    async [BUILDER_CONFIDANTE_JOB_TYPE](
      ctx: ConfidantePluginContext,
    ): Promise<void> {
      await executeBuild(ctx, config);
    },
  };
}
