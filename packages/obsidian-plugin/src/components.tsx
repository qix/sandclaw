import React from "react";
import type { VerificationRendererProps } from "@sandclaw/gatekeeper-plugin-api";
import { FileVerificationRenderer } from "@sandclaw/ui";
import { colors } from "@sandclaw/ui";

export function ObsidianPanel() {
  return (
    <div style={{ padding: "1.5rem" }}>
      <h2 style={{ marginTop: 0 }}>Obsidian</h2>
      <p style={{ color: colors.muted }}>
        Provides read and write access to an Obsidian vault on the host
        filesystem. Reading is safe (no verification needed). Writing requires
        human approval with a line-by-line diff preview.
      </p>
      <section>
        <h3>Capabilities</h3>
        <ul style={{ lineHeight: "1.8" }}>
          <li>
            <strong>Search:</strong> Full-text BM25 search across vault files
          </li>
          <li>
            <strong>Read:</strong> Read any note by path (no verification)
          </li>
          <li>
            <strong>Write:</strong> Create or overwrite notes (requires approval
            with diff preview)
          </li>
        </ul>
      </section>
      <section>
        <h3>Pending actions</h3>
        <p>Check the verification panel for pending write requests.</p>
      </section>
    </div>
  );
}

export function ObsidianVerificationRenderer(props: VerificationRendererProps) {
  return <FileVerificationRenderer {...props} />;
}
