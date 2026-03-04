import { AgentTool } from '@mariozechner/pi-agent-core';
import type { MuteworkerPluginContext } from '@sandclaw/muteworker-plugin-api';
import type { MuteworkerApiClient } from '../apiClient';
import type { MuteworkerConfig } from '../config';
import type { Logger } from '../logger';
import type { MuteworkerQueueJob } from '../types';

export interface Artifact {
  type: 'text';
  label: string;
  value: string;
}

export interface ToolArgs {
  client: MuteworkerApiClient;
  config: MuteworkerConfig;
  logger: Logger;
  job: MuteworkerQueueJob;
  toolFactories: Array<(ctx: MuteworkerPluginContext) => any[]>;
  buildSystemPrompt: () => Promise<string>;
  /** The user prompt string for the current job (used for browser context). */
  context: string;
}

export function getTools(artifacts: Artifact[], args: ToolArgs): AgentTool[] {
  const tools: AgentTool[] = [];

  // Plugin-contributed tools (via ToolsService)
  const ctx = toPluginContext(artifacts, args);
  for (const factory of args.toolFactories) {
    tools.push(...(factory(ctx) as AgentTool[]));
  }

  args.logger.info('tools.assembled', {
    jobId: args.job.id,
    toolCount: tools.length,
    toolNames: tools.map((t) => t.name),
  });

  return tools.map((tool) => withToolCallLogging(tool, args));
}

export function toPluginContext(
  artifacts: Artifact[],
  args: ToolArgs,
): MuteworkerPluginContext {
  return {
    apiBaseUrl: args.config.apiBaseUrl,
    verificationUiUrl: args.config.verificationUiUrl,
    logger: args.logger,
    job: args.job,
    artifacts,
  };
}

function withToolCallLogging(tool: AgentTool, args: ToolArgs): AgentTool {
  return {
    ...tool,
    execute: async (toolCallId: string, params: unknown) => {
      args.logger.info('tool.called', { jobId: args.job.id, tool: tool.name, params });
      return tool.execute(toolCallId, params);
    },
  };
}
