import type { ConfidantePluginContext } from "@sandclaw/confidante-plugin-api";
import { BROWSER_CONFIDANTE_JOB_TYPE } from "./constants";
import { executeBrowse, type BrowseConfig } from "./browse";

export function createBrowserConfidanteHandlers(config: BrowseConfig) {
  return {
    async [BROWSER_CONFIDANTE_JOB_TYPE](
      ctx: ConfidantePluginContext,
    ): Promise<void> {
      await executeBrowse(ctx, config);
    },
  };
}
