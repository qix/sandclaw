import {
  query,
  tool,
  createSdkMcpServer,
  type SDKResultSuccess,
  type SDKResultError,
} from "@anthropic-ai/claude-agent-sdk";
import type { MuteworkerConfig } from "./config.js";
import type { Logger } from "./logger.js";
import type { McpToolDef } from "./tools/index.js";

export interface ClaudeRunOptions {
  config: MuteworkerConfig;
  logger: Logger;
  jobId: number;
  systemPrompt: string;
  mcpToolDefs: McpToolDef[];
  /** Override the model ID from config for this run. */
  modelId?: string;
  /** Called on each assistant turn. */
  onStep?: () => void;
}

export interface ClaudeExecutionResult {
  reply: string | null;
  steps: number;
}

export async function runWithClaude(
  prompt: string,
  options: ClaudeRunOptions,
): Promise<ClaudeExecutionResult | null> {
  const { config, logger, jobId, systemPrompt, mcpToolDefs, modelId, onStep } = options;

  // Build MCP tools using the SDK's tool() helper
  const sdkTools = mcpToolDefs.map((def) =>
    tool(def.name, def.description, def.zodShape, async (args) => {
      return def.handler(args as Record<string, unknown>);
    }),
  );

  // Create MCP server config if we have tools
  const mcpServers: Record<string, any> = {};
  if (sdkTools.length > 0) {
    mcpServers["muteworker-plugins"] = createSdkMcpServer({
      name: "muteworker-plugins",
      version: "1.0.0",
      tools: sdkTools,
    });
  }

  // Set up abort controller for job timeout
  const abortController = new AbortController();
  const timeoutHandle = setTimeout(() => {
    logger.error("agent.timeout_abort", {
      jobId,
      timeoutMs: config.jobTimeoutMs,
    });
    abortController.abort();
  }, config.jobTimeoutMs);

  let reply: string | null = null;
  let numTurns = 0;

  try {
    const conversation = query({
      prompt,
      options: {
        systemPrompt: systemPrompt || undefined,
        model: modelId ?? config.modelId,
        maxTurns: config.maxTurns,
        permissionMode: config.permissionMode,
        allowDangerouslySkipPermissions:
          config.permissionMode === "bypassPermissions",
        mcpServers,
        tools:
          config.allowedBuiltInTools.length > 0
            ? config.allowedBuiltInTools
            : [],
        abortController,
      },
    });

    for await (const message of conversation) {
      if (message.type === "assistant") {
        logger.debug("claude.step", { jobId });
        onStep?.();
      }

      if (message.type === "result") {
        if (message.subtype === "success") {
          const success = message as SDKResultSuccess;
          numTurns = success.num_turns;
          reply = success.result ?? null;
        } else {
          const error = message as SDKResultError;
          numTurns = error.num_turns;
          logger.error("claude.result.error", {
            jobId,
            subtype: error.subtype,
            errors: error.errors,
          });
          if (error.errors.length > 0) {
            reply = error.errors.join("\n");
          }
        }
      }
    }
  } finally {
    clearTimeout(timeoutHandle);
  }

  if (!reply) return null;

  return {
    reply,
    steps: numTurns,
  };
}
