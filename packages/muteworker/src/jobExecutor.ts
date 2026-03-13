import {
  createMuteworkerPluginContext,
  type MuteworkerPlugin,
  type MuteworkerPluginContext,
  type RunAgentFn,
  type RunAgentOptions,
} from "@sandclaw/muteworker-plugin-api";
import type { MuteworkerApiClient } from "./apiClient.js";
import type { MuteworkerConfig } from "./config.js";
import type { Logger } from "./logger.js";
import { runWithClaude } from "./claudeRuntime.js";
import { getMcpToolDefs } from "./tools/index.js";
import type { Artifact } from "./tools/index.js";
import type { MuteworkerJobResult, MuteworkerQueueJob } from "./types.js";

class ExecutionError extends Error {
  constructor(
    public readonly kind:
      | "ModelError"
      | "Timeout"
      | "PolicyViolation"
      | "ParseError",
    message: string,
  ) {
    super(message);
  }
}

export interface JobArgs {
  client: MuteworkerApiClient;
  config: MuteworkerConfig;
  logger: Logger;
  job: MuteworkerQueueJob;
  plugins: MuteworkerPlugin[];
  toolFactories: Array<(ctx: MuteworkerPluginContext) => any[]>;
  buildSystemPrompt: () => Promise<string>;
  reportStatus?: (event: {
    jobId: number;
    event: string;
    prompt?: string;
    systemPrompt?: string;
    toolNames?: string[];
    data?: Record<string, unknown>;
    createdAt?: number;
  }) => void;
}

export async function executeMuteworkerJob(
  args: JobArgs,
): Promise<MuteworkerJobResult> {
  const { config, logger, job } = args;
  const artifacts: Artifact[] = [];
  const startTime = Date.now();

  // Fire-and-forget status reporter
  const reportStatus = args.reportStatus
    ? (ev: string, data?: Record<string, unknown>) => {
        args.reportStatus!({
          jobId: job.id,
          event: ev,
          data,
          createdAt: Date.now(),
        });
      }
    : undefined;

  logger.info("job.execution.started", {
    jobId: job.id,
    jobType: job.jobType,
    timeoutMs: config.jobTimeoutMs,
    maxTurns: config.maxTurns,
  });

  try {
    const pluginCtx = createMuteworkerPluginContext({
      gatekeeperInternalUrl: config.gatekeeperInternalUrl,
      gatekeeperExternalUrl: config.gatekeeperExternalUrl,
      logger,
      job,
      artifacts,
    });

    // Build system prompt, instantiate tools, and convert to MCP defs once upfront
    const systemPrompt = await args.buildSystemPrompt();
    const rawTools: any[] = [];
    for (const factory of args.toolFactories) {
      rawTools.push(...factory(pluginCtx));
    }
    const toolNames = rawTools
      .map((t: any) => t.name as string)
      .filter(Boolean);
    const mcpToolDefs = getMcpToolDefs(rawTools, { config, logger, job });

    // Emit "started" event
    reportStatus?.("started", {
      jobType: job.jobType,
      prompt: job.data,
      systemPrompt,
      toolNames,
    });

    const runAgent: RunAgentFn = async (
      prompt: string,
      opts?: RunAgentOptions,
    ) => {
      const effectiveSystemPrompt = opts?.systemPrompt
        ? `${opts.systemPrompt}\n\n${systemPrompt}`
        : systemPrompt;

      const result = await runWithClaude(prompt, {
        config,
        logger,
        jobId: job.id,
        systemPrompt: effectiveSystemPrompt,
        mcpToolDefs,
        onStep: reportStatus ? () => reportStatus("step") : undefined,
      });
      return { reply: result?.reply ?? null };
    };

    // Find a plugin that handles this job type
    let handled = false;
    for (const plugin of args.plugins) {
      const handler = plugin.jobHandlers?.[job.jobType];
      if (handler) {
        await withTimeout(handler(pluginCtx, runAgent), config.jobTimeoutMs);
        handled = true;
        break;
      }
    }

    // Default handler: run Claude agent with the raw job data as the prompt
    if (!handled) {
      const prompt = job.data;
      if (!prompt) {
        return {
          jobId: job.id,
          status: "success",
          summary: "No job data provided",
          artifacts,
          logs: { durationMs: Date.now() - startTime, steps: 0 },
        };
      }

      logger.info("job.execution.default_handler", {
        jobId: job.id,
        jobType: job.jobType,
      });
      await withTimeout(runAgent(prompt), config.jobTimeoutMs);
    }

    const durationMs = Date.now() - startTime;
    reportStatus?.("completed", { durationMs });

    return {
      jobId: job.id,
      status: "success",
      summary: "Job completed",
      artifacts,
      logs: { durationMs, steps: artifacts.length },
    };
  } catch (error) {
    const durationMs = Date.now() - startTime;
    const message =
      error instanceof Error ? error.message : "Unknown job execution error";
    const kind = error instanceof ExecutionError ? error.kind : "ModelError";

    logger.error("job.execution.failed", {
      jobId: job.id,
      durationMs,
      kind,
      error: message,
    });

    reportStatus?.("failed", { durationMs, error: message });

    return {
      jobId: job.id,
      status: "failed",
      summary: "Muteworker job execution failed",
      artifacts,
      logs: { durationMs, steps: 0 },
      error: { kind, message },
    };
  }
}

async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
): Promise<T> {
  let handle: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_, reject) => {
    handle = setTimeout(
      () => reject(new ExecutionError("Timeout", "Job timeout exceeded")),
      timeoutMs,
    );
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    if (handle) clearTimeout(handle);
  }
}
