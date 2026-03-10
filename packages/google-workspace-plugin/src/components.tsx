import React from "react";
import type { VerificationRendererProps } from "@sandclaw/gatekeeper-plugin-api";
import { colors } from "@sandclaw/ui";

export function GoogleWorkspacePanel() {
  return (
    <div style={{ padding: "1.5rem" }}>
      <h2 style={{ marginTop: 0 }}>Google Workspace</h2>
      <p style={{ color: colors.muted }}>
        Provides access to all 17 Google Workspace services via the{" "}
        <code>gws</code> CLI. Read commands execute directly; write/mutating
        commands require human approval and are executed by the Confidante agent.
      </p>
      <section>
        <h3>Tools</h3>
        <ul style={{ lineHeight: "1.8" }}>
          <li>
            <strong>google_workspace_read:</strong> Execute read-only gws
            commands directly (get, list, search, query, download, export)
          </li>
          <li>
            <strong>google_workspace_exec:</strong> Execute write/mutating
            commands with human approval (update, insert, delete, send, etc.)
          </li>
        </ul>
      </section>
      <section>
        <h3>Flow (exec)</h3>
        <ol style={{ lineHeight: "1.8" }}>
          <li>Muteworker requests a gws exec (creates verification request)</li>
          <li>Human reviews command and approves in this UI</li>
          <li>Confidante executes the gws command</li>
          <li>Result posted back to muteworker</li>
        </ol>
      </section>
      <section>
        <h3>Pending actions</h3>
        <p>Check the verification panel for pending exec requests.</p>
      </section>
    </div>
  );
}

export function GoogleWorkspaceVerificationRenderer({
  data,
}: VerificationRendererProps) {
  const description = data?.description ?? "";
  const command = data?.command ?? "";
  const requestId = data?.requestId ?? "";
  const createdAt = data?.createdAt ?? "";

  return (
    <div>
      <div
        style={{
          marginBottom: "0.75rem",
          fontSize: "0.85rem",
          color: colors.muted,
        }}
      >
        <strong style={{ color: colors.text }}>GWS Command</strong>
      </div>
      {description && (
        <div
          style={{
            background: colors.warningTint,
            border: `1px solid ${colors.warningTintBorder}`,
            borderRadius: "0.75rem",
            padding: "1rem 1.25rem",
            fontSize: "0.95rem",
            lineHeight: 1.6,
            whiteSpace: "pre-wrap",
            wordBreak: "break-word",
            marginBottom: "1rem",
            color: colors.text,
          }}
        >
          {description}
        </div>
      )}
      {command && (
        <pre
          style={{
            margin: "0 0 1rem 0",
            padding: "0.75rem 1rem",
            background: colors.surface,
            border: `1px solid ${colors.border}`,
            borderRadius: "0.5rem",
            fontSize: "0.82rem",
            fontFamily:
              "'SF Mono', 'Fira Code', 'JetBrains Mono', Menlo, Monaco, Consolas, monospace",
            whiteSpace: "pre-wrap",
            wordBreak: "break-word",
            lineHeight: 1.5,
            color: colors.text,
          }}
        >
          gws {command}
        </pre>
      )}
      <table
        style={{
          fontSize: "0.82rem",
          borderCollapse: "collapse",
          color: colors.text,
        }}
      >
        <tbody>
          <tr>
            <td
              style={{
                padding: "0.2rem 0.75rem 0.2rem 0",
                color: colors.muted,
                fontWeight: 600,
              }}
            >
              Request ID
            </td>
            <td
              style={{
                padding: "0.2rem 0",
                fontFamily: "monospace",
                fontSize: "0.8rem",
              }}
            >
              {requestId}
            </td>
          </tr>
          {createdAt && (
            <tr>
              <td
                style={{
                  padding: "0.2rem 0.75rem 0.2rem 0",
                  color: colors.muted,
                  fontWeight: 600,
                }}
              >
                Created
              </td>
              <td style={{ padding: "0.2rem 0", fontSize: "0.8rem" }}>
                {createdAt}
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
