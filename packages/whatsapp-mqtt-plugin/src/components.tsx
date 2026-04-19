import React from "react";
import type { VerificationRendererProps } from "@sandclaw/gatekeeper-plugin-api";
import {
  Card,
  CardHeader,
  CardBody,
  Badge,
  PageHeader,
  StatusDot,
  ConversationList,
  colors,
} from "@sandclaw/ui";
import { wamState } from "./state";

export function WhatsAppMqttPanel() {
  let statusBlock: React.ReactNode;

  switch (wamState.connectionStatus) {
    case "disconnected":
      statusBlock = (
        <p style={{ color: colors.danger }}>
          <StatusDot color="red" /> <strong>Status:</strong> Disconnected
        </p>
      );
      break;
    case "connecting":
      statusBlock = (
        <p style={{ color: colors.warning }}>
          <StatusDot color="yellow" /> <strong>Status:</strong>{" "}
          Connecting&hellip;
        </p>
      );
      break;
    case "connected":
      statusBlock = (
        <p style={{ color: colors.success }}>
          <StatusDot color="green" /> <strong>Status:</strong> Connected to MQTT
          broker
        </p>
      );
      break;
  }

  return (
    <div className="sc-section">
      <PageHeader
        title="WhatsApp (MQTT)"
        subtitle="Connects to WhatsApp via an MQTT bridge. Incoming messages are always saved; the toggle controls whether they are queued for the muteworker."
      />
      <Card>
        <CardHeader>
          <span style={{ fontWeight: 600, color: colors.text }}>
            Connection
          </span>
        </CardHeader>
        <CardBody>{statusBlock}</CardBody>
      </Card>
      <Card>
        <CardHeader>
          <span style={{ fontWeight: 600, color: colors.text }}>Settings</span>
        </CardHeader>
        <CardBody>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "0.75rem",
            }}
          >
            <button
              id="sc-wam-watch-toggle"
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
                id="sc-wam-watch-knob"
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
              htmlFor="sc-wam-watch-toggle"
              style={{ fontSize: "0.9rem", cursor: "pointer" }}
            >
              Process incoming messages
            </label>
            <span
              id="sc-wam-watch-status"
              style={{ fontSize: "0.8rem", color: colors.muted }}
            />
          </div>
          <script
            dangerouslySetInnerHTML={{
              __html: `(function(){
  var btn = document.getElementById('sc-wam-watch-toggle');
  var knob = document.getElementById('sc-wam-watch-knob');
  var status = document.getElementById('sc-wam-watch-status');
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

  fetch('/api/whatsapp-mqtt/settings/watch-inbox')
    .then(function(r){ return r.json(); })
    .then(function(d){ enabled = d.enabled; render(); })
    .catch(function(){ status.textContent = 'Failed to load'; });

  btn.addEventListener('click', function(){
    enabled = !enabled;
    render();
    status.textContent = 'Saving...';
    fetch('/api/whatsapp-mqtt/settings/watch-inbox', {
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
        </CardBody>
      </Card>
      <Card>
        <CardHeader>
          <span style={{ fontWeight: 600, color: colors.text }}>
            Recent Conversations
          </span>
          <Badge bg={colors.border} fg={colors.muted}>
            {wamState.recentConversations.length}
          </Badge>
        </CardHeader>
        <CardBody>
          <ConversationList conversations={wamState.recentConversations} />
        </CardBody>
      </Card>
    </div>
  );
}

export function WhatsAppMqttVerificationRenderer({
  data,
}: VerificationRendererProps) {
  const jid = data?.jid ?? "Unknown";
  const text = data?.text ?? "";
  const phone = jid.replace(/@.*$/, "");

  return (
    <div>
      <div
        style={{
          marginBottom: "0.75rem",
          fontSize: "0.85rem",
          color: colors.muted,
        }}
      >
        <strong style={{ color: colors.text }}>To:</strong>{" "}
        <span className="sc-mono">{phone}</span>
        <span style={{ color: colors.border, margin: "0 0.5rem" }}>|</span>
        <span style={{ fontSize: "0.8rem", color: colors.muted }}>{jid}</span>
      </div>
      <div
        className="sc-message-bubble"
        style={{
          background: colors.successTint,
          border: `1px solid ${colors.successTintBorder}`,
          color: colors.text,
        }}
      >
        {text}
      </div>
    </div>
  );
}
