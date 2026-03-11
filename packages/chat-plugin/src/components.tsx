import React from "react";
import type { VerificationRendererProps } from "@sandclaw/gatekeeper-plugin-api";
import {
  Card,
  CardHeader,
  CardBody,
  PageHeader,
  StatusDot,
  colors,
} from "@sandclaw/ui";

export function ChatPanel() {
  return (
    <div className="sc-section">
      <PageHeader
        title="Chat"
        subtitle="Direct chat with the AI agent. Messages are processed by the muteworker and replies stream back in real time."
      />
      <Card>
        <CardHeader>
          <span style={{ fontWeight: 600, color: colors.text }}>
            <StatusDot color="green" /> Connected
          </span>
        </CardHeader>
        <CardBody>
          <div
            id="chat-messages"
            style={{
              height: "400px",
              overflowY: "auto",
              padding: "0.75rem",
              background: colors.surface,
              borderRadius: "0.5rem",
              border: `1px solid ${colors.border}`,
              marginBottom: "0.75rem",
              display: "flex",
              flexDirection: "column",
              gap: "0.5rem",
            }}
          >
            <p
              style={{
                color: colors.muted,
                fontSize: "0.875rem",
                textAlign: "center",
                margin: "auto 0",
              }}
            >
              Connecting&hellip;
            </p>
          </div>
          <form
            id="chat-form"
            style={{ display: "flex", gap: "0.5rem", alignItems: "flex-end" }}
            onSubmit={(e: any) => e.preventDefault()}
          >
            <textarea
              id="chat-input"
              placeholder="Type a message... (Shift+Enter for new line)"
              autoComplete="off"
              rows={1}
              style={{
                flex: 1,
                padding: "0.5rem 0.75rem",
                borderRadius: "0.375rem",
                border: `1px solid ${colors.border}`,
                background: colors.surface,
                color: colors.text,
                fontSize: "0.875rem",
                outline: "none",
                resize: "none",
                overflow: "hidden",
                lineHeight: "1.4",
                fontFamily: "inherit",
                maxHeight: "150px",
              }}
            />
            <button
              type="submit"
              style={{
                padding: "0.5rem 1rem",
                borderRadius: "0.375rem",
                border: "none",
                background: colors.accent,
                color: "oklch(1 0 0)",
                fontWeight: 600,
                fontSize: "0.875rem",
                cursor: "pointer",
                whiteSpace: "nowrap",
              }}
            >
              Send
            </button>
          </form>
        </CardBody>
      </Card>
      <script
        dangerouslySetInnerHTML={{
          __html: `
(function() {
  var messagesEl = document.getElementById('chat-messages');
  var form = document.getElementById('chat-form');
  var input = document.getElementById('chat-input');
  var ws = null;
  var connected = false;

  function escapeHtml(str) {
    var div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  function linkify(escaped) {
    return escaped.replace(/(?:https?:\\/\\/)[^\\s<&]+/g, function(url) {
      return '<a href="' + url + '" target="_blank" rel="noopener noreferrer" style="color:${colors.accentHover};text-decoration:underline;">' + url + '</a>';
    });
  }

  function renderMessage(msg) {
    var div = document.createElement('div');
    var isInbound = msg.direction === 'inbound';
    div.style.cssText = 'padding:0.5rem 0.75rem;border-radius:0.5rem;max-width:80%;word-wrap:break-word;white-space:pre-wrap;font-size:0.875rem;' +
      (isInbound
        ? 'align-self:flex-end;background:${colors.accentTint};border:1px solid ${colors.accentTintBorder};color:inherit;'
        : 'align-self:flex-start;background:${colors.successTint};border:1px solid ${colors.successTintBorder};color:inherit;');
    var label = isInbound ? 'You' : 'Agent';
    var time = msg.timestamp ? new Date(msg.timestamp * 1000).toLocaleTimeString() : '';
    div.innerHTML = '<div style="font-size:0.75rem;opacity:0.6;margin-bottom:0.25rem;">' + escapeHtml(label) + (time ? ' · ' + escapeHtml(time) : '') + '</div>' + linkify(escapeHtml(msg.text));
    return div;
  }

  function scrollToBottom() {
    messagesEl.scrollTop = messagesEl.scrollHeight;
  }

  function connect() {
    var proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
    ws = new WebSocket(proto + '//' + location.host + '/api/chat/ws');

    ws.onopen = function() {
      connected = true;
    };

    var latestMessageId = 0;
    var markReadTimer = null;

    function isAtBottom() {
      return messagesEl.scrollHeight - messagesEl.scrollTop - messagesEl.clientHeight < 50;
    }

    function markRead() {
      if (latestMessageId > 0) {
        fetch('/api/chat/mark-read', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ messageId: latestMessageId })
        }).catch(function() {});
      }
    }

    function debouncedMarkRead() {
      if (markReadTimer) clearTimeout(markReadTimer);
      markReadTimer = setTimeout(markRead, 300);
    }

    messagesEl.addEventListener('scroll', function() {
      if (isAtBottom()) debouncedMarkRead();
    });

    ws.onmessage = function(e) {
      try {
        var data = JSON.parse(e.data);
        if (data.type === 'history') {
          messagesEl.innerHTML = '';
          if (data.messages && data.messages.length) {
            data.messages.forEach(function(msg) {
              messagesEl.appendChild(renderMessage(msg));
              if (msg.id > latestMessageId) latestMessageId = msg.id;
            });
          } else {
            var p = document.createElement('p');
            p.style.cssText = 'color:${colors.muted};font-size:0.875rem;text-align:center;margin:auto 0;';
            p.textContent = 'No messages yet. Start a conversation!';
            messagesEl.appendChild(p);
          }
          scrollToBottom();
          debouncedMarkRead();
        } else if (data.type === 'message') {
          // Remove "no messages" placeholder if present
          var placeholder = messagesEl.querySelector('p');
          if (placeholder && placeholder.textContent.indexOf('No messages') >= 0) {
            placeholder.remove();
          }
          messagesEl.appendChild(renderMessage(data));
          if (data.id > latestMessageId) latestMessageId = data.id;
          var wasAtBottom = isAtBottom();
          scrollToBottom();
          if (wasAtBottom) debouncedMarkRead();
        }
      } catch(err) {}
    };

    ws.onclose = function() {
      connected = false;
      setTimeout(connect, 2000);
    };

    ws.onerror = function() {
      ws.close();
    };
  }

  function autoResize() {
    input.style.height = 'auto';
    input.style.height = Math.min(input.scrollHeight, 150) + 'px';
    input.style.overflow = input.scrollHeight > 150 ? 'auto' : 'hidden';
  }

  function sendMessage() {
    var text = input.value.trim();
    if (!text || !connected) return;
    ws.send(JSON.stringify({ type: 'message', text: text }));
    input.value = '';
    autoResize();
  }

  input.addEventListener('input', autoResize);

  input.addEventListener('keydown', function(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  });

  form.addEventListener('submit', function(e) {
    e.preventDefault();
    sendMessage();
  });

  connect();
})();
`,
        }}
      />
    </div>
  );
}

export function ChatVerificationRenderer({ data }: VerificationRendererProps) {
  const text = data?.text ?? "";
  return (
    <div>
      <div
        style={{
          marginBottom: "0.75rem",
          fontSize: "0.85rem",
          color: colors.muted,
        }}
      >
        <strong style={{ color: colors.text }}>Chat Message</strong>
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
