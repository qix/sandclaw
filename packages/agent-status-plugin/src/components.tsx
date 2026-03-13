import React from "react";
import {
  Card,
  CardHeader,
  CardBody,
  PageHeader,
  StatusDot,
  colors,
} from "@sandclaw/ui";
import type { AgentStatusEvent } from "@sandclaw/gatekeeper-plugin-api";

interface AgentStatusPanelProps {
  events: AgentStatusEvent[];
}

interface AgentJobDetailPanelProps {
  jobId: number;
  events: AgentStatusEvent[];
}

/** Group events by jobId, returning jobs with their events. */
function groupByJob(events: AgentStatusEvent[]) {
  const map = new Map<number, { jobId: number; events: AgentStatusEvent[] }>();
  for (const ev of events) {
    let entry = map.get(ev.jobId);
    if (!entry) {
      entry = { jobId: ev.jobId, events: [] };
      map.set(ev.jobId, entry);
    }
    entry.events.push(ev);
  }
  return Array.from(map.values());
}

/* ── Syntax-highlight colors for JSON tree (dark theme) ── */
const jsonColors = {
  key: "oklch(0.80 0.12 60)", // warm amber for keys
  string: "oklch(0.75 0.16 152)", // green
  number: "oklch(0.78 0.14 230)", // blue
  bool: "oklch(0.74 0.16 320)", // purple
  null: "oklch(0.65 0.025 270)", // muted gray, italic
  bracket: "oklch(0.65 0.025 270)",
};

/** Render a single JSON value (primitive). */
function JsonPrimitive({ data }: { data: unknown }) {
  if (data === null)
    return (
      <span style={{ color: jsonColors.null, fontStyle: "italic" }}>null</span>
    );
  if (typeof data === "boolean")
    return <span style={{ color: jsonColors.bool }}>{String(data)}</span>;
  if (typeof data === "number")
    return <span style={{ color: jsonColors.number }}>{data}</span>;
  if (typeof data === "string") {
    const display = data.length > 300 ? data.slice(0, 300) + "…" : data;
    return (
      <span style={{ color: jsonColors.string }}>&quot;{display}&quot;</span>
    );
  }
  return <span>{String(data)}</span>;
}

/**
 * Recursive collapsible JSON tree using native <details>/<summary>.
 * Works with SSR (no hydration needed).
 */
function JsonNode({
  data,
  name,
  level = 0,
}: {
  data: unknown;
  name?: string;
  level?: number;
}): React.ReactElement {
  const keyEl = name != null && (
    <>
      <span style={{ color: jsonColors.key }}>{name}</span>
      <span style={{ color: colors.muted }}>: </span>
    </>
  );

  // Primitives — single line
  if (data === null || typeof data !== "object") {
    return (
      <div style={{ lineHeight: 1.6 }}>
        {keyEl}
        <JsonPrimitive data={data} />
      </div>
    );
  }

  const isArray = Array.isArray(data);
  const entries: [string, unknown][] = isArray
    ? (data as unknown[]).map((v, i) => [String(i), v])
    : Object.entries(data as Record<string, unknown>);

  // Empty collection
  if (entries.length === 0) {
    return (
      <div style={{ lineHeight: 1.6 }}>
        {keyEl}
        <span style={{ color: jsonColors.bracket }}>
          {isArray ? "[]" : "{}"}
        </span>
      </div>
    );
  }

  const label = isArray
    ? `Array[${entries.length}]`
    : `{${entries.length} key${entries.length !== 1 ? "s" : ""}}`;

  return (
    <details open={level < 2}>
      <summary
        style={{
          cursor: "pointer",
          userSelect: "none",
          lineHeight: 1.6,
        }}
      >
        {keyEl}
        <span style={{ color: jsonColors.bracket }}>{label}</span>
      </summary>
      <div
        style={{
          paddingLeft: "1.25rem",
          borderLeft: `1px solid ${colors.border}`,
          marginLeft: "0.5rem",
        }}
      >
        {entries.map(([k, v]) => (
          <JsonNode key={k} data={v} name={k} level={(level ?? 0) + 1} />
        ))}
      </div>
    </details>
  );
}

/** Collapsible JSON tree view inside a styled box. */
function JsonTreeView({ data }: { data: string | Record<string, unknown> }) {
  let parsed: unknown;
  if (typeof data === "string") {
    try {
      parsed = JSON.parse(data);
    } catch {
      parsed = data;
    }
  } else {
    parsed = data;
  }

  return (
    <div
      className="sc-pre"
      style={{
        fontSize: "0.75rem",
        margin: "0.25rem 0 0",
        overflow: "auto",
        maxHeight: "24rem",
      }}
    >
      <JsonNode data={parsed} level={0} />
    </div>
  );
}

/** Render the first N lines of a JSON string, with collapse if truncated. */
function CollapsibleJson({
  data,
  maxLines = 3,
}: {
  data: string;
  maxLines?: number;
}) {
  let pretty: string;
  try {
    pretty = JSON.stringify(JSON.parse(data), null, 2);
  } catch {
    pretty = data;
  }
  const lines = pretty.split("\n");
  const truncated = lines.length > maxLines;
  const preview = truncated
    ? lines.slice(0, maxLines).join("\n") + "\n…"
    : pretty;

  const boxStyle: React.CSSProperties = {
    fontSize: "0.75rem",
    margin: "0.25rem 0 0",
    overflow: "auto",
    maxHeight: "20rem",
  };

  if (!truncated) {
    return (
      <pre className="sc-pre" style={boxStyle}>
        {pretty}
      </pre>
    );
  }

  return (
    <div className="sc-pre" style={boxStyle}>
      <details style={{ margin: 0 }}>
        <summary
          style={{
            cursor: "pointer",
            color: colors.muted,
            userSelect: "none",
          }}
        >
          {preview}
        </summary>
        {pretty}
      </details>
    </div>
  );
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  const s = (ms / 1000).toFixed(1);
  return `${s}s`;
}

function formatTime(epochMs: number): string {
  return new Date(epochMs).toLocaleTimeString();
}

export function AgentStatusPanel({ events }: AgentStatusPanelProps) {
  const jobs = groupByJob(events);

  const activeJobs = jobs.filter((j) => {
    const last = j.events[j.events.length - 1];
    return last.event !== "completed" && last.event !== "failed";
  });

  const finishedJobs = jobs
    .filter((j) => {
      const last = j.events[j.events.length - 1];
      return last.event === "completed" || last.event === "failed";
    })
    .reverse(); // Most recent first

  return (
    <div className="sc-section">
      <PageHeader
        title="Agent Status"
        subtitle="Real-time observability for muteworker agent execution."
      />

      {/* Active Jobs */}
      <Card>
        <CardHeader>
          <span style={{ fontWeight: 600, color: colors.text }}>
            <StatusDot color={activeJobs.length > 0 ? "green" : "gray"} />{" "}
            Active Jobs
            <span
              id="agent-status-active-count"
              style={{
                marginLeft: "0.5rem",
                fontSize: "0.8rem",
                color: colors.muted,
              }}
            >
              ({activeJobs.length})
            </span>
          </span>
        </CardHeader>
        <CardBody>
          <div id="agent-status-active" style={{ minHeight: "2rem" }}>
            {activeJobs.length === 0 ? (
              <p
                style={{
                  color: colors.muted,
                  fontSize: "0.875rem",
                  textAlign: "center",
                  padding: "1rem 0",
                }}
              >
                No active jobs
              </p>
            ) : (
              activeJobs.map((j) => {
                const queued = j.events.find((e) => e.event === "queued");
                const started = j.events.find((e) => e.event === "started");
                const stepCount = j.events.filter(
                  (e) => e.event === "step",
                ).length;
                const isQueued = !started && !!queued;
                const jobType =
                  (started?.data?.jobType as string | undefined) ??
                  (queued?.data?.jobType as string | undefined);
                const jobData = started?.data?.prompt as string | undefined;
                const firstEvent = queued ?? started;
                return (
                  <a
                    key={j.jobId}
                    href={`?page=agent-status&job=${j.jobId}`}
                    className="agent-status-job"
                    data-job-id={j.jobId}
                    style={{
                      display: "block",
                      padding: "0.75rem",
                      background: colors.surface,
                      borderRadius: "0.5rem",
                      border: `1px solid ${colors.border}`,
                      marginBottom: "0.5rem",
                      textDecoration: "none",
                      color: "inherit",
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        marginBottom: "0.5rem",
                      }}
                    >
                      <span style={{ fontWeight: 600, fontSize: "0.875rem" }}>
                        Job #{j.jobId}
                        {jobType && (
                          <span
                            style={{
                              marginLeft: "0.5rem",
                              fontSize: "0.75rem",
                              color: colors.accent,
                              fontWeight: 500,
                            }}
                          >
                            {jobType}
                          </span>
                        )}
                      </span>
                      <span
                        style={{ fontSize: "0.75rem", color: colors.muted }}
                      >
                        {firstEvent ? formatTime(firstEvent.createdAt) : ""}
                      </span>
                    </div>
                    {jobData && <CollapsibleJson data={jobData} />}
                    <div
                      style={{
                        fontSize: "0.8rem",
                        color: isQueued ? colors.muted : colors.accent,
                        marginTop: "0.5rem",
                      }}
                      data-step-count
                    >
                      {isQueued
                        ? "Queued\u2026"
                        : `${stepCount} step${stepCount !== 1 ? "s" : ""} so far\u2026`}
                    </div>
                  </a>
                );
              })
            )}
          </div>
        </CardBody>
      </Card>

      {/* Recent History */}
      <div style={{ marginTop: "1rem" }}>
        <Card>
          <CardHeader>
            <span style={{ fontWeight: 600, color: colors.text }}>
              Recent History
              <span
                id="agent-status-history-count"
                style={{
                  marginLeft: "0.5rem",
                  fontSize: "0.8rem",
                  color: colors.muted,
                }}
              >
                ({finishedJobs.length})
              </span>
            </span>
          </CardHeader>
          <CardBody>
            <div id="agent-status-history">
              {finishedJobs.length === 0 ? (
                <p
                  style={{
                    color: colors.muted,
                    fontSize: "0.875rem",
                    textAlign: "center",
                    padding: "1rem 0",
                  }}
                >
                  No completed jobs yet
                </p>
              ) : (
                finishedJobs.map((j) => {
                  const started = j.events.find((e) => e.event === "started");
                  const terminal = j.events[j.events.length - 1];
                  const stepCount = j.events.filter(
                    (e) => e.event === "step",
                  ).length;
                  const durationMs = terminal.data?.durationMs as
                    | number
                    | undefined;
                  const isSuccess = terminal.event === "completed";
                  const jobType = started?.data?.jobType as string | undefined;
                  const jobData = started?.data?.prompt as string | undefined;
                  return (
                    <a
                      key={j.jobId}
                      href={`?page=agent-status&job=${j.jobId}`}
                      style={{
                        display: "block",
                        padding: "0.75rem",
                        background: colors.surface,
                        borderRadius: "0.5rem",
                        border: `1px solid ${colors.border}`,
                        marginBottom: "0.5rem",
                        textDecoration: "none",
                        color: "inherit",
                      }}
                    >
                      <div
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          marginBottom: "0.25rem",
                        }}
                      >
                        <span style={{ fontWeight: 600, fontSize: "0.875rem" }}>
                          Job #{j.jobId}
                          {jobType && (
                            <span
                              style={{
                                marginLeft: "0.5rem",
                                fontSize: "0.75rem",
                                color: colors.accent,
                                fontWeight: 500,
                              }}
                            >
                              {jobType}
                            </span>
                          )}
                        </span>
                        <span
                          style={{
                            fontSize: "0.75rem",
                            color: isSuccess ? colors.success : colors.danger,
                            fontWeight: 600,
                          }}
                        >
                          {isSuccess ? "Completed" : "Failed"}
                        </span>
                      </div>
                      {jobData && <CollapsibleJson data={jobData} />}
                      <div
                        style={{
                          fontSize: "0.75rem",
                          color: colors.muted,
                          display: "flex",
                          gap: "1rem",
                          marginTop: "0.5rem",
                        }}
                      >
                        <span>
                          {stepCount} step{stepCount !== 1 ? "s" : ""}
                        </span>
                        {durationMs != null && (
                          <span>{formatDuration(durationMs)}</span>
                        )}
                        {started && (
                          <span>{formatTime(started.createdAt)}</span>
                        )}
                      </div>
                      {!isSuccess && terminal.data?.error != null && (
                        <div
                          style={{
                            fontSize: "0.75rem",
                            color: colors.danger,
                            marginTop: "0.25rem",
                          }}
                        >
                          {String(terminal.data.error as string)}
                        </div>
                      )}
                    </a>
                  );
                })
              )}
            </div>
          </CardBody>
        </Card>
      </div>

      {/* Client-side live update script */}
      <script
        dangerouslySetInnerHTML={{
          __html: `
(function() {
  var activeEl = document.getElementById('agent-status-active');
  var historyEl = document.getElementById('agent-status-history');
  var activeCountEl = document.getElementById('agent-status-active-count');
  var historyCountEl = document.getElementById('agent-status-history-count');
  if (!activeEl || !historyEl) return;

  // Track jobs in memory: { jobId -> { events: [], el: DOM } }
  var activeJobs = {};
  var finishedCount = parseInt((historyCountEl && historyCountEl.textContent.replace(/[()]/g, '')) || '0', 10);

  // Initialize active jobs from SSR
  var ssrActive = activeEl.querySelectorAll('.agent-status-job');
  for (var i = 0; i < ssrActive.length; i++) {
    var el = ssrActive[i];
    var jid = parseInt(el.getAttribute('data-job-id'), 10);
    if (jid) activeJobs[jid] = { el: el };
  }

  function escapeHtml(str) {
    var div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  function formatDuration(ms) {
    if (ms < 1000) return ms + 'ms';
    return (ms / 1000).toFixed(1) + 's';
  }

  function formatTime(epochMs) {
    return new Date(epochMs).toLocaleTimeString();
  }

  function updateActiveCount() {
    var count = Object.keys(activeJobs).length;
    if (activeCountEl) activeCountEl.textContent = '(' + count + ')';
    // Update status dot
    var dot = activeCountEl && activeCountEl.parentElement && activeCountEl.parentElement.querySelector('.sc-status-dot');
    if (dot) {
      dot.className = count > 0 ? 'sc-status-dot sc-status-dot-green' : 'sc-status-dot sc-status-dot-gray';
    }
    // Show/hide empty message
    var empty = activeEl.querySelector('p');
    if (count === 0 && !empty) {
      activeEl.innerHTML = '<p style="color:${colors.muted};font-size:0.875rem;text-align:center;padding:1rem 0;">No active jobs</p>';
    } else if (count > 0 && empty) {
      empty.remove();
    }
  }

  function makeCollapsibleJson(str) {
    var pretty;
    try { pretty = JSON.stringify(JSON.parse(str), null, 2); } catch(e) { pretty = str; }
    var lines = pretty.split('\\n');
    if (lines.length <= 3) {
      return '<pre class="sc-pre" style="font-size:0.75rem;margin:0.25rem 0 0;overflow:auto;max-height:20rem;">' + escapeHtml(pretty) + '</pre>';
    }
    var preview = escapeHtml(lines.slice(0, 3).join('\\n') + '\\n\\u2026');
    var full = escapeHtml(pretty);
    return '<div class="sc-pre" style="font-size:0.75rem;margin:0.25rem 0 0;overflow:auto;max-height:20rem;">' +
      '<details style="margin:0;">' +
        '<summary style="cursor:pointer;color:${colors.muted};user-select:none;">' + preview + '</summary>' +
        full +
      '</details>' +
    '</div>';
  }

  function createActiveJobEl(ev) {
    var a = document.createElement('a');
    a.className = 'agent-status-job';
    a.setAttribute('data-job-id', ev.jobId);
    a.href = '?page=agent-status&job=' + ev.jobId;
    a.style.cssText = 'display:block;padding:0.75rem;background:${colors.surface};border-radius:0.5rem;border:1px solid ${colors.border};margin-bottom:0.5rem;text-decoration:none;color:inherit;';
    var jobType = ev.data && ev.data.jobType;
    var jobData = ev.data && ev.data.prompt;
    var jobTypeHtml = jobType
      ? '<span style="margin-left:0.5rem;font-size:0.75rem;color:${colors.accent};font-weight:500;">' + escapeHtml(jobType) + '</span>'
      : '';
    var jobDataHtml = jobData ? makeCollapsibleJson(jobData) : '';
    a.innerHTML =
      '<div style="display:flex;justify-content:space-between;margin-bottom:0.5rem;">' +
        '<span style="font-weight:600;font-size:0.875rem;">Job #' + ev.jobId + jobTypeHtml + '</span>' +
        '<span style="font-size:0.75rem;color:${colors.muted};">' + formatTime(ev.createdAt) + '</span>' +
      '</div>' +
      jobDataHtml +
      '<div style="font-size:0.8rem;color:${colors.accent};margin-top:0.5rem;" data-step-count>0 steps so far&hellip;</div>';
    return a;
  }

  function createHistoryJobEl(ev, stepCount, jobType, jobData) {
    var isSuccess = ev.event === 'completed';
    var durationMs = ev.data && ev.data.durationMs;
    var a = document.createElement('a');
    a.href = '?page=agent-status&job=' + ev.jobId;
    a.style.cssText = 'display:block;padding:0.75rem;background:${colors.surface};border-radius:0.5rem;border:1px solid ${colors.border};margin-bottom:0.5rem;text-decoration:none;color:inherit;';
    var jobTypeHtml = jobType
      ? '<span style="margin-left:0.5rem;font-size:0.75rem;color:${colors.accent};font-weight:500;">' + escapeHtml(jobType) + '</span>'
      : '';
    var jobDataHtml = jobData ? makeCollapsibleJson(jobData) : '';
    var errorHtml = !isSuccess && ev.data && ev.data.error
      ? '<div style="font-size:0.75rem;color:${colors.danger};margin-top:0.25rem;">' + escapeHtml(String(ev.data.error)) + '</div>'
      : '';
    a.innerHTML =
      '<div style="display:flex;justify-content:space-between;margin-bottom:0.25rem;">' +
        '<span style="font-weight:600;font-size:0.875rem;">Job #' + ev.jobId + jobTypeHtml + '</span>' +
        '<span style="font-size:0.75rem;color:' + (isSuccess ? '${colors.success}' : '${colors.danger}') + ';font-weight:600;">' + (isSuccess ? 'Completed' : 'Failed') + '</span>' +
      '</div>' +
      jobDataHtml +
      '<div style="font-size:0.75rem;color:${colors.muted};display:flex;gap:1rem;margin-top:0.5rem;">' +
        '<span>' + stepCount + ' step' + (stepCount !== 1 ? 's' : '') + '</span>' +
        (durationMs != null ? '<span>' + formatDuration(durationMs) + '</span>' : '') +
        '<span>' + formatTime(ev.createdAt) + '</span>' +
      '</div>' +
      errorHtml;
    return a;
  }

  function createQueuedJobEl(ev) {
    var a = document.createElement('a');
    a.className = 'agent-status-job';
    a.setAttribute('data-job-id', ev.jobId);
    a.href = '?page=agent-status&job=' + ev.jobId;
    a.style.cssText = 'display:block;padding:0.75rem;background:${colors.surface};border-radius:0.5rem;border:1px solid ${colors.border};margin-bottom:0.5rem;text-decoration:none;color:inherit;';
    var jobType = ev.data && ev.data.jobType;
    var jobTypeHtml = jobType
      ? '<span style="margin-left:0.5rem;font-size:0.75rem;color:${colors.accent};font-weight:500;">' + escapeHtml(jobType) + '</span>'
      : '';
    a.innerHTML =
      '<div style="display:flex;justify-content:space-between;margin-bottom:0.5rem;">' +
        '<span style="font-weight:600;font-size:0.875rem;">Job #' + ev.jobId + jobTypeHtml + '</span>' +
        '<span style="font-size:0.75rem;color:${colors.muted};">' + formatTime(ev.createdAt) + '</span>' +
      '</div>' +
      '<div style="font-size:0.8rem;color:${colors.muted};margin-top:0.5rem;" data-step-count>Queued\\u2026</div>';
    return a;
  }

  document.addEventListener('sc:ws:message', function(e) {
    var data = e.detail;
    if (data.type !== 'agent-status:update' || !data.event) return;
    var ev = data.event;

    if (ev.event === 'queued') {
      // Remove empty placeholder if present
      var empty = activeEl.querySelector('p');
      if (empty) empty.remove();
      var el = createQueuedJobEl(ev);
      activeEl.appendChild(el);
      activeJobs[ev.jobId] = {
        el: el,
        steps: 0,
        queued: true,
        jobType: ev.data && ev.data.jobType || null,
        jobData: null
      };
      updateActiveCount();

    } else if (ev.event === 'started') {
      var existing = activeJobs[ev.jobId];
      if (existing && existing.queued) {
        // Upgrade queued job to started
        if (existing.el) existing.el.remove();
      } else {
        // Remove empty placeholder if present
        var empty = activeEl.querySelector('p');
        if (empty) empty.remove();
      }
      var el = createActiveJobEl(ev);
      activeEl.appendChild(el);
      activeJobs[ev.jobId] = {
        el: el,
        steps: 0,
        jobType: ev.data && ev.data.jobType || (existing && existing.jobType) || null,
        jobData: ev.data && ev.data.prompt || null
      };
      updateActiveCount();

    } else if (ev.event === 'step') {
      var job = activeJobs[ev.jobId];
      if (job) {
        job.steps = (job.steps || 0) + 1;
        var stepEl = job.el.querySelector('[data-step-count]');
        if (stepEl) {
          stepEl.textContent = job.steps + ' step' + (job.steps !== 1 ? 's' : '') + ' so far\\u2026';
        }
      }

    } else if (ev.event === 'completed' || ev.event === 'failed') {
      var job = activeJobs[ev.jobId];
      var stepCount = job ? (job.steps || 0) : 0;
      var jobType = job ? job.jobType : null;
      var jobData = job ? job.jobData : null;
      if (job && job.el) job.el.remove();
      delete activeJobs[ev.jobId];
      updateActiveCount();

      // Remove "no completed jobs" placeholder
      var hEmpty = historyEl.querySelector('p');
      if (hEmpty) hEmpty.remove();

      // Prepend to history
      var hEl = createHistoryJobEl(ev, stepCount, jobType, jobData);
      historyEl.insertBefore(hEl, historyEl.firstChild);
      finishedCount++;
      if (historyCountEl) historyCountEl.textContent = '(' + finishedCount + ')';
    }
  });
})();
`,
        }}
      />
    </div>
  );
}

export function AgentJobDetailPanel({
  jobId,
  events,
}: AgentJobDetailPanelProps) {
  const queued = events.find((e) => e.event === "queued");
  const started = events.find((e) => e.event === "started");
  const terminal = events.find(
    (e) => e.event === "completed" || e.event === "failed",
  );
  const stepCount = events.filter((e) => e.event === "step").length;
  const isFinished = !!terminal;
  const isQueued = !started && !!queued;
  const isSuccess = terminal?.event === "completed";
  const durationMs = terminal?.data?.durationMs as number | undefined;

  return (
    <div className="sc-section">
      <PageHeader
        title={`Job #${jobId}`}
        subtitle={
          isFinished
            ? `${isSuccess ? "Completed" : "Failed"} after ${stepCount} step${stepCount !== 1 ? "s" : ""}${durationMs != null ? ` in ${formatDuration(durationMs)}` : ""}`
            : isQueued
              ? "Queued — waiting for executor"
              : `In progress — ${stepCount} step${stepCount !== 1 ? "s" : ""} so far`
        }
      />

      <div style={{ marginBottom: "1rem" }}>
        <a
          href="?page=agent-status"
          style={{
            color: colors.accent,
            fontSize: "0.85rem",
            textDecoration: "none",
          }}
        >
          &larr; Back to Agent Status
        </a>
      </div>

      {/* Summary */}
      <Card>
        <CardHeader>
          <span style={{ fontWeight: 600, color: colors.text }}>
            <StatusDot
              color={
                isFinished
                  ? isSuccess
                    ? "gray"
                    : "red"
                  : isQueued
                    ? "yellow"
                    : "green"
              }
            />{" "}
            Summary
          </span>
          {isFinished && (
            <span
              style={{
                fontSize: "0.75rem",
                color: isSuccess ? colors.success : colors.danger,
                fontWeight: 600,
              }}
            >
              {isSuccess ? "Completed" : "Failed"}
            </span>
          )}
        </CardHeader>
        <CardBody>
          <div
            style={{
              display: "flex",
              gap: "2rem",
              fontSize: "0.85rem",
              color: colors.muted,
              flexWrap: "wrap",
            }}
          >
            <span>
              {stepCount} step{stepCount !== 1 ? "s" : ""}
            </span>
            {durationMs != null && <span>{formatDuration(durationMs)}</span>}
            {queued && <span>Queued: {formatTime(queued.createdAt)}</span>}
            {started && <span>Started: {formatTime(started.createdAt)}</span>}
            {terminal && <span>Ended: {formatTime(terminal.createdAt)}</span>}
          </div>
          {started?.toolNames && (
            <div
              style={{
                fontSize: "0.8rem",
                color: colors.muted,
                marginTop: "0.5rem",
              }}
            >
              Tools: {started.toolNames.join(", ")}
            </div>
          )}
          {!isSuccess && terminal?.data?.error != null && (
            <div
              style={{
                fontSize: "0.8rem",
                color: colors.danger,
                marginTop: "0.5rem",
              }}
            >
              Error: {String(terminal.data.error as string)}
            </div>
          )}
        </CardBody>
      </Card>

      {/* Event timeline */}
      <div style={{ marginTop: "1rem" }}>
        <Card>
          <CardHeader>
            <span style={{ fontWeight: 600, color: colors.text }}>
              Events ({events.length})
            </span>
          </CardHeader>
          <CardBody>
            {events.length === 0 ? (
              <p
                style={{
                  color: colors.muted,
                  fontSize: "0.875rem",
                  textAlign: "center",
                  padding: "1rem 0",
                }}
              >
                No events recorded for this job.
              </p>
            ) : (
              events.map((ev, i) => (
                <div
                  key={i}
                  style={{
                    padding: "0.5rem 0.75rem",
                    borderBottom:
                      i < events.length - 1
                        ? `1px solid ${colors.border}`
                        : undefined,
                    fontSize: "0.8rem",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      marginBottom: "0.25rem",
                    }}
                  >
                    <span
                      style={{
                        fontWeight: 600,
                        color:
                          ev.event === "failed"
                            ? colors.danger
                            : ev.event === "completed"
                              ? colors.success
                              : colors.text,
                      }}
                    >
                      {ev.event}
                    </span>
                    <span style={{ color: colors.muted, fontSize: "0.75rem" }}>
                      {formatTime(ev.createdAt)}
                    </span>
                  </div>
                  {ev.data && Object.keys(ev.data).length > 0 && (
                    <JsonTreeView data={ev.data as Record<string, unknown>} />
                  )}
                </div>
              ))
            )}
          </CardBody>
        </Card>
      </div>
    </div>
  );
}
