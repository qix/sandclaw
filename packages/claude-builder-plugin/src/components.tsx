import React from "react";
import type { VerificationRendererProps } from "@sandclaw/gatekeeper-plugin-api";
import { colors } from "@sandclaw/ui";

export function BuilderPanel() {
  return (
    <div style={{ padding: "1.5rem" }}>
      <h2 style={{ marginTop: 0 }}>Builder</h2>
      <p style={{ color: colors.muted }}>
        Allows the muteworker to request code builds and changes. All build
        requests require human approval before the Confidante agent executes
        them in a Docker container with network isolation using Claude Code.
      </p>
      <section>
        <h3>Flow</h3>
        <ol style={{ lineHeight: "1.8" }}>
          <li>Muteworker requests a build (creates verification request)</li>
          <li>Human reviews and approves in this UI</li>
          <li>Confidante executes Claude Code coding agent in Docker</li>
          <li>Changes are committed and result posted back to muteworker</li>
        </ol>
      </section>
      <section>
        <h3>Pending actions</h3>
        <p>Check the verification panel for pending build requests.</p>
      </section>
    </div>
  );
}

export function BuilderVerificationRenderer({
  data,
}: VerificationRendererProps) {
  const prompt = data?.prompt ?? "";
  const requestId = data?.requestId ?? "";
  const repo = data?.repo ?? "";
  const branch = data?.branch ?? "";
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
        <strong style={{ color: colors.text }}>Build Prompt</strong>
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
          {repo && (
            <tr>
              <td
                style={{
                  padding: "0.2rem 0.75rem 0.2rem 0",
                  color: colors.muted,
                  fontWeight: 600,
                }}
              >
                Repository
              </td>
              <td
                style={{
                  padding: "0.2rem 0",
                  fontFamily: "monospace",
                  fontSize: "0.8rem",
                }}
              >
                {repo}
              </td>
            </tr>
          )}
          {branch && (
            <tr>
              <td
                style={{
                  padding: "0.2rem 0.75rem 0.2rem 0",
                  color: colors.muted,
                  fontWeight: 600,
                }}
              >
                Branch
              </td>
              <td
                style={{
                  padding: "0.2rem 0",
                  fontFamily: "monospace",
                  fontSize: "0.8rem",
                }}
              >
                {branch}
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
