import React from 'react';
import type { VerificationRendererProps } from '@sandclaw/gatekeeper-plugin-api';
import { Card, CardHeader, CardBody, PageHeader, StatusDot, colors } from '@sandclaw/ui';

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
              height: '400px',
              overflowY: 'auto',
              padding: '0.75rem',
              background: colors.surface,
              borderRadius: '0.5rem',
              border: `1px solid ${colors.border}`,
              marginBottom: '0.75rem',
              display: 'flex',
              flexDirection: 'column',
              gap: '0.5rem',
            }}
          >
            <p style={{ color: colors.muted, fontSize: '0.875rem', textAlign: 'center', margin: 'auto 0' }}>
              Connecting&hellip;
            </p>
          </div>
          <form
            id="chat-form"
            style={{ display: 'flex', gap: '0.5rem' }}
            onSubmit={(e: any) => e.preventDefault()}
          >
            <input
              id="chat-input"
              type="text"
              placeholder="Type a message..."
              autoComplete="off"
              style={{
                flex: 1,
                padding: '0.5rem 0.75rem',
                borderRadius: '0.375rem',
                border: `1px solid ${colors.border}`,
                background: colors.surface,
                color: colors.text,
                fontSize: '0.875rem',
                outline: 'none',
              }}
            />
            <button
              type="submit"
              style={{
                padding: '0.5rem 1rem',
                borderRadius: '0.375rem',
                border: 'none',
                background: colors.accent,
                color: '#fff',
                fontWeight: 600,
                fontSize: '0.875rem',
                cursor: 'pointer',
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

  function renderMessage(msg) {
    var div = document.createElement('div');
    var isInbound = msg.direction === 'inbound';
    div.style.cssText = 'padding:0.5rem 0.75rem;border-radius:0.5rem;max-width:80%;word-wrap:break-word;white-space:pre-wrap;font-size:0.875rem;' +
      (isInbound
        ? 'align-self:flex-end;background:#3b82f622;border:1px solid #3b82f644;color:inherit;'
        : 'align-self:flex-start;background:#16a34a22;border:1px solid #16a34a44;color:inherit;');
    var label = isInbound ? 'You' : 'Agent';
    var time = msg.timestamp ? new Date(msg.timestamp * 1000).toLocaleTimeString() : '';
    div.innerHTML = '<div style="font-size:0.75rem;opacity:0.6;margin-bottom:0.25rem;">' + escapeHtml(label) + (time ? ' · ' + escapeHtml(time) : '') + '</div>' + escapeHtml(msg.text);
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

    ws.onmessage = function(e) {
      try {
        var data = JSON.parse(e.data);
        if (data.type === 'history') {
          messagesEl.innerHTML = '';
          if (data.messages && data.messages.length) {
            data.messages.forEach(function(msg) {
              messagesEl.appendChild(renderMessage(msg));
            });
          } else {
            var p = document.createElement('p');
            p.style.cssText = 'color:#888;font-size:0.875rem;text-align:center;margin:auto 0;';
            p.textContent = 'No messages yet. Start a conversation!';
            messagesEl.appendChild(p);
          }
          scrollToBottom();
        } else if (data.type === 'message') {
          // Remove "no messages" placeholder if present
          var placeholder = messagesEl.querySelector('p');
          if (placeholder && placeholder.textContent.indexOf('No messages') >= 0) {
            placeholder.remove();
          }
          messagesEl.appendChild(renderMessage(data));
          scrollToBottom();
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

  form.addEventListener('submit', function(e) {
    e.preventDefault();
    var text = input.value.trim();
    if (!text || !connected) return;
    ws.send(JSON.stringify({ type: 'message', text: text }));
    input.value = '';
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
  const text = data?.text ?? '';
  return (
    <div>
      <div style={{ marginBottom: '0.75rem', fontSize: '0.85rem', color: colors.muted }}>
        <strong style={{ color: colors.text }}>Chat Message</strong>
      </div>
      <div
        className="sc-message-bubble"
        style={{ background: '#16a34a22', border: '1px solid #16a34a44', color: colors.text }}
      >
        {text}
      </div>
    </div>
  );
}
