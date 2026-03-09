import * as readline from "node:readline";
import { inspect } from "node:util";
import cac from "cac";
import type {
  MuteworkerPlugin,
  MuteworkerHooks,
  MuteworkerPluginContext,
  ToolsService,
} from "@sandclaw/muteworker-plugin-api";
import { MuteworkerApiClient } from "./apiClient.js";
import { DEFAULT_CONFIG, MuteworkerConfig } from "./config.js";
import { executeMuteworkerJob } from "./jobExecutor.js";
import { createLogger } from "./logger.js";
import { MuteworkerQueueLoop } from "./queueLoop.js";

export type { MuteworkerConfig } from "./config.js";

export interface MuteworkerOptions {
  /** Plugins to load into the muteworker. */
  plugins?: MuteworkerPlugin[];
  /** Config overrides (merged with defaults). */
  config?: Partial<MuteworkerConfig>;
}

/**
 * Starts the Sandclaw Muteworker queue loop using the Claude Agent SDK.
 *
 * Polls the Gatekeeper for jobs, executes them with Claude, and marks
 * them complete.  Runs until SIGINT/SIGTERM.
 *
 * @example
 * ```ts
 * import { startMuteworker } from '@sandclaw/muteworker';
 * import { createPromptsPlugin } from '@sandclaw/prompts-plugin';
 *
 * startMuteworker({
 *   plugins: [createPromptsPlugin({ promptsDir: './prompts' })],
 *   config: { gatekeeperInternalUrl: 'http://localhost:3000' },
 * });
 * ```
 */
export async function startMuteworker(
  options: MuteworkerOptions,
): Promise<void> {
  const config: MuteworkerConfig = {
    ...DEFAULT_CONFIG,
    ...options.config,
  };
  const plugins = options.plugins ?? [];

  const logger = createLogger(config.logLevel);
  const client = new MuteworkerApiClient(config, logger);

  const { startHooks, stopHooks, toolFactories, buildSystemPrompt, runInit } =
    initializePlugins(plugins);
  await runInit();

  const loop = new MuteworkerQueueLoop(
    client,
    config,
    logger,
    plugins,
    toolFactories,
    buildSystemPrompt,
  );

  const shutdown = async () => {
    logger.info("muteworker.shutdown.requested");
    loop.stop();
    for (const fn of stopHooks) {
      await fn();
    }
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);

  logger.info("muteworker.startup", {
    gatekeeperInternalUrl: config.gatekeeperInternalUrl,
    modelId: config.modelId,
    permissionMode: config.permissionMode,
    plugins: plugins.map((p) => p.id),
  });

  // Fire start hooks
  for (const fn of startHooks) {
    await fn();
  }

  await loop.start();
}

/**
 * Initialize plugins and return the collected services.
 * Shared between the queue loop, replay, and tools listing.
 */
function initializePlugins(plugins: MuteworkerPlugin[]) {
  const startHooks: Array<() => Promise<void>> = [];
  const stopHooks: Array<() => Promise<void>> = [];
  const buildSystemPromptHooks: Array<
    (prev: string) => string | Promise<string>
  > = [];
  const hooksService: MuteworkerHooks = {
    register(hooks) {
      if (hooks["muteworker:start"])
        startHooks.push(async () => hooks["muteworker:start"]!());
      if (hooks["muteworker:stop"])
        stopHooks.push(async () => hooks["muteworker:stop"]!());
      if (hooks["muteworker:build-system-prompt"])
        buildSystemPromptHooks.push(hooks["muteworker:build-system-prompt"]);
    },
  };

  const toolFactories: Array<(ctx: MuteworkerPluginContext) => any[]> = [];
  const toolsService: ToolsService = {
    registerTools(factory) {
      toolFactories.push(factory);
    },
  };

  const services = new Map<string, any>();
  services.set("core.hooks", hooksService);
  services.set("core.tools", toolsService);

  const initFns: Array<() => void | Promise<void>> = [];
  for (const plugin of plugins) {
    if (!plugin.registerMuteworker) {
      throw new Error(
        `Plugin "${plugin.id}" is missing required registerMuteworker method`,
      );
    }
    plugin.registerMuteworker({
      registerInit({ deps, init }) {
        const resolved: Record<string, any> = {};
        for (const [key, ref] of Object.entries(deps)) {
          resolved[key] = services.get(ref.id);
        }
        initFns.push(() => init(resolved as any));
      },
    });
  }

  const runInit = async () => {
    for (const fn of initFns) {
      await fn();
    }
  };

  const buildSystemPrompt = async (): Promise<string> => {
    let prompt = "";
    for (const hook of buildSystemPromptHooks) {
      prompt = await hook(prompt);
    }
    return prompt;
  };

  return {
    startHooks,
    stopHooks,
    toolFactories,
    buildSystemPrompt,
    runInit,
  };
}

/**
 * Muteworker CLI script entry point.
 *
 * Uses `cac` for subcommand parsing:
 *   - (default)          — Start the queue loop.
 *   - `tools`            — List all available tools and exit.
 *   - `replay <id>`      — Replay a specific job by ID.
 */
export async function muteworkerScript(
  options: MuteworkerOptions,
): Promise<void> {
  const cli = cac("muteworker");

  cli.command("", "Start the queue loop").action(async () => {
    await startMuteworker(options);
  });

  cli
    .command("tools", "List all available tools and exit")
    .action(async () => {
      await handleToolsCommand(options);
    });

  cli
    .command(
      "tool <name> [options]",
      "Invoke a single tool by name with JSON options",
    )
    .action(async (name: string, optionsJson: string | undefined) => {
      await handleToolCommand(options, name, optionsJson);
    });

  cli
    .command("replay <id>", "Replay a specific job by ID")
    .action(async (id: string) => {
      const jobId = parseInt(id, 10);
      if (isNaN(jobId)) {
        console.error("Error: replay requires a numeric job ID.");
        process.exit(1);
      }
      await handleReplayCommand(options, jobId);
    });

  cli.help();
  cli.parse();
}

/**
 * List all available tools from plugins and exit.
 */
async function handleToolsCommand(options: MuteworkerOptions): Promise<void> {
  const plugins = options.plugins ?? [];
  const { toolFactories, runInit } = initializePlugins(plugins);
  await runInit();

  // Create a dummy context to collect tool definitions
  const dummyCtx: MuteworkerPluginContext = {
    gatekeeperInternalUrl: "",
    gatekeeperExternalUrl: "",
    logger: {
      debug() {},
      info() {},
      warn() {},
      error() {},
    },
    job: { id: 0, jobType: "", data: "{}" },
    artifacts: [],
  };

  const allTools: { name: string; description: string; plugin: string }[] = [];
  for (const factory of toolFactories) {
    const tools = factory(dummyCtx);
    for (const tool of tools) {
      allTools.push({
        name: tool.name,
        description: tool.description ?? "",
        plugin: "",
      });
    }
  }

  if (allTools.length === 0) {
    console.log("No tools registered.");
    return;
  }

  console.log(`\nAvailable tools (${allTools.length}):\n`);
  for (const tool of allTools) {
    console.log(`  ${tool.name}`);
    if (tool.description) {
      console.log(`    ${tool.description}`);
    }
  }
  console.log();
}

/**
 * Invoke a single tool by name with optional JSON params.
 */
async function handleToolCommand(
  options: MuteworkerOptions,
  toolName: string,
  optionsJson: string | undefined,
): Promise<void> {
  const config: MuteworkerConfig = { ...DEFAULT_CONFIG, ...options.config };
  const plugins = options.plugins ?? [];
  const { toolFactories, runInit } = initializePlugins(plugins);
  await runInit();

  let params: Record<string, unknown> = {};
  if (optionsJson) {
    try {
      params = JSON.parse(optionsJson);
    } catch (e) {
      console.error(
        `Error: invalid JSON options: ${(e as Error).message}`,
      );
      process.exit(1);
    }
  }

  // Create a context with real gatekeeper URL for tools that call the API
  const ctx: MuteworkerPluginContext = {
    gatekeeperInternalUrl: config.gatekeeperInternalUrl,
    gatekeeperExternalUrl: config.gatekeeperExternalUrl,
    logger: {
      debug() {},
      info() {},
      warn() {},
      error() {},
    },
    job: { id: 0, jobType: "tool-cli", data: "{}" },
    artifacts: [],
  };

  // Collect all tools across plugin factories
  let matchedTool: any = null;
  for (const factory of toolFactories) {
    const tools = factory(ctx);
    for (const tool of tools) {
      if (tool.name === toolName) {
        matchedTool = tool;
        break;
      }
    }
    if (matchedTool) break;
  }

  if (!matchedTool) {
    console.error(`Error: tool "${toolName}" not found.`);
    console.error("Run `muteworker tools` to see available tools.");
    process.exit(1);
  }

  try {
    const result = await matchedTool.execute(`cli_${Date.now()}`, params);

    if (result && result.content && Array.isArray(result.content)) {
      for (const part of result.content) {
        if (part && typeof part === "object" && "text" in part) {
          console.log(part.text);
        }
      }
    } else if (typeof result === "string") {
      console.log(result);
    } else {
      console.log(inspect(result, { colors: true, depth: null }));
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`Tool error: ${message}`);
    process.exitCode = 1;
  }
}

/**
 * Replay a specific job by ID.
 */
async function handleReplayCommand(
  options: MuteworkerOptions,
  replayJobId: number,
): Promise<void> {
  const config: MuteworkerConfig = { ...DEFAULT_CONFIG, ...options.config };
  const plugins = options.plugins ?? [];
  const logger = createLogger(config.logLevel);
  const client = new MuteworkerApiClient(config, logger);

  const { startHooks, stopHooks, toolFactories, buildSystemPrompt, runInit } =
    initializePlugins(plugins);
  await runInit();

  for (const fn of startHooks) {
    await fn();
  }

  // Fetch the job
  const job = await client.getJob(replayJobId);
  if (!job) {
    logger.error("replay.job.not_found", { jobId: replayJobId });
    console.error(`Job ${replayJobId} not found.`);
    process.exitCode = 1;
    for (const fn of stopHooks) {
      await fn();
    }
    return;
  }

  // Display job details
  console.log("\n--- Job Details ---");
  console.log(`  ID:      ${job.id}`);
  console.log(`  Type:    ${job.jobType}`);
  console.log(`  Status:  ${job.status}`);
  console.log(
    `  Data:    ${inspect(JSON.parse(job.data), { colors: true, depth: null }).replace(/\n/g, "\n           ")}`,
  );
  console.log("-------------------\n");

  // Prompt for confirmation
  const confirmed = await confirm("Proceed with executing this job?");
  if (!confirmed) {
    console.log("Aborted.");
    for (const fn of stopHooks) {
      await fn();
    }
    return;
  }

  // Execute the job using the same path as the queue loop
  logger.info("replay.job.started", { jobId: job.id, jobType: job.jobType });
  const result = await executeMuteworkerJob({
    client,
    config,
    logger,
    job,
    plugins,
    toolFactories,
    buildSystemPrompt,
  });

  await client.markComplete(job.id);

  if (result.status === "success") {
    logger.info("replay.job.completed", {
      jobId: job.id,
      durationMs: result.logs.durationMs,
    });
    console.log(
      `Job ${job.id} completed successfully (${result.logs.durationMs}ms).`,
    );
  } else {
    logger.warn("replay.job.failed", {
      jobId: job.id,
      errorKind: result.error?.kind ?? "unknown",
      error: result.error?.message ?? "no error message",
    });
    console.error(
      `Job ${job.id} failed: ${result.error?.message ?? "unknown error"}`,
    );
    process.exitCode = 1;
  }

  for (const fn of stopHooks) {
    await fn();
  }
}

function confirm(question: string): Promise<boolean> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  return new Promise((resolve) => {
    rl.question(`${question} [y/N] `, (answer) => {
      rl.close();
      resolve(answer.trim().toLowerCase() === "y");
    });
  });
}
