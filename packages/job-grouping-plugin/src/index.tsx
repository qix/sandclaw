import React from "react";
import path from "path";
import { gatekeeperDeps, TabLink } from "@sandclaw/gatekeeper-plugin-api";
import type { PluginEnvironment } from "@sandclaw/gatekeeper-plugin-api";
import type {
  MuteworkerEnvironment,
  MuteworkerPluginContext,
  RunAgentFn,
  RunAgentOptions,
} from "@sandclaw/muteworker-plugin-api";
import { JobGroupingPage } from "./components";
import { registerRoutes } from "./routes";
import { migrations } from "./migrations";
import { startGroupingEngine } from "./groupingEngine";
import { readFile } from "node:fs/promises";

export interface JobGroupingPluginConfig {
  /** Directory where the generated rules.js file is stored. */
  rulesDir: string;
  /** Anthropic API key for code generation. */
  apiKey: string;
  /** How often to check for expired grouping windows (ms). Default: 60000 */
  flushIntervalMs?: number;
  /** Optional system prompt file for the grouped job handler. */
  systemPromptFile?: string;
}

export function createJobGroupingPlugin(config: JobGroupingPluginConfig) {
  const rulesFilePath = path.join(config.rulesDir, "rules.js");

  return {
    id: "job-grouping" as const,
    migrations,

    jobHandlers: {
      async "job-grouping:grouped"(
        ctx: MuteworkerPluginContext,
        runAgent: RunAgentFn,
      ) {
        let payload: {
          groupKey: string;
          windowStart: string;
          ruleDescription: string;
          jobCount: number;
          jobs: Array<{
            jobType: string;
            data: string;
            context: string | null;
          }>;
        };
        try {
          payload = JSON.parse(ctx.job.data);
        } catch {
          throw new Error(
            `Job ${ctx.job.id} has invalid JSON in data`,
          );
        }

        // Build a prompt summarizing all grouped jobs
        const promptParts: string[] = [
          `--- Grouped Jobs ---`,
          `Group: ${payload.groupKey}`,
          `Rule: ${payload.ruleDescription}`,
          `Window: ${payload.windowStart}`,
          `Total jobs: ${payload.jobCount}`,
          ``,
        ];

        for (let i = 0; i < payload.jobs.length; i++) {
          const job = payload.jobs[i];
          promptParts.push(`--- Job ${i + 1} (${job.jobType}) ---`);
          try {
            const data = JSON.parse(job.data);
            promptParts.push(JSON.stringify(data, null, 2));
          } catch {
            promptParts.push(job.data);
          }
          promptParts.push(``);
        }

        promptParts.push(`--- End Grouped Jobs ---`);
        promptParts.push(``);
        promptParts.push(
          `The above ${payload.jobCount} jobs were grouped together because they matched the rule: "${payload.ruleDescription}". ` +
            `Please process them as a batch.`,
        );

        const prompt = promptParts.join("\n");
        const agentOptions: RunAgentOptions = {};

        if (config.systemPromptFile) {
          try {
            agentOptions.systemPrompt = await readFile(
              config.systemPromptFile,
              "utf8",
            );
          } catch {
            // File not found — continue without it
          }
        }

        await runAgent(prompt, agentOptions);
      },
    },

    registerGateway(env: PluginEnvironment) {
      env.registerInit({
        deps: {
          db: gatekeeperDeps.db,
          hooks: gatekeeperDeps.hooks,
          components: gatekeeperDeps.components,
          routes: gatekeeperDeps.routes,
          jobs: gatekeeperDeps.jobs,
        },
        init({ db, hooks, components, routes, jobs }) {
          // Register tab and page
          function JobGroupingTab() {
            return (
              <TabLink href="?page=job-grouping" title="Job Grouping" />
            );
          }
          components.register("tabs:primary", JobGroupingTab);
          components.register("page:job-grouping", JobGroupingPage);

          // Register API routes
          routes.registerRoutes((app) =>
            registerRoutes(app, db, {
              rulesDir: config.rulesDir,
              apiKey: config.apiKey,
            }),
          );

          // Start the grouping engine
          let engine: { stop: () => void } | undefined;
          hooks.register({
            "gatekeeper:start": () => {
              engine = startGroupingEngine(
                db,
                jobs,
                rulesFilePath,
                config.flushIntervalMs ?? 60_000,
              );
            },
            "gatekeeper:stop": () => {
              engine?.stop();
            },
          });
        },
      });
    },

    registerMuteworker(env: MuteworkerEnvironment) {
      env.registerInit({
        deps: {},
        init() {
          // No muteworker-side tools or hooks needed.
          // The job handler is declared above via jobHandlers.
        },
      });
    },
  };
}
