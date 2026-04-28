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

export interface StepEventData {
  /** Concatenated text blocks from this assistant message. */
  text?: string;
  /** Concatenated thinking content from this assistant message. */
  thinking?: string;
  /** Tools the model invoked in this turn. */
  toolUses?: Array<{ id: string; name: string; input: unknown }>;
  /** Stop reason on the assistant message, if any. */
  stopReason?: string | null;
  /** Token usage for this turn (input + output). */
  usage?: { input?: number; output?: number };
}

export interface ToolResultEventData {
  toolUseId: string;
  name?: string;
  content: string;
  isError?: boolean;
}

export interface ClaudeRunOptions {
  config: MuteworkerConfig;
  logger: Logger;
  jobId: number;
  systemPrompt: string;
  mcpToolDefs: McpToolDef[];
  /** Override the model ID from config for this run. */
  modelId?: string;
  /** Called on each assistant turn with rich content data. */
  onStep?: (data: StepEventData) => void;
  /** Called when a tool result comes back from a user message. */
  onToolResult?: (data: ToolResultEventData) => void;
}

export interface ClaudeExecutionResult {
  reply: string | null;
  steps: number;
}

export async function runWithClaude(
  prompt: string,
  options: ClaudeRunOptions,
): Promise<ClaudeExecutionResult | null> {
  const {
    config,
    logger,
    jobId,
    systemPrompt,
    mcpToolDefs,
    modelId,
    onStep,
    onToolResult,
  } = options;
  const toolNameById = new Map<string, string>();

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
        const stepData = summarizeAssistantMessage(message.message);
        if (stepData.toolUses) {
          for (const tu of stepData.toolUses) {
            toolNameById.set(tu.id, tu.name);
          }
        }
        onStep?.(stepData);
      }

      if (message.type === "user" && onToolResult) {
        emitToolResults(message, toolNameById, onToolResult);
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

const MAX_TEXT_CHARS = 1500;
const MAX_THINKING_CHARS = 1500;
const MAX_TOOL_INPUT_CHARS = 1500;
const MAX_TOOL_RESULT_CHARS = 2000;

function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  return s.slice(0, max) + `… (${s.length - max} more chars)`;
}

function summarizeAssistantMessage(msg: any): StepEventData {
  const content = Array.isArray(msg?.content) ? msg.content : [];
  const textParts: string[] = [];
  const thinkingParts: string[] = [];
  const toolUses: Array<{ id: string; name: string; input: unknown }> = [];

  for (const block of content) {
    if (!block || typeof block !== "object") continue;
    if (block.type === "text" && typeof block.text === "string") {
      textParts.push(block.text);
    } else if (
      block.type === "thinking" &&
      typeof block.thinking === "string"
    ) {
      thinkingParts.push(block.thinking);
    } else if (block.type === "tool_use") {
      toolUses.push({
        id: String(block.id ?? ""),
        name: String(block.name ?? ""),
        input: truncateToolInput(block.input),
      });
    }
  }

  const out: StepEventData = {};
  if (textParts.length > 0) {
    out.text = truncate(textParts.join("\n\n"), MAX_TEXT_CHARS);
  }
  if (thinkingParts.length > 0) {
    out.thinking = truncate(thinkingParts.join("\n\n"), MAX_THINKING_CHARS);
  }
  if (toolUses.length > 0) {
    out.toolUses = toolUses;
  }
  if (msg?.stop_reason !== undefined) {
    out.stopReason = msg.stop_reason ?? null;
  }
  if (msg?.usage) {
    out.usage = {
      input: msg.usage.input_tokens,
      output: msg.usage.output_tokens,
    };
  }
  return out;
}

function truncateToolInput(input: unknown): unknown {
  // For string/primitive inputs, just truncate. For objects, JSON-stringify
  // truncate, then re-store as a string preview to keep payload bounded.
  if (input == null) return input;
  if (typeof input === "string") return truncate(input, MAX_TOOL_INPUT_CHARS);
  try {
    const s = JSON.stringify(input);
    if (s.length <= MAX_TOOL_INPUT_CHARS) return input;
    return { _preview: truncate(s, MAX_TOOL_INPUT_CHARS) };
  } catch {
    return String(input).slice(0, MAX_TOOL_INPUT_CHARS);
  }
}

function emitToolResults(
  message: any,
  toolNameById: Map<string, string>,
  onToolResult: (data: ToolResultEventData) => void,
): void {
  const content = message?.message?.content;
  if (!Array.isArray(content)) return;
  for (const block of content) {
    if (!block || block.type !== "tool_result") continue;
    const id = String(block.tool_use_id ?? "");
    const text = extractToolResultText(block.content);
    onToolResult({
      toolUseId: id,
      name: toolNameById.get(id),
      content: truncate(text, MAX_TOOL_RESULT_CHARS),
      isError: block.is_error === true,
    });
  }
}

function extractToolResultText(content: unknown): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return JSON.stringify(content ?? "");
  const parts: string[] = [];
  for (const c of content) {
    if (c && typeof c === "object" && (c as any).type === "text") {
      parts.push(String((c as any).text ?? ""));
    } else {
      try {
        parts.push(JSON.stringify(c));
      } catch {
        parts.push(String(c));
      }
    }
  }
  return parts.join("\n");
}
