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
import { agentStatusState, pushEvent, loadRecentEvents } from "./state";
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
        <span className="sc-status-dot sc-status-dot-gray" id="agent-status-tab-dot-mobile" />
        Agent Status
      </a>
    );
  }

  return (
    <a
      href="?page=agent-status"
      className={`sc-nav-link ${isActive ? "active" : ""}`}
    >
      <span className="sc-status-dot sc-status-dot-gray" id="agent-status-tab-dot-sidebar" />
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
    return <AgentJobDetailPanel jobId={jobId} events={jobEvents} />;
  }

  return <AgentStatusPanel events={agentStatusState.recentEvents} />;
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
        },
        async init({ db, hooks, components, ws }) {
          // Load recent events from DB into memory
          await loadRecentEvents(db);

          // Register tab and page
          components.register("tabs:primary", AgentStatusTab);
          components.register("page:agent-status", AgentStatusPage);

          // Register hook to handle incoming agent status events
          hooks.register({
            "muteworker:agent-status": async (event) => {
              // Persist to DB
              await db("agent_status").insert({
                job_id: event.jobId,
                event: event.event,
                prompt: event.prompt ?? null,
                system_prompt: event.systemPrompt ?? null,
                tool_names: event.toolNames
                  ? JSON.stringify(event.toolNames)
                  : null,
                data: event.data ? JSON.stringify(event.data) : null,
                created_at: event.createdAt,
              });

              // Update in-memory state
              pushEvent(event);

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
