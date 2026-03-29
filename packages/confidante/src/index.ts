import { inspect } from "node:util";
import cac from "cac";
import { confirm } from "@sandclaw/util";
import type {
  ConfidantePlugin,
  ConfidanteHooks,
} from "@sandclaw/confidante-plugin-api";
import { ConfidanteApiClient } from "./apiClient";
import { DEFAULT_CONFIG, ConfidanteConfig } from "./config";
import { DockerServiceImpl } from "./docker";
import { executeConfidanteJob } from "./jobExecutor";
import { createLogger } from "./logger";
import { ConfidanteQueueLoop } from "./queueLoop";

export type { ConfidanteConfig } from "./config";

export interface ConfidanteOptions {
  /** Plugins to load into the confidante. */
  plugins?: ConfidantePlugin[];
  /** Config overrides (merged with defaults). */
  config?: Partial<ConfidanteConfig>;
}

/**
 * Initialize plugins and return the collected services.
 * Shared between the queue loop and replay.
 */
function initializePlugins(
  plugins: ConfidantePlugin[],
  docker: DockerServiceImpl,
) {
  const startHooks: Array<() => Promise<void>> = [];
  const stopHooks: Array<() => Promise<void>> = [];
  const hooksService: ConfidanteHooks = {
    register(hooks) {
      if (hooks["confidante:start"])
        startHooks.push(async () => hooks["confidante:start"]!());
      if (hooks["confidante:stop"])
        stopHooks.push(async () => hooks["confidante:stop"]!());
    },
  };

  const services = new Map<string, any>();
  services.set("core.hooks", hooksService);
  services.set("core.docker", docker);

  const initFns: Array<() => void | Promise<void>> = [];
  for (const plugin of plugins) {
    if (plugin.registerConfidante) {
      plugin.registerConfidante({
        registerInit({ deps, init }) {
          const resolved: Record<string, any> = {};
          for (const [key, ref] of Object.entries(deps)) {
            resolved[key] = services.get(ref.id);
          }
          initFns.push(() => init(resolved as any));
        },
      });
    }
  }

  const runInit = async () => {
    for (const fn of initFns) {
      await fn();
    }
  };

  return { startHooks, stopHooks, runInit };
}

/**
 * Starts the Sandclaw Confidante queue loop.
 *
 * Polls the Gatekeeper for approved confidante jobs, executes them
 * (typically inside Docker containers), and marks them complete.
 * Runs until SIGINT/SIGTERM.
 *
 * @example
 * ```ts
 * import { startConfidante } from '@sandclaw/confidante';
 * import { createBrowserPlugin } from '@sandclaw/browser-plugin';
 *
 * startConfidante({
 *   plugins: [createBrowserPlugin()],
 *   config: { gatekeeperInternalUrl: 'http://localhost:3000' },
 * });
 * ```
 */
export async function startConfidante(
  options: ConfidanteOptions,
): Promise<void> {
  const config: ConfidanteConfig = { ...DEFAULT_CONFIG, ...options.config };
  const plugins = options.plugins ?? [];

  const logger = createLogger(config.logLevel);
  const client = new ConfidanteApiClient(config, logger);
  const docker = new DockerServiceImpl(logger);

  const { startHooks, stopHooks, runInit } = initializePlugins(plugins, docker);
  await runInit();

  const loop = new ConfidanteQueueLoop(client, config, logger, plugins, docker);

  const shutdown = async () => {
    logger.info("confidante.shutdown.requested");
    loop.stop();
    for (const fn of stopHooks) {
      await fn();
    }
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);

  logger.info("confidante.startup", {
    gatekeeperInternalUrl: config.gatekeeperInternalUrl,
    dockerImage: config.dockerImage,
    plugins: plugins.map((p) => p.id),
  });

  // Fire start hooks
  for (const fn of startHooks) {
    await fn();
  }

  await loop.start();
}

/**
 * Confidante CLI script entry point.
 *
 * Uses `cac` for subcommand parsing:
 *   - (default)          — Show help.
 *   - `worker`           — Start the queue loop.
 *   - `replay <id>`      — Replay a specific job by ID.
 */
export async function confidanteScript(
  options: ConfidanteOptions,
): Promise<void> {
  const cli = cac("confidante");

  cli.command("", "Show help").action(() => {
    cli.outputHelp();
  });

  cli.command("worker", "Start the queue loop").action(async () => {
    await startConfidante(options);
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
 * Replay a specific job by ID.
 */
async function handleReplayCommand(
  options: ConfidanteOptions,
  replayJobId: number,
): Promise<void> {
  const config: ConfidanteConfig = { ...DEFAULT_CONFIG, ...options.config };
  const plugins = options.plugins ?? [];
  const logger = createLogger(config.logLevel);
  const client = new ConfidanteApiClient(config, logger);
  const docker = new DockerServiceImpl(logger);

  const { startHooks, stopHooks, runInit } = initializePlugins(plugins, docker);
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

  // Verify this job belongs to confidante
  if (job.executor && job.executor !== "confidante") {
    console.error(
      `Error: Job ${replayJobId} has executor "${job.executor}", expected "confidante".`,
    );
    process.exit(1);
  }

  // Display job details
  console.log("\n--- Job Details ---");
  console.log(`  ID:      ${job.id}`);
  console.log(`  Type:    ${job.jobType}`);
  console.log(`  Status:  ${job.status}`);
  console.log(
    `  Data:    ${inspect(JSON.parse(job.data), { colors: process.stdout.isTTY ?? false, depth: null }).replace(/\n/g, "\n           ")}`,
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
  const result = await executeConfidanteJob({
    job,
    client,
    config,
    logger,
    plugins,
    docker,
    reportStatus: (event) => {
      client.postAgentStatus(event).catch((err) => {
        logger.warn("replay.agent_status.error", {
          jobId: job.id,
          event: event.event,
          error: err instanceof Error ? err.message : String(err),
        });
      });
    },
  });

  await client.markComplete(job.id, result.result);

  if (result.status === "success") {
    logger.info("replay.job.completed", {
      jobId: job.id,
      durationMs: result.durationMs,
    });
    console.log(
      `Job ${job.id} completed successfully (${result.durationMs}ms).`,
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
