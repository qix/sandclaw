import { AgentTool } from '@mariozechner/pi-agent-core';
import type { MuteworkerPluginContext } from '@sandclaw/muteworker-plugin-api';
import type { MuteworkerApiClient } from '../apiClient';
import type { MuteworkerConfig } from '../config';
import type { Logger } from '../logger';
import {
  createLoopDetectionState,
  detectToolCallLoop,
  recordToolCall,
  recordToolCallOutcome,
  shouldEmitWarning,
  type LoopDetectionState,
} from '../tool-loop-detection';
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

  // Per-job loop detection state shared across all tools
  const loopState = createLoopDetectionState();

  return tools.map((tool) => withLoopDetection(tool, args, loopState));
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

function withLoopDetection(
  tool: AgentTool,
  args: ToolArgs,
  loopState: LoopDetectionState,
): AgentTool {
  const loopConfig = args.config.loopDetection;
  return {
    ...tool,
    execute: async (toolCallId: string, params: unknown) => {
      args.logger.info('tool.called', { jobId: args.job.id, tool: tool.name, params });

      // Check for stuck loops before executing
      const detection = detectToolCallLoop(loopState, tool.name, params, loopConfig);

      if (detection.stuck && detection.level === 'critical') {
        args.logger.error('tool.loop.blocked', {
          jobId: args.job.id,
          tool: tool.name,
          detector: detection.detector,
          count: detection.count,
        });
        // Record the call so the circuit breaker counter keeps advancing
        recordToolCall(loopState, tool.name, params, toolCallId, loopConfig);
        throw new Error(detection.message);
      }

      let warningMessage: string | undefined;
      if (detection.stuck && detection.level === 'warning') {
        if (shouldEmitWarning(loopState, detection.warningKey, detection.count)) {
          args.logger.warn('tool.loop.warning', {
            jobId: args.job.id,
            tool: tool.name,
            detector: detection.detector,
            count: detection.count,
          });
          warningMessage = detection.message;
        }
      }

      // Record this call in history
      recordToolCall(loopState, tool.name, params, toolCallId, loopConfig);

      // Execute the actual tool
      try {
        const result = await tool.execute(toolCallId, params);

        // Record outcome for no-progress detection
        recordToolCallOutcome(
          loopState,
          { toolName: tool.name, toolParams: params, toolCallId, result },
          loopConfig,
        );

        // Prepend warning to result content so the LLM sees it
        if (warningMessage) {
          return {
            ...result,
            content: [{ type: 'text' as const, text: warningMessage }, ...result.content],
          };
        }
        return result;
      } catch (error) {
        // Record error outcome for no-progress detection
        recordToolCallOutcome(
          loopState,
          { toolName: tool.name, toolParams: params, toolCallId, error },
          loopConfig,
        );
        throw error;
      }
    },
  };
}
