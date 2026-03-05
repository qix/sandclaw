import React from "react";
import type { VerificationRendererProps } from "@sandclaw/gatekeeper-plugin-api";
import { colors } from "@sandclaw/ui";

export function GithubVerificationRenderer({
  data,
}: VerificationRendererProps) {
  const prNumber = data?.prNumber ?? "";
  const prUrl = data?.prUrl ?? "";
  const title = data?.title ?? "";
  const branch = data?.branch ?? "";
  const body = data?.body ?? "";
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
        <strong style={{ color: colors.text }}>GitHub PR</strong>
      </div>

      {/* PR number as clickable link */}
      <div
        style={{
          marginBottom: "0.75rem",
          fontSize: "1.1rem",
          fontWeight: 700,
        }}
      >
        <a
          href={prUrl}
          target="_blank"
          rel="noopener noreferrer"
          style={{ color: colors.accent, textDecoration: "none" }}
        >
          #{prNumber}
        </a>
      </div>

      {/* PR title */}
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
        {title}
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
          <tr>
            <td
              style={{
                padding: "0.2rem 0.75rem 0.2rem 0",
                color: colors.muted,
                fontWeight: 600,
              }}
            >
              PR URL
            </td>
            <td
              style={{
                padding: "0.2rem 0",
                fontFamily: "monospace",
                fontSize: "0.8rem",
              }}
            >
              <a
                href={prUrl}
                target="_blank"
                rel="noopener noreferrer"
                style={{ color: colors.accent, textDecoration: "none" }}
              >
                {prUrl}
              </a>
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

      {/* PR body / description */}
      {body && (
        <div style={{ marginTop: "1rem" }}>
          <div
            style={{
              fontSize: "0.82rem",
              color: colors.muted,
              fontWeight: 600,
              marginBottom: "0.4rem",
            }}
          >
            Description
          </div>
          <div
            style={{
              background: colors.bg,
              border: `1px solid ${colors.border}`,
              borderRadius: "0.5rem",
              padding: "1rem",
              fontSize: "0.85rem",
              fontFamily: "monospace",
              whiteSpace: "pre-wrap",
              wordBreak: "break-word",
              lineHeight: 1.5,
              maxHeight: "200px",
              overflowY: "auto",
              color: colors.text,
            }}
          >
            {body}
          </div>
        </div>
      )}
    </div>
  );
}
