import {
  createMuteworkerPluginContext,
  type MuteworkerPlugin,
  type MuteworkerPluginContext,
  type RunAgentFn,
  type RunAgentOptions,
  type SystemPromptSources,
} from "@sandclaw/muteworker-plugin-api";
import type { MuteworkerApiClient } from "./apiClient.js";
import type { MuteworkerConfig } from "./config.js";
import type { Logger } from "./logger.js";
import { localTimestamp } from "@sandclaw/util";
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
  buildSystemPrompt: () => Promise<SystemPromptSources>;
  reportStatus?: (event: {
    jobId: number;
    event: string;
    prompt?: string;
    systemPrompt?: string;
    systemPromptSources?: Record<string, string>;
    toolNames?: string[];
    data?: Record<string, unknown>;
    createdAt?: string;
  }) => void;
}

export async function executeMuteworkerJob(
  args: JobArgs,
): Promise<MuteworkerJobResult> {
  const { config, logger, job } = args;
  const artifacts: Artifact[] = [];
  const startTime = Date.now();

  const jobData = JSON.parse(job.data);

  // Fire-and-forget status reporter
  const reportStatus = (ev: string, data?: Record<string, unknown>) => {
    args.reportStatus!({
      jobId: job.id,
      event: ev,
      ...data,
      createdAt: localTimestamp(),
    });
  };

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
    const systemPromptSources = await args.buildSystemPrompt();
    const systemPrompt = sourcesToSystemPrompt(systemPromptSources);

    // Log the structured system prompt sources before calling Claude
    logger.info("job.system_prompt", {
      jobId: job.id,
      sources: Object.fromEntries(
        Object.entries(systemPromptSources).map(([k, v]) => [
          k,
          v.length > 200 ? `${v.slice(0, 200)}… (${v.length} chars)` : v,
        ]),
      ),
    });

    const rawTools: any[] = [];
    for (const factory of args.toolFactories) {
      rawTools.push(...factory(pluginCtx));
    }
    const toolNames = rawTools
      .map((t: any) => t.name as string)
      .filter(Boolean);
    const mcpToolDefs = getMcpToolDefs(rawTools, {
      config,
      logger,
      job,
      reportStatus,
    });

    const runAgent: RunAgentFn = async (
      prompt: string,
      opts?: RunAgentOptions,
    ) => {
      const effectiveSources: SystemPromptSources = opts?.systemPrompt
        ? { additional: opts.systemPrompt, ...systemPromptSources }
        : systemPromptSources;
      const effectiveSystemPrompt = sourcesToSystemPrompt(effectiveSources);

      if (opts?.systemPrompt) {
        logger.info("job.system_prompt.additional", {
          jobId: job.id,
          additionalLength: opts.systemPrompt.length,
        });
      }

      // Emit "started" with the effective sources (includes any additional
      // prompt the job handler provided, e.g. EMAIL.md).
      reportStatus("started", {
        data: jobData,
        systemPrompt: effectiveSystemPrompt,
        systemPromptSources: effectiveSources,
        toolNames,
      });

      const result = await runWithClaude(prompt, {
        config,
        logger,
        jobId: job.id,
        systemPrompt: effectiveSystemPrompt,
        mcpToolDefs,
        modelId: opts?.modelId,
        onStep: () => reportStatus("step"),
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

    if (!handled) {
      return {
        jobId: job.id,
        status: "failed",
        summary: "No job handler found",
        artifacts,
        logs: { durationMs: Date.now() - startTime, steps: 0 },
      };
    }

    const durationMs = Date.now() - startTime;
    reportStatus("completed", { data: { durationMs } });

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

    reportStatus("failed", { data: { durationMs, error: message } });

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

function sourcesToSystemPrompt(sources: SystemPromptSources): string {
  return Object.entries(sources)
    .map(
      ([filename, content]) =>
        `<PROMPT filename="${filename}">${content}</PROMPT>`,
    )
    .join("\n");
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
