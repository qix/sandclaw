import React from "react";
import {
  Card,
  CardHeader,
  CardBody,
  PageHeader,
  Button,
  colors,
} from "@sandclaw/ui";
import {
  httpState,
  type HttpAllowEntry,
  type HttpRequestRow,
} from "./state";

const METHOD_COLORS: Record<string, string> = {
  GET: "oklch(0.74 0.16 230)",
  HEAD: "oklch(0.74 0.16 230)",
  POST: "oklch(0.72 0.19 152)",
  PUT: "oklch(0.78 0.17 70)",
  PATCH: "oklch(0.78 0.17 70)",
  DELETE: "oklch(0.63 0.23 27)",
  OPTIONS: "oklch(0.65 0.025 270)",
};

function MethodBadge({ method }: { method: string }) {
  const m = method.toUpperCase();
  return (
    <span
      style={{
        background: METHOD_COLORS[m] ?? colors.muted,
        color: "oklch(1 0 0)",
        padding: "0.05rem 0.4rem",
        borderRadius: "0.25rem",
        fontSize: "0.7rem",
        fontWeight: 700,
        letterSpacing: "0.03em",
        fontFamily: "monospace",
      }}
    >
      {m}
    </span>
  );
}

function OutcomeBadge({ outcome }: { outcome: HttpRequestRow["outcome"] }) {
  const tone =
    outcome === "allowed"
      ? colors.success
      : outcome === "blocked"
        ? colors.warning
        : colors.danger;
  return (
    <span
      style={{
        background: tone,
        color: "oklch(0.15 0.01 270)",
        padding: "0.05rem 0.4rem",
        borderRadius: "0.25rem",
        fontSize: "0.65rem",
        fontWeight: 700,
        textTransform: "uppercase",
        letterSpacing: "0.03em",
      }}
    >
      {outcome}
    </span>
  );
}

function formatTime(ts: string): string {
  return new Date(ts).toLocaleString();
}

function AllowListCard({ entries }: { entries: HttpAllowEntry[] }) {
  return (
    <Card>
      <CardHeader>
        <span style={{ fontWeight: 600, color: colors.text }}>
          Allow List
          <span
            style={{
              marginLeft: "0.5rem",
              fontSize: "0.8rem",
              color: colors.muted,
            }}
          >
            ({entries.length})
          </span>
        </span>
      </CardHeader>
      <CardBody>
        {entries.length === 0 ? (
          <p
            style={{
              color: colors.muted,
              fontSize: "0.875rem",
              textAlign: "center",
              padding: "1rem 0",
            }}
          >
            All hosts are blocked. Allow a (method, domain) pair below to let
            the muteworker reach it.
          </p>
        ) : (
          entries.map((e) => (
            <div
              key={e.id}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "0.75rem",
                padding: "0.5rem 0",
                borderBottom: `1px solid ${colors.border}`,
              }}
            >
              <MethodBadge method={e.method} />
              <span
                style={{
                  fontFamily: "monospace",
                  fontSize: "0.85rem",
                  color: colors.text,
                  flex: 1,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                }}
              >
                {e.domain}
              </span>
              <span style={{ fontSize: "0.7rem", color: colors.muted }}>
                {formatTime(e.createdAt)}
              </span>
              <Button
                variant="danger"
                data-http-revoke
                data-http-method={e.method}
                data-http-domain={e.domain}
              >
                Revoke
              </Button>
            </div>
          ))
        )}
      </CardBody>
    </Card>
  );
}

function RecentRequestsCard({
  recent,
  allowSet,
}: {
  recent: HttpRequestRow[];
  allowSet: Set<string>;
}) {
  return (
    <Card>
      <CardHeader>
        <span style={{ fontWeight: 600, color: colors.text }}>
          Recent Requests
          <span
            style={{
              marginLeft: "0.5rem",
              fontSize: "0.8rem",
              color: colors.muted,
            }}
          >
            ({recent.length})
          </span>
        </span>
      </CardHeader>
      <CardBody>
        {recent.length === 0 ? (
          <p
            style={{
              color: colors.muted,
              fontSize: "0.875rem",
              textAlign: "center",
              padding: "1rem 0",
            }}
          >
            No HTTP requests yet.
          </p>
        ) : (
          recent.map((r) => {
            const key = `${r.method.toUpperCase()}|${r.domain.toLowerCase()}`;
            const alreadyAllowed = allowSet.has(key);
            return (
              <div
                key={r.id}
                style={{
                  padding: "0.6rem 0",
                  borderBottom: `1px solid ${colors.border}`,
                }}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "0.5rem",
                    flexWrap: "wrap",
                  }}
                >
                  <MethodBadge method={r.method} />
                  <OutcomeBadge outcome={r.outcome} />
                  {r.statusCode != null && (
                    <span
                      style={{
                        fontSize: "0.7rem",
                        color: colors.muted,
                        fontFamily: "monospace",
                      }}
                    >
                      {r.statusCode}
                    </span>
                  )}
                  {r.responseBytes != null && (
                    <span
                      style={{ fontSize: "0.7rem", color: colors.muted }}
                    >
                      {formatBytes(r.responseBytes)}
                    </span>
                  )}
                  <span
                    style={{
                      fontSize: "0.7rem",
                      color: colors.muted,
                      marginLeft: "auto",
                    }}
                  >
                    {formatTime(r.createdAt)}
                  </span>
                </div>
                <div
                  style={{
                    fontFamily: "monospace",
                    fontSize: "0.8rem",
                    color: colors.text,
                    marginTop: "0.25rem",
                    wordBreak: "break-all",
                  }}
                >
                  {r.url}
                </div>
                {r.error && (
                  <div
                    style={{
                      fontSize: "0.75rem",
                      color: colors.danger,
                      marginTop: "0.2rem",
                    }}
                  >
                    {r.error}
                  </div>
                )}
                <div
                  style={{
                    marginTop: "0.4rem",
                    display: "flex",
                    gap: "0.5rem",
                    alignItems: "center",
                  }}
                >
                  {alreadyAllowed ? (
                    <span
                      style={{
                        fontSize: "0.7rem",
                        color: colors.success,
                      }}
                    >
                      ✓ {r.method} {r.domain} is allowed
                    </span>
                  ) : (
                    <Button
                      variant="success"
                      data-http-allow
                      data-http-method={r.method}
                      data-http-domain={r.domain}
                    >
                      Allow {r.method} on {r.domain}
                    </Button>
                  )}
                </div>
              </div>
            );
          })
        )}
      </CardBody>
    </Card>
  );
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function HttpPanel() {
  const recent = httpState.recent;
  const allowList = httpState.allowList;
  const allowSet = new Set(
    allowList.map((e) => `${e.method.toUpperCase()}|${e.domain.toLowerCase()}`),
  );

  return (
    <div className="sc-section">
      <PageHeader
        title="HTTP"
        subtitle="Allow-listed HTTP requests for the muteworker. All hosts are blocked by default."
      />

      <AllowListCard entries={allowList} />

      <div style={{ marginTop: "1rem" }}>
        <RecentRequestsCard recent={recent} allowSet={allowSet} />
      </div>

      <script
        dangerouslySetInnerHTML={{
          __html: `
(function() {
  function postJson(url, body) {
    return fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    }).then(function(r) { return r.json().then(function(j) { return { ok: r.ok, body: j }; }); });
  }

  function handle(action, btn) {
    var method = btn.getAttribute('data-http-method');
    var domain = btn.getAttribute('data-http-domain');
    if (!method || !domain) return;
    btn.disabled = true;
    var label = btn.textContent;
    btn.textContent = action === 'allow' ? 'Allowing\\u2026' : 'Revoking\\u2026';
    postJson('/api/http/' + action, { method: method, domain: domain })
      .then(function(res) {
        if (res.ok) {
          location.reload();
        } else {
          btn.disabled = false;
          btn.textContent = label;
          alert((res.body && res.body.error) || 'Request failed');
        }
      })
      .catch(function(err) {
        btn.disabled = false;
        btn.textContent = label;
        alert(String(err));
      });
  }

  document.addEventListener('click', function(e) {
    var allowBtn = e.target.closest('[data-http-allow]');
    if (allowBtn) { e.preventDefault(); handle('allow', allowBtn); return; }
    var revokeBtn = e.target.closest('[data-http-revoke]');
    if (revokeBtn) {
      e.preventDefault();
      var domain = revokeBtn.getAttribute('data-http-domain');
      var method = revokeBtn.getAttribute('data-http-method');
      if (!confirm('Revoke ' + method + ' on ' + domain + '?')) return;
      handle('revoke', revokeBtn);
      return;
    }
  });

  // Auto-refresh when other clients (or the muteworker) change state.
  document.addEventListener('sc:ws:message', function(e) {
    if (e.detail && e.detail.type === 'http:update') {
      location.reload();
    }
  });
})();
`,
        }}
      />
    </div>
  );
}
