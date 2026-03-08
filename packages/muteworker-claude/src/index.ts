import * as readline from "node:readline";
import { inspect } from "node:util";
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

export interface MuteworkerScriptOptions extends MuteworkerOptions {
  /** Replay a specific job by ID instead of running the queue loop. */
  replayJobId?: number;
}

/**
 * Starts the Sandclaw Muteworker queue loop using the Claude Agent SDK.
 *
 * Polls the Gatekeeper for jobs, executes them with Claude, and marks
 * them complete.  Runs until SIGINT/SIGTERM.
 *
 * @example
 * ```ts
 * import { startMuteworker } from '@sandclaw/muteworker-claude';
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

  // Plugin lifecycle: create services, run registerMuteworker + init
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

  // Collected tool factories from plugins
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
  for (const fn of initFns) {
    await fn();
  }

  // Build the system prompt pipeline
  const buildSystemPrompt = async (): Promise<string> => {
    let prompt = "";
    for (const hook of buildSystemPromptHooks) {
      prompt = await hook(prompt);
    }
    return prompt;
  };

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
 * Muteworker CLI script entry point.
 *
 * When `replayJobId` is set, fetches the specified job from the gatekeeper,
 * displays its details, prompts for confirmation, and executes it.
 * Otherwise falls through to the normal queue loop.
 */
export async function muteworkerScript(
  options: MuteworkerScriptOptions,
): Promise<void> {
  if (options.replayJobId == null) {
    return startMuteworker(options);
  }

  const config: MuteworkerConfig = { ...DEFAULT_CONFIG, ...options.config };
  const plugins = options.plugins ?? [];
  const logger = createLogger(config.logLevel);
  const client = new MuteworkerApiClient(config, logger);

  // Initialize plugins
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
  for (const fn of initFns) {
    await fn();
  }

  const buildSystemPrompt = async (): Promise<string> => {
    let prompt = "";
    for (const hook of buildSystemPromptHooks) {
      prompt = await hook(prompt);
    }
    return prompt;
  };

  for (const fn of startHooks) {
    await fn();
  }

  // Fetch the job
  const job = await client.getJob(options.replayJobId);
  if (!job) {
    logger.error("replay.job.not_found", { jobId: options.replayJobId });
    console.error(`Job ${options.replayJobId} not found.`);
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
