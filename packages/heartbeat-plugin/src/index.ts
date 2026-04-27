import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import { gatekeeperDeps, createContext } from "@sandclaw/gatekeeper-plugin-api";
import type {
  GatekeeperPlugin,
  PluginEnvironment,
} from "@sandclaw/gatekeeper-plugin-api";
import type {
  MuteworkerEnvironment,
  MuteworkerPlugin,
  MuteworkerPluginContext,
  RunAgentFn,
} from "@sandclaw/muteworker-plugin-api";
import { localTimestamp } from "@sandclaw/util";

export interface HeartbeatPluginConfig {
  /** Path to HEARTBEAT.md, read on every hourly heartbeat. */
  heartbeatFile: string;
  /** Path to DAILY.md, read on the daily heartbeat. */
  dailyFile: string;
  /** Path where last-fired timestamps are written (e.g. memory/LAST_HEARTBEAT.md). */
  lastHeartbeatFile: string;
  /** Hour (0–23, local time) when the daily heartbeat fires. Default: 6. */
  dailyHour?: number;
  /** Tick interval in ms. Default: 60_000 (1 minute). */
  tickIntervalMs?: number;
}

const HEARTBEAT_JOB_TYPE = "heartbeat:hourly";
const DAILY_JOB_TYPE = "heartbeat:daily";

interface LastFired {
  heartbeat?: Date;
  daily?: Date;
}

async function readLastFired(file: string): Promise<LastFired> {
  let content: string;
  try {
    content = await readFile(file, "utf8");
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return {};
    throw err;
  }
  const result: LastFired = {};
  for (const line of content.split("\n")) {
    const match = line.match(/^(heartbeat|daily):\s*(\S+)\s*$/);
    if (!match) continue;
    const [, key, ts] = match;
    const d = new Date(ts);
    if (!isNaN(d.getTime())) {
      (result as Record<string, Date>)[key] = d;
    }
  }
  return result;
}

async function writeLastFired(file: string, fired: LastFired): Promise<void> {
  const lines: string[] = [];
  if (fired.heartbeat) {
    lines.push(`heartbeat: ${localTimestamp(fired.heartbeat)}`);
  }
  if (fired.daily) {
    lines.push(`daily: ${localTimestamp(fired.daily)}`);
  }
  await mkdir(dirname(file), { recursive: true });
  await writeFile(file, lines.join("\n") + "\n", "utf8");
}

async function runAgentFromJobData(
  ctx: MuteworkerPluginContext,
  runAgent: RunAgentFn,
): Promise<void> {
  const { content } = JSON.parse(ctx.job.data) as { content: string };
  await runAgent(content);
}

export function createHeartbeatPlugin(
  config: HeartbeatPluginConfig,
): GatekeeperPlugin & MuteworkerPlugin {
  const dailyHour = config.dailyHour ?? 6;
  const tickIntervalMs = config.tickIntervalMs ?? 60_000;

  return {
    id: "heartbeat",

    jobHandlers: {
      [HEARTBEAT_JOB_TYPE]: runAgentFromJobData,
      [DAILY_JOB_TYPE]: runAgentFromJobData,
    },

    registerGateway(env: PluginEnvironment) {
      env.registerInit({
        deps: {
          hooks: gatekeeperDeps.hooks,
          jobs: gatekeeperDeps.jobs,
        },
        init({ hooks, jobs }) {
          let timer: NodeJS.Timeout | undefined;
          let lastFired: LastFired = {};
          let inFlight = false;

          async function fireJob(
            jobType: string,
            file: string,
          ): Promise<void> {
            const ctx = createContext();
            let content: string;
            try {
              content = await readFile(file, "utf8");
            } catch (err) {
              console.error(`[heartbeat] Failed to read ${file}:`, err);
              return;
            }
            await jobs.createJob(ctx, {
              executor: "muteworker",
              jobType,
              data: { content },
              context: { channel: "heartbeat" },
            });
          }

          async function tick(): Promise<void> {
            if (inFlight) return;
            inFlight = true;
            try {
              const now = new Date();

              // Hourly: fire when the current hour bucket differs from last fired.
              const lastH = lastFired.heartbeat;
              const sameHour =
                !!lastH &&
                lastH.getFullYear() === now.getFullYear() &&
                lastH.getMonth() === now.getMonth() &&
                lastH.getDate() === now.getDate() &&
                lastH.getHours() === now.getHours();
              if (!sameHour) {
                await fireJob(HEARTBEAT_JOB_TYPE, config.heartbeatFile);
                lastFired.heartbeat = now;
                await writeLastFired(config.lastHeartbeatFile, lastFired);
              }

              // Daily at dailyHour local: fire if past today's dailyHour and
              // we haven't fired since today's dailyHour boundary.
              const todayBoundary = new Date(now);
              todayBoundary.setHours(dailyHour, 0, 0, 0);
              const lastD = lastFired.daily;
              const dueDaily =
                now.getTime() >= todayBoundary.getTime() &&
                (!lastD || lastD.getTime() < todayBoundary.getTime());
              if (dueDaily) {
                await fireJob(DAILY_JOB_TYPE, config.dailyFile);
                lastFired.daily = now;
                await writeLastFired(config.lastHeartbeatFile, lastFired);
              }
            } catch (err) {
              console.error("[heartbeat] tick error:", err);
            } finally {
              inFlight = false;
            }
          }

          hooks.register({
            "gatekeeper:start": async () => {
              lastFired = await readLastFired(config.lastHeartbeatFile);
              timer = setInterval(tick, tickIntervalMs);
              // Fire once immediately so a missed hour/day catches up on start.
              tick();
            },
            "gatekeeper:stop": () => {
              if (timer) clearInterval(timer);
            },
          });
        },
      });
    },

    registerMuteworker(env: MuteworkerEnvironment) {
      env.registerInit({
        deps: {},
        init() {
          // No muteworker-side state — handlers are declared above.
        },
      });
    },
  };
}
