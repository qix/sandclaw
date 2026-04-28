import type { JobSpec, JobData, JobContextData, JobService } from "@sandclaw/gatekeeper-plugin-api";
import { localTimestamp } from "@sandclaw/util";
import { readFile } from "node:fs/promises";

export interface GroupingRule {
  id: number;
  description: string;
  code: (job: {
    executor: string;
    jobType: string;
    data: JobData;
    context: JobContextData | null;
  }) => { group: string; windowMs: number } | null;
}

/**
 * Load compiled rules from the generated rules file.
 * The file exports a default array of { description, code } objects.
 */
export async function loadRules(rulesFilePath: string): Promise<GroupingRule[]> {
  try {
    const content = await readFile(rulesFilePath, "utf8");
    // The file contains a JS array assigned to module.exports
    // We use Function constructor to evaluate it safely in a limited scope
    const fn = new Function(
      "module",
      "exports",
      content + "\nreturn module.exports;",
    );
    const mod = { exports: {} as any };
    const result = fn(mod, mod.exports);
    const rules = result || mod.exports;
    if (!Array.isArray(rules)) return [];
    return rules.map((r: any, i: number) => ({
      id: i,
      description: r.description || "",
      code: r.code,
    }));
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") return [];
    console.error("[job-grouping] Failed to load rules file:", e);
    return [];
  }
}

/**
 * Evaluate all rules against a job spec.
 * Returns the first matching result or null.
 */
export function evaluateRules(
  rules: GroupingRule[],
  spec: JobSpec,
): { ruleId: number; group: string; windowMs: number } | null {
  const jobForRules = {
    executor: spec.executor,
    jobType: spec.jobType,
    data: spec.data,
    context: spec.context ?? null,
  };

  for (const rule of rules) {
    try {
      const result = rule.code(jobForRules);
      if (result && result.group && result.windowMs > 0) {
        return { ruleId: rule.id, group: result.group, windowMs: result.windowMs };
      }
    } catch (e) {
      console.error(
        `[job-grouping] Rule "${rule.description}" threw:`,
        e,
      );
    }
  }
  return null;
}

/**
 * Start the grouping engine. Registers an interceptor on the JobService
 * and runs a periodic timer to flush expired groups.
 */
export function startGroupingEngine(
  db: any,
  jobService: JobService,
  rulesFilePath: string,
  flushIntervalMs: number = 60_000,
): { stop: () => void } {
  let rules: GroupingRule[] = [];
  let rulesLoaded = false;

  async function ensureRules() {
    if (!rulesLoaded) {
      rules = await loadRules(rulesFilePath);
      rulesLoaded = true;
    }
  }

  // Reload rules periodically so new rules are picked up
  const reloadInterval = setInterval(async () => {
    rules = await loadRules(rulesFilePath);
    rulesLoaded = true;
  }, 30_000);

  // Register interceptor
  jobService.onBeforeCreateJob(async (ctx, spec) => {
    await ensureRules();
    if (rules.length === 0) return null;

    const match = evaluateRules(rules, spec);
    if (!match) return null;

    // Compute the window start (floor to the window boundary)
    const now = Date.now();
    const windowStart = new Date(
      now - (now % match.windowMs),
    ).toISOString();

    const nowTs = localTimestamp();
    const conn = ctx.trx ?? db;
    await conn("job_grouping_pending").insert({
      rule_id: match.ruleId,
      group_key: match.group,
      executor: spec.executor,
      job_type: spec.jobType,
      job_data: JSON.stringify(spec.data),
      job_context: spec.context ? JSON.stringify(spec.context) : null,
      window_start: windowStart,
      created_at: nowTs,
    });

    return { handled: true };
  });

  // Periodic flush: find groups whose window has expired and dispatch them
  const flushTimer = setInterval(() => flushExpiredGroups(), flushIntervalMs);

  async function flushExpiredGroups() {
    await ensureRules();

    // Find distinct group windows that have expired
    const now = Date.now();
    const groups = await db("job_grouping_pending")
      .select("group_key", "window_start", "executor", "job_type", "rule_id")
      .groupBy("group_key", "window_start", "executor", "job_type", "rule_id")
      .orderBy("window_start", "asc");

    for (const group of groups) {
      const windowStart = new Date(group.window_start).getTime();
      // Find the matching rule to get its windowMs
      const rule = rules.find((r) => r.id === group.rule_id);
      const windowMs = rule
        ? (() => {
            // Re-evaluate to get windowMs - use a minimal job spec
            try {
              const result = rule.code({
                executor: group.executor,
                jobType: group.job_type,
                data: {},
                context: null,
              });
              return result?.windowMs ?? 3_600_000;
            } catch {
              return 3_600_000;
            }
          })()
        : 3_600_000; // Default 1 hour

      if (now < windowStart + windowMs) continue; // Window still open

      // Collect all pending jobs in this group/window
      const pending = await db("job_grouping_pending")
        .where("group_key", group.group_key)
        .where("window_start", group.window_start)
        .orderBy("id", "asc");

      if (pending.length === 0) continue;

      // Build a grouped job payload
      const jobs = pending.map((p: any) => ({
        jobType: p.job_type,
        data: p.job_data,
        context: p.job_context,
      }));

      const groupedData = JSON.stringify({
        groupKey: group.group_key,
        windowStart: group.window_start,
        ruleId: group.rule_id,
        ruleDescription: rule?.description ?? "Unknown rule",
        jobCount: jobs.length,
        jobs,
      });

      // Insert a single grouped job directly (bypass interceptors to avoid re-grouping)
      const nowTs = localTimestamp();
      await db("job_queue").insert({
        executor: group.executor,
        job_type: "job-grouping:grouped",
        data: groupedData,
        context: JSON.stringify({
          channel: "job-grouping",
          originalJobType: group.job_type,
          groupKey: group.group_key,
        }),
        status: "pending",
        created_at: nowTs,
        updated_at: nowTs,
      });

      // Clean up pending entries
      const pendingIds = pending.map((p: any) => p.id);
      await db("job_grouping_pending").whereIn("id", pendingIds).delete();
    }
  }

  return {
    stop() {
      clearInterval(reloadInterval);
      clearInterval(flushTimer);
    },
  };
}
