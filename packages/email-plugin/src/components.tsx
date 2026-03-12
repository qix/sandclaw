import React from "react";
import type { VerificationRendererProps } from "@sandclaw/gatekeeper-plugin-api";
import { colors } from "@sandclaw/ui";

export function EmailPanel() {
  return (
    <div style={{ padding: "1.5rem" }}>
      <h2 style={{ marginTop: 0 }}>Email (JMAP)</h2>
      <p style={{ color: colors.muted }}>
        Connects to email via the JMAP protocol (configured for Fastmail).
        Incoming emails are queued for the muteworker; outbound emails require
        human approval before dispatch.
      </p>
      <section>
        <h3>Settings</h3>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "0.75rem",
            marginTop: "0.75rem",
          }}
        >
          <button
            id="sc-email-watch-toggle"
            type="button"
            role="switch"
            aria-checked="false"
            style={{
              position: "relative",
              width: "44px",
              height: "24px",
              borderRadius: "12px",
              border: `1px solid ${colors.border}`,
              background: colors.surface,
              cursor: "pointer",
              padding: 0,
              flexShrink: 0,
              transition: "background 0.2s",
            }}
          >
            <span
              id="sc-email-watch-knob"
              style={{
                position: "absolute",
                top: "2px",
                left: "2px",
                width: "18px",
                height: "18px",
                borderRadius: "50%",
                background: colors.muted,
                transition: "transform 0.2s, background 0.2s",
              }}
            />
          </button>
          <label
            htmlFor="sc-email-watch-toggle"
            style={{ fontSize: "0.9rem", cursor: "pointer" }}
          >
            Watch email inbox
          </label>
          <span
            id="sc-email-watch-status"
            style={{ fontSize: "0.8rem", color: colors.muted }}
          />
        </div>
      </section>
      <script
        dangerouslySetInnerHTML={{
          __html: `(function(){
  var btn = document.getElementById('sc-email-watch-toggle');
  var knob = document.getElementById('sc-email-watch-knob');
  var status = document.getElementById('sc-email-watch-status');
  var enabled = false;
  var accent = '${colors.accent}';
  var surface = '${colors.surface}';
  var muted = '${colors.muted}';

  function render() {
    btn.setAttribute('aria-checked', String(enabled));
    btn.style.background = enabled ? accent : surface;
    knob.style.transform = enabled ? 'translateX(20px)' : 'translateX(0)';
    knob.style.background = enabled ? '#fff' : muted;
    status.textContent = '';
  }

  fetch('/api/email/settings/watch-inbox')
    .then(function(r){ return r.json(); })
    .then(function(d){ enabled = d.enabled; render(); })
    .catch(function(){ status.textContent = 'Failed to load'; });

  btn.addEventListener('click', function(){
    enabled = !enabled;
    render();
    status.textContent = 'Saving...';
    fetch('/api/email/settings/watch-inbox', {
      method: 'POST',
      headers: {'content-type':'application/json'},
      body: JSON.stringify({enabled: enabled})
    })
    .then(function(r){ return r.json(); })
    .then(function(d){ enabled = d.enabled; render(); })
    .catch(function(){ enabled = !enabled; render(); status.textContent = 'Save failed'; });
  });
})();`,
        }}
      />
      <section style={{ marginTop: "1rem" }}>
        <h3>Capabilities</h3>
        <ul style={{ lineHeight: "1.8" }}>
          <li>
            <strong>Receive:</strong> Polls for unseen emails and queues as jobs
          </li>
          <li>
            <strong>Send:</strong> Compose and send emails (requires approval)
          </li>
        </ul>
      </section>
      <section>
        <h3>Pending actions</h3>
        <p>Check the verification panel for pending send requests.</p>
      </section>
    </div>
  );
}

export function EmailQueuePanel() {
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
        id="email-queue-file-list"
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
            Email Queue
          </h3>
          <button
            id="email-queue-new-btn"
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
          id="email-queue-files"
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
          id="email-queue-toolbar"
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
            id="email-queue-filename"
            style={{
              fontFamily: "monospace",
              fontSize: "0.85rem",
              color: colors.muted,
            }}
          >
            Select a file
          </span>
          <span id="email-queue-dirty" style={{ display: "none", color: colors.warning, fontSize: "0.75rem" }}>
            (unsaved)
          </span>
          <div style={{ flex: 1 }} />
          <button
            id="email-queue-save-btn"
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
            id="email-queue-status"
            style={{
              fontSize: "0.75rem",
              color: colors.success,
              display: "none",
            }}
          />
        </div>

        {/* CodeMirror mount point */}
        <div
          id="email-queue-editor"
          style={{
            flex: 1,
            overflow: "hidden",
          }}
        />
      </div>

      <script src="/api/email/queue/client.js" defer />
    </div>
  );
}

export function EmailVerificationRenderer({ data }: VerificationRendererProps) {
  const to = data?.to ?? "";
  const from = data?.from ?? "";
  const subject = data?.subject ?? "(no subject)";
  const text = data?.text ?? "";

  return (
    <div>
      <table
        style={{
          fontSize: "0.85rem",
          marginBottom: "0.75rem",
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
                whiteSpace: "nowrap",
                verticalAlign: "top",
              }}
            >
              From
            </td>
            <td style={{ padding: "0.2rem 0", fontFamily: "monospace" }}>
              {from}
            </td>
          </tr>
          <tr>
            <td
              style={{
                padding: "0.2rem 0.75rem 0.2rem 0",
                color: colors.muted,
                fontWeight: 600,
                whiteSpace: "nowrap",
                verticalAlign: "top",
              }}
            >
              To
            </td>
            <td style={{ padding: "0.2rem 0", fontFamily: "monospace" }}>
              {to}
            </td>
          </tr>
          <tr>
            <td
              style={{
                padding: "0.2rem 0.75rem 0.2rem 0",
                color: colors.muted,
                fontWeight: 600,
                whiteSpace: "nowrap",
                verticalAlign: "top",
              }}
            >
              Subject
            </td>
            <td style={{ padding: "0.2rem 0", fontWeight: 600 }}>{subject}</td>
          </tr>
        </tbody>
      </table>
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
          color: colors.text,
        }}
      >
        {text}
      </div>
    </div>
  );
}
