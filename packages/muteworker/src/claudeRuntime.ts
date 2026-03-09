import {
  query,
  tool,
  createSdkMcpServer,
  type SDKResultSuccess,
  type SDKResultError,
} from "@anthropic-ai/claude-agent-sdk";
import type { Artifact, ToolArgs } from "./tools/index.js";
import { getMcpToolDefs } from "./tools/index.js";

export interface ClaudeExecutionResult {
  reply: string | null;
  artifacts: Artifact[];
  steps: number;
}

export async function runWithClaude(
  prompt: string,
  toolArgs: ToolArgs,
): Promise<ClaudeExecutionResult | null> {
  const { config } = toolArgs;
  const systemPrompt = await toolArgs.buildSystemPrompt();
  const artifacts: Artifact[] = [];

  // Convert plugin tools to MCP tool definitions
  const mcpToolDefs = getMcpToolDefs(artifacts, {
    ...toolArgs,
    context: prompt,
  });

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
    toolArgs.logger.error("agent.timeout_abort", {
      jobId: toolArgs.job.id,
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
        model: config.modelId,
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
        toolArgs.logger.debug("claude.step", {
          jobId: toolArgs.job.id,
        });
      }

      if (message.type === "result") {
        if (message.subtype === "success") {
          const success = message as SDKResultSuccess;
          numTurns = success.num_turns;
          reply = success.result ?? null;
        } else {
          const error = message as SDKResultError;
          numTurns = error.num_turns;
          toolArgs.logger.error("claude.result.error", {
            jobId: toolArgs.job.id,
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

  if (!reply && artifacts.length === 0) return null;

  return {
    reply,
    artifacts,
    steps: numTurns,
  };
}
