import React from "react";
import { colors } from "@sandclaw/ui";

export function PromptsPanel() {
  return (
    <div
      style={{
        display: "flex",
        height: "100%",
        overflow: "hidden",
      }}
    >
      {/* File list sidebar */}
      <div
        id="prompts-file-list"
        style={{
          width: "200px",
          flexShrink: 0,
          borderRight: `1px solid ${colors.border}`,
          display: "flex",
          flexDirection: "column",
          background: colors.surface,
        }}
      >
        <div
          style={{
            padding: "1rem 1rem 0.75rem",
            borderBottom: `1px solid ${colors.border}`,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <h3 style={{ margin: 0, fontSize: "0.9rem", fontWeight: 600 }}>
            Prompts
          </h3>
          <button
            id="prompts-new-btn"
            style={{
              background: "none",
              border: "none",
              color: colors.accent,
              cursor: "pointer",
              fontSize: "1.1rem",
              padding: "0 0.25rem",
              lineHeight: 1,
            }}
            title="New file"
          >
            +
          </button>
        </div>
        <div
          id="prompts-files"
          style={{
            flex: 1,
            overflowY: "auto",
            padding: "0.5rem 0",
          }}
        >
          <div
            style={{
              padding: "0.5rem 1rem",
              color: colors.muted,
              fontSize: "0.82rem",
            }}
          >
            Loading&hellip;
          </div>
        </div>
      </div>

      {/* Editor area */}
      <div
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        }}
      >
        {/* Editor toolbar */}
        <div
          id="prompts-toolbar"
          style={{
            padding: "0.5rem 1rem",
            borderBottom: `1px solid ${colors.border}`,
            display: "flex",
            alignItems: "center",
            gap: "0.75rem",
            background: colors.surface,
            minHeight: "44px",
          }}
        >
          <span
            id="prompts-filename"
            style={{
              fontFamily: "monospace",
              fontSize: "0.85rem",
              color: colors.muted,
            }}
          >
            Select a file
          </span>
          <span id="prompts-dirty" style={{ display: "none", color: colors.warning, fontSize: "0.75rem" }}>
            (unsaved)
          </span>
          <div style={{ flex: 1 }} />
          <button
            id="prompts-save-btn"
            style={{
              padding: "0.35rem 0.9rem",
              borderRadius: "0.375rem",
              border: "none",
              background: colors.accent,
              color: "oklch(1 0 0)",
              fontWeight: 600,
              fontSize: "0.8rem",
              cursor: "pointer",
              display: "none",
            }}
          >
            Save
          </button>
          <span
            id="prompts-status"
            style={{
              fontSize: "0.75rem",
              color: colors.success,
              display: "none",
            }}
          />
        </div>

        {/* CodeMirror mount point */}
        <div
          id="prompts-editor"
          style={{
            flex: 1,
            overflow: "hidden",
          }}
        />
      </div>

      <script src="/api/prompts/client.js" defer />
    </div>
  );
}
