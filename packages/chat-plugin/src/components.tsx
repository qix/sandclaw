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
      <style
        dangerouslySetInnerHTML={{
          __html: `
.sc-chat-md { line-height: 1.5; }
.sc-chat-md p { margin: 0 0 0.4em 0; }
.sc-chat-md p:last-child { margin-bottom: 0; }
.sc-chat-md pre { background: ${colors.bg}; border: 1px solid ${colors.border}; border-radius: 0.375rem; padding: 0.5rem 0.75rem; overflow-x: auto; margin: 0.4em 0; }
.sc-chat-md pre code { background: none; padding: 0; border-radius: 0; font-size: 0.8125rem; }
.sc-chat-md code { background: ${colors.bg}; padding: 0.1em 0.3em; border-radius: 0.25rem; font-size: 0.8125rem; }
.sc-chat-md ul, .sc-chat-md ol { margin: 0.4em 0; padding-left: 1.5em; }
.sc-chat-md blockquote { border-left: 3px solid ${colors.border}; margin: 0.4em 0; padding-left: 0.75rem; opacity: 0.85; }
.sc-chat-md a { color: ${colors.accentHover}; text-decoration: underline; }
.sc-chat-md h1, .sc-chat-md h2, .sc-chat-md h3, .sc-chat-md h4 { margin: 0.5em 0 0.25em 0; font-size: inherit; font-weight: 700; }
.sc-chat-md h1 { font-size: 1.1em; }
.sc-chat-md h2 { font-size: 1.05em; }
.sc-chat-md img { max-width: 100%; }
.sc-chat-md table { border-collapse: collapse; margin: 0.4em 0; }
.sc-chat-md th, .sc-chat-md td { border: 1px solid ${colors.border}; padding: 0.25rem 0.5rem; font-size: 0.8125rem; }
`,
        }}
      />
      <script
        dangerouslySetInnerHTML={{
          __html: `
(function() {
  var messagesEl = document.getElementById('chat-messages');
  var form = document.getElementById('chat-form');
  var input = document.getElementById('chat-input');
  var latestMessageId = 0;
  var markReadTimer = null;
  var markedLib = null;

  // Load marked from esm.sh CDN
  import('https://esm.sh/marked@15.0.6').then(function(mod) {
    markedLib = mod;
    // Escape raw HTML tokens to prevent XSS
    markedLib.marked.use({
      renderer: {
        html: function(token) {
          return escapeHtml(typeof token === 'string' ? token : token.text || '');
        }
      }
    });
  }).catch(function(err) {
    console.warn('Failed to load marked library, using plain text rendering:', err);
  });

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

  function renderMarkdown(text) {
    if (!markedLib) return linkify(escapeHtml(text));
    try {
      // Treat single newlines as paragraph breaks by converting them to double newlines.
      // Preserve existing double+ newlines and don't alter newlines inside code blocks.
      var parts = text.split(/(\`\`\`[\s\S]*?\`\`\`)/g);
      var normalized = parts.map(function(part, i) {
        if (i % 2 === 1) return part; // code block, leave as-is
        return part.replace(/\n{2,}/g, '\n\n').replace(/(?<!\n)\n(?!\n)/g, '\n\n');
      }).join('');
      return markedLib.marked.parse(normalized, { breaks: false });
    } catch (e) {
      console.warn('Markdown parse failed, falling back to plain text:', e);
      return linkify(escapeHtml(text));
    }
  }

  function renderMessage(msg) {
    var div = document.createElement('div');
    var isInbound = msg.direction === 'inbound';
    div.style.cssText = 'padding:0.5rem 0.75rem;border-radius:0.5rem;max-width:80%;word-wrap:break-word;font-size:0.875rem;' +
      (isInbound
        ? 'align-self:flex-end;background:${colors.accentTint};border:1px solid ${colors.accentTintBorder};color:inherit;'
        : 'align-self:flex-start;background:${colors.successTint};border:1px solid ${colors.successTintBorder};color:inherit;');
    div.className = 'sc-chat-msg';
    var label = isInbound ? 'You' : 'Agent';
    var time = msg.timestamp ? new Date(msg.timestamp).toLocaleTimeString() : '';
    div.innerHTML = '<div style="font-size:0.75rem;opacity:0.6;margin-bottom:0.25rem;">' + escapeHtml(label) + (time ? ' · ' + escapeHtml(time) : '') + '</div><div class="sc-chat-md">' + renderMarkdown(msg.text) + '</div>';
    return div;
  }

  function scrollToBottom() {
    messagesEl.scrollTop = messagesEl.scrollHeight;
  }

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

  document.addEventListener('sc:ws:message', function(e) {
    var data = e.detail;
    if (data.type === 'chat-plugin:history') {
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
    } else if (data.type === 'chat-plugin:message' && data.message) {
      var placeholder = messagesEl.querySelector('p');
      if (placeholder && placeholder.textContent.indexOf('No messages') >= 0) {
        placeholder.remove();
      }
      messagesEl.appendChild(renderMessage(data.message));
      if (data.message.id > latestMessageId) latestMessageId = data.message.id;
      var wasAtBottom = isAtBottom();
      scrollToBottom();
      if (wasAtBottom) debouncedMarkRead();
    }
  });

  function autoResize() {
    input.style.height = 'auto';
    input.style.height = Math.min(input.scrollHeight, 150) + 'px';
    input.style.overflow = input.scrollHeight > 150 ? 'auto' : 'hidden';
  }

  function sendMessage() {
    var text = input.value.trim();
    if (!text || !window.__scWs) return;
    window.__scWs.send({ type: 'chat-plugin:message', text: text });
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
