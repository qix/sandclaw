import React from "react";
import type { VerificationRendererProps } from "@sandclaw/gatekeeper-plugin-api";
import { colors } from "@sandclaw/ui";

export function BrowserPanel() {
  return (
    <div style={{ padding: "1.5rem" }}>
      <h2 style={{ marginTop: 0 }}>Browser</h2>
      <p style={{ color: colors.muted }}>
        Allows the muteworker to request web browsing tasks. All browse requests
        require human approval before the Confidante agent executes them in a
        Docker container using Claude Agent SDK with agent-browser.
      </p>
      <section>
        <h3>Flow</h3>
        <ol style={{ lineHeight: "1.8" }}>
          <li>Muteworker requests a browse (creates verification request)</li>
          <li>Human reviews and approves in this UI</li>
          <li>Confidante executes browser agent in Docker</li>
          <li>Browse result posted back to muteworker</li>
        </ol>
      </section>
      <section>
        <h3>Pending actions</h3>
        <p>Check the verification panel for pending browse requests.</p>
      </section>
    </div>
  );
}

export function BrowserVerificationRenderer({
  data,
}: VerificationRendererProps) {
  const prompt = data?.prompt ?? "";
  const url = data?.url ?? "";
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
        <strong style={{ color: colors.text }}>Browse Prompt</strong>
      </div>
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
        {prompt}
      </div>
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
          {url && (
            <tr>
              <td
                style={{
                  padding: "0.2rem 0.75rem 0.2rem 0",
                  color: colors.muted,
                  fontWeight: 600,
                }}
              >
                Start URL
              </td>
              <td
                style={{
                  padding: "0.2rem 0",
                  fontFamily: "monospace",
                  fontSize: "0.8rem",
                }}
              >
                {url}
              </td>
            </tr>
          )}
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
