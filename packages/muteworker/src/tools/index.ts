import { AgentTool } from '@mariozechner/pi-agent-core';
import type { MuteworkerPlugin, MuteworkerPluginContext } from '@sandclaw/muteworker-plugin-api';
import type { MuteworkerApiClient } from '../apiClient';
import type { MuteworkerConfig } from '../config';
import type { Logger } from '../logger';
import type { MuteworkerQueueJob } from '../types';
import { createGoogleMapsTool } from './google_maps';
import { createMemoryTools } from './memory';
import { createPromptTools } from './prompts';
import { createBraveWebSearchTool } from './web_search';

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
  plugins: MuteworkerPlugin[];
  promptsDir: string;
  memoryDir: string;
  /** The user prompt string for the current job (used for browser context). */
  context: string;
}

export function getTools(artifacts: Artifact[], args: ToolArgs): AgentTool[] {
  const tools: AgentTool[] = [];

  // Built-in tools
  tools.push(createBraveWebSearchTool(artifacts, args));
  tools.push(createGoogleMapsTool(artifacts, args));
  tools.push(...createMemoryTools(artifacts, args.memoryDir));
  tools.push(...createPromptTools(artifacts, args.promptsDir));

  // Plugin-contributed tools
  const ctx = toPluginContext(artifacts, args);
  for (const plugin of args.plugins) {
    if (plugin.tools) {
      tools.push(...(plugin.tools(ctx) as AgentTool[]));
    }
  }

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
      args.logger.info('tool.called', { jobId: args.job.id, tool: tool.name });
      return tool.execute(toolCallId, params);
    },
  };
}
