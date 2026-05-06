import React, { useContext } from "react";
import {
  gatekeeperDeps,
  NavigationContext,
  TabVariantContext,
} from "@sandclaw/gatekeeper-plugin-api";
import { AgentJobDetailPanel } from "./components";
import type { PluginEnvironment } from "@sandclaw/gatekeeper-plugin-api";
import { StatusDot } from "@sandclaw/ui";
import { runAgentStatusMigrations } from "./migrations";
import {
  agentStatusState,
  pushEvent,
  loadRecentEvents,
  loadJobQueueData,
} from "./state";
import { AgentStatusPanel } from "./components";

export { AgentStatusPanel } from "./components";

function AgentStatusTab() {
  const { activePage } = useContext(NavigationContext);
  const variant = useContext(TabVariantContext);
  const isActive = activePage === "agent-status";

  if (variant === "dropdown") {
    return (
      <a
        href="?page=agent-status"
        className={`sc-dropdown-item ${isActive ? "active" : ""}`}
        role="menuitem"
      >
        <span className="sc-dropdown-check">{isActive ? "\u2713" : ""}</span>
        <span
          className="sc-status-dot sc-status-dot-gray"
          id="agent-status-tab-dot-mobile"
        />
        Agent Status
      </a>
    );
  }

  return (
    <a
      href="?page=agent-status"
      className={`sc-nav-link ${isActive ? "active" : ""}`}
    >
      <span
        className="sc-status-dot sc-status-dot-gray"
        id="agent-status-tab-dot-sidebar"
      />
      Agent Status
    </a>
  );
}

function AgentStatusPage() {
  const { queryParams } = useContext(NavigationContext);
  const jobId = queryParams.job ? parseInt(queryParams.job, 10) : undefined;

  if (jobId && !isNaN(jobId)) {
    const jobEvents = agentStatusState.recentEvents.filter(
      (e) => e.jobId === jobId,
    );
    return (
      <AgentJobDetailPanel
        jobId={jobId}
        events={jobEvents}
        jobQueueRow={agentStatusState.jobQueueMap.get(jobId)}
      />
    );
  }

  return (
    <AgentStatusPanel
      events={agentStatusState.recentEvents}
      jobQueueMap={agentStatusState.jobQueueMap}
    />
  );
}

export function createAgentStatusPlugin() {
  return {
    id: "agent-status" as const,

    migrations: runAgentStatusMigrations,

    registerGateway(env: PluginEnvironment) {
      env.registerInit({
        deps: {
          db: gatekeeperDeps.db,
          hooks: gatekeeperDeps.hooks,
          components: gatekeeperDeps.components,
          ws: gatekeeperDeps.ws,
          routes: gatekeeperDeps.routes,
        },
        async init({ db, hooks, components, ws, routes }) {
          // Load recent events from DB into memory
          await loadRecentEvents(db);

          // Register tab and page
          components.register("tabs:primary", AgentStatusTab);
          components.register("page:agent-status", AgentStatusPage);

          // Register cancel route
          routes.registerRoutes((app) => {
            app.post("/cancel/:id", async (c: any) => {
              const jobId = parseInt(c.req.param("id"), 10);
              if (isNaN(jobId)) {
                return c.json({ error: "Invalid job ID" }, 400);
              }

              const job = await db("job_queue").where("id", jobId).first();
              if (!job) {
                return c.json({ error: "Job not found" }, 404);
              }
              if (job.status !== "in_progress") {
                return c.json(
                  { error: `Cannot cancel job with status "${job.status}"` },
                  400,
                );
              }

              await db("job_queue").where("id", jobId).update({
                status: "cancelled",
                updated_at: new Date().toISOString(),
              });

              // Refresh in-memory state
              await loadJobQueueData(db);

              // Broadcast the cancellation to WS clients
              ws.broadcast({
                type: "agent-status:job-cancelled",
                jobId,
              });

              return c.json({ ok: true });
            });

            // Cursor-based paginated history of finished jobs.
            app.get("/history", async (c: any) => {
              const limit = Math.min(
                100,
                Math.max(
                  1,
                  parseInt(c.req.query("limit") || "20", 10) || 20,
                ),
              );
              const beforeParam = c.req.query("before");
              const beforeCursor = beforeParam
                ? parseInt(beforeParam, 10)
                : undefined;

              let query = db("job_queue").whereNotIn("status", [
                "pending",
                "in_progress",
              ]);

              if (beforeCursor && !isNaN(beforeCursor)) {
                query = query.where("id", "<", beforeCursor);
              }

              query = query.orderBy("id", "desc").limit(limit + 1);

              const rows: any[] = await query;
              const hasMore = rows.length > limit;
              const items = hasMore ? rows.slice(0, limit) : rows;

              if (items.length === 0) {
                return c.json({ jobs: [], nextCursor: null });
              }

              const jobIds = items.map((r: any) => r.id);

              const events: any[] = await db("agent_status")
                .whereIn("job_id", jobIds)
                .orderBy("id", "asc");

              const eventsByJob = new Map<number, any[]>();
              for (const ev of events) {
                if (!eventsByJob.has(ev.job_id))
                  eventsByJob.set(ev.job_id, []);
                eventsByJob.get(ev.job_id)!.push(ev);
              }

              const jobs = items.map((row: any) => {
                const jobEvents = eventsByJob.get(row.id) || [];
                const queued = jobEvents.find(
                  (e: any) => e.event === "queued",
                );
                const started = jobEvents.find(
                  (e: any) => e.event === "started",
                );
                const terminal = jobEvents.find(
                  (e: any) =>
                    e.event === "completed" || e.event === "failed",
                );
                const stepCount = jobEvents.filter(
                  (e: any) => e.event === "step",
                ).length;

                const terminalData = terminal?.data
                  ? JSON.parse(terminal.data)
                  : null;
                const queuedData = queued?.data
                  ? JSON.parse(queued.data)
                  : null;

                return {
                  jobId: row.id,
                  isSuccess:
                    terminal?.event === "completed" ||
                    row.status === "complete",
                  stepCount,
                  durationMs: terminalData?.durationMs ?? null,
                  error:
                    terminal?.event === "failed"
                      ? (terminalData?.error ?? null)
                      : null,
                  jobType: row.job_type,
                  executor: row.executor,
                  context: queuedData?.context ?? null,
                  startedAt: started?.created_at ?? null,
                  endedAt:
                    terminal?.created_at ?? row.updated_at,
                };
              });

              const nextCursor = hasMore
                ? items[items.length - 1].id
                : null;

              return c.json({ jobs, nextCursor });
            });

            // Lazy-loaded job context — used by Agent Status cards when
            // started.data exceeds the inline-rendering threshold.
            app.get("/context/:id", async (c: any) => {
              const jobId = parseInt(c.req.param("id"), 10);
              if (isNaN(jobId)) {
                return c.json({ error: "Invalid job ID" }, 400);
              }
              const row = await db("agent_status")
                .where({ job_id: jobId, event: "started" })
                .orderBy("id", "desc")
                .first();
              if (!row || !row.data) {
                return c.json({ error: "Not found" }, 404);
              }
              return c.json({ data: JSON.parse(row.data) });
            });
          });

          // Register hook to handle incoming agent status events
          hooks.register({
            "muteworker:agent-status": async (event) => {
              // Persist to DB
              await db("agent_status").insert({
                job_id: event.jobId,
                event: event.event,
                prompt: event.prompt ?? null,
                system_prompt: event.systemPrompt ?? null,
                system_prompt_sources: event.systemPromptSources
                  ? JSON.stringify(event.systemPromptSources)
                  : null,
                tool_names: event.toolNames
                  ? JSON.stringify(event.toolNames)
                  : null,
                data: event.data ? JSON.stringify(event.data) : null,
                created_at: event.createdAt,
              });

              // Update in-memory state
              pushEvent(event);

              // Refresh job_queue data for new jobs
              if (event.event === "queued" || event.event === "started") {
                await loadJobQueueData(db);
              }

              // Broadcast to all connected WS clients
              ws.broadcast({
                type: "agent-status:update",
                event,
              });
            },
          });
        },
      });
    },

    // No muteworker-side registration needed
    registerMuteworker() {},
  };
}
