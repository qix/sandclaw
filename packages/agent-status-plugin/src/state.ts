import type { AgentStatusEvent } from "@sandclaw/gatekeeper-plugin-api";

const MAX_RECENT = 200;

export interface AgentStatusState {
  recentEvents: AgentStatusEvent[];
}

// Use globalThis to survive HMR / re-imports in dev
const KEY = "__sandclaw_agentStatusState__";

function getOrCreate(): AgentStatusState {
  if (!(globalThis as any)[KEY]) {
    (globalThis as any)[KEY] = { recentEvents: [] } satisfies AgentStatusState;
  }
  return (globalThis as any)[KEY];
}

export const agentStatusState = getOrCreate();

export function pushEvent(event: AgentStatusEvent): void {
  agentStatusState.recentEvents.push(event);
  if (agentStatusState.recentEvents.length > MAX_RECENT) {
    agentStatusState.recentEvents.splice(
      0,
      agentStatusState.recentEvents.length - MAX_RECENT,
    );
  }
}

export async function loadRecentEvents(db: any): Promise<void> {
  const rows = await db("agent_status")
    .orderBy("id", "desc")
    .limit(MAX_RECENT);

  agentStatusState.recentEvents = rows.reverse().map((r: any) => ({
    jobId: r.job_id,
    event: r.event,
    prompt: r.prompt ?? undefined,
    systemPrompt: r.system_prompt ?? undefined,
    toolNames: r.tool_names ? JSON.parse(r.tool_names) : undefined,
    data: r.data ? JSON.parse(r.data) : undefined,
    createdAt: r.created_at,
  }));
}
