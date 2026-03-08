import { z } from "zod";
import type { MuteworkerPluginContext } from "@sandclaw/muteworker-plugin-api";
import type { MuteworkerConfig } from "../config.js";
import type { Logger } from "../logger.js";
import {
  createLoopDetectionState,
  detectToolCallLoop,
  recordToolCall,
  recordToolCallOutcome,
  shouldEmitWarning,
  type LoopDetectionState,
} from "../tool-loop-detection.js";
import type { MuteworkerQueueJob } from "../types.js";

export interface Artifact {
  type: "text";
  label: string;
  value: string;
}

export interface ToolArgs {
  config: MuteworkerConfig;
  logger: Logger;
  job: MuteworkerQueueJob;
  toolFactories: Array<(ctx: MuteworkerPluginContext) => any[]>;
  buildSystemPrompt: () => Promise<string>;
  /** The user prompt string for the current job. */
  context: string;
}

export function toPluginContext(
  artifacts: Artifact[],
  args: ToolArgs,
): MuteworkerPluginContext {
  return {
    gatekeeperInternalUrl: args.config.gatekeeperInternalUrl,
    gatekeeperExternalUrl: args.config.gatekeeperExternalUrl,
    logger: args.logger,
    job: args.job,
    artifacts,
  };
}

/**
 * Convert a TypeBox/JSON Schema property definition to a Zod schema.
 * Handles the subset of types used by existing plugin tools:
 * string, number, integer, boolean, array, and optional wrappers.
 */
function jsonSchemaPropertyToZod(prop: Record<string, unknown>): z.ZodTypeAny {
  const type = prop.type as string | undefined;

  if (type === "string") {
    let schema: z.ZodTypeAny = z.string();
    if (typeof prop.description === "string") {
      schema = (schema as z.ZodString).describe(prop.description);
    }
    return schema;
  }

  if (type === "number" || type === "integer") {
    let schema: z.ZodTypeAny = z.number();
    if (typeof prop.description === "string") {
      schema = (schema as z.ZodNumber).describe(prop.description);
    }
    return schema;
  }

  if (type === "boolean") {
    let schema: z.ZodTypeAny = z.boolean();
    if (typeof prop.description === "string") {
      schema = (schema as z.ZodBoolean).describe(prop.description);
    }
    return schema;
  }

  if (type === "array") {
    const items = prop.items as Record<string, unknown> | undefined;
    const inner = items ? jsonSchemaPropertyToZod(items) : z.unknown();
    let schema: z.ZodTypeAny = z.array(inner);
    if (typeof prop.description === "string") {
      schema = schema.describe(prop.description);
    }
    return schema;
  }

  // Fallback for unknown / complex schemas
  let schema: z.ZodTypeAny = z.unknown();
  if (typeof prop.description === "string") {
    schema = schema.describe(prop.description);
  }
  return schema;
}

/**
 * Convert a TypeBox / JSON Schema object into a Zod raw shape suitable for
 * `tool()` from the Claude Agent SDK.
 */
function jsonSchemaToZodShape(
  schema: Record<string, unknown>,
): Record<string, z.ZodTypeAny> {
  const properties = (schema.properties ?? {}) as Record<
    string,
    Record<string, unknown>
  >;
  const required = (schema.required ?? []) as string[];
  const requiredSet = new Set(required);
  const shape: Record<string, z.ZodTypeAny> = {};

  for (const [key, prop] of Object.entries(properties)) {
    let zodProp = jsonSchemaPropertyToZod(prop);
    if (!requiredSet.has(key)) {
      zodProp = zodProp.optional();
    }
    shape[key] = zodProp;
  }

  return shape;
}

/**
 * Represents a single MCP tool definition ready to be passed to
 * `createSdkMcpServer()`.
 */
export interface McpToolDef {
  name: string;
  description: string;
  zodShape: Record<string, z.ZodTypeAny>;
  handler: (
    args: Record<string, unknown>,
  ) => Promise<{
    content: Array<{ type: "text"; text: string }>;
    isError?: boolean;
  }>;
}

/**
 * Assemble plugin tools into MCP tool definitions.
 *
 * Collects tools from all plugin factories, wraps each with loop detection,
 * and converts pi-agent style schemas to Zod shapes.
 */
export function getMcpToolDefs(
  artifacts: Artifact[],
  args: ToolArgs,
): McpToolDef[] {
  const ctx = toPluginContext(artifacts, args);

  // Collect all raw pi-agent style tools from plugins
  const rawTools: any[] = [];
  for (const factory of args.toolFactories) {
    rawTools.push(...factory(ctx));
  }

  args.logger.info("tools.assembled", {
    jobId: args.job.id,
    toolCount: rawTools.length,
    toolNames: rawTools.map((t: any) => t.name),
  });

  // Per-job loop detection state shared across all tools
  const loopState = createLoopDetectionState();

  return rawTools.map((tool: any) => convertToMcpTool(tool, args, loopState));
}

/**
 * Convert a single pi-agent tool into an MCP tool definition,
 * wrapping its execute function with loop detection.
 */
function convertToMcpTool(
  piTool: any,
  args: ToolArgs,
  loopState: LoopDetectionState,
): McpToolDef {
  const name: string = piTool.name;
  const description: string = piTool.description ?? "";

  // Extract the JSON Schema from the pi-agent tool.
  // Pi tools use TypeBox which produces standard JSON Schema.
  const rawSchema = piTool.schema ?? piTool.parameters ?? {};
  const zodShape = jsonSchemaToZodShape(rawSchema);

  const handler = async (
    params: Record<string, unknown>,
  ): Promise<{
    content: Array<{ type: "text"; text: string }>;
    isError?: boolean;
  }> => {
    args.logger.info("tool.called", {
      jobId: args.job.id,
      tool: name,
      params,
    });

    const loopConfig = args.config.loopDetection;

    // Check for stuck loops before executing
    const detection = detectToolCallLoop(loopState, name, params, loopConfig);

    if (detection.stuck && detection.level === "critical") {
      args.logger.error("tool.loop.blocked", {
        jobId: args.job.id,
        tool: name,
        detector: detection.detector,
        count: detection.count,
      });
      recordToolCall(loopState, name, params, undefined, loopConfig);
      return {
        content: [{ type: "text", text: detection.message }],
        isError: true,
      };
    }

    let warningMessage: string | undefined;
    if (detection.stuck && detection.level === "warning") {
      if (shouldEmitWarning(loopState, detection.warningKey, detection.count)) {
        args.logger.warn("tool.loop.warning", {
          jobId: args.job.id,
          tool: name,
          detector: detection.detector,
          count: detection.count,
        });
        warningMessage = detection.message;
      }
    }

    // Record this call in history
    recordToolCall(loopState, name, params, undefined, loopConfig);

    try {
      // Call the pi-agent tool's execute function.
      // Pi tools accept (toolCallId, params) but MCP tools just have params.
      const result = await piTool.execute(`mcp_call_${Date.now()}`, params);

      // Record outcome for no-progress detection
      recordToolCallOutcome(
        loopState,
        { toolName: name, toolParams: params, result },
        loopConfig,
      );

      // Extract text content from pi-agent tool result
      const textParts: string[] = [];
      if (warningMessage) {
        textParts.push(warningMessage);
      }
      if (result && result.content && Array.isArray(result.content)) {
        for (const part of result.content) {
          if (part && typeof part === "object" && "text" in part) {
            textParts.push(String(part.text));
          }
        }
      } else if (typeof result === "string") {
        textParts.push(result);
      }

      return {
        content: textParts.map((text) => ({ type: "text" as const, text })),
      };
    } catch (error) {
      recordToolCallOutcome(
        loopState,
        { toolName: name, toolParams: params, error },
        loopConfig,
      );

      const message = error instanceof Error ? error.message : String(error);
      return {
        content: [{ type: "text" as const, text: `Error: ${message}` }],
        isError: true,
      };
    }
  };

  return { name, description, zodShape, handler };
}
