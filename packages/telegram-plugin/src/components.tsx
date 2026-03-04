import React from 'react';
import type { VerificationRendererProps } from '@sandclaw/gatekeeper-plugin-api';
import { Card, CardHeader, CardBody, Button, Badge, PageHeader, StatusDot, Input, ConversationList, colors } from '@sandclaw/ui';
import { tgState } from './state';

export function TelegramPanel() {
  let statusBlock: React.ReactNode;

  switch (tgState.connectionStatus) {
    case 'disconnected':
    case 'waiting_for_token':
      statusBlock = (
        <div>
          <p style={{ color: colors.danger }}>
            <StatusDot color="red" /> <strong>Status:</strong> Disconnected
          </p>
          <div
            style={{
              background: colors.surface,
              border: `1px solid ${colors.border}`,
              borderRadius: 8,
              padding: '1rem',
              marginTop: '0.75rem',
              marginBottom: '1rem',
            }}
          >
            <h4 style={{ marginTop: 0, color: colors.text }}>Setup Instructions</h4>
            <ol style={{ paddingLeft: '1.25rem', color: colors.muted }}>
              <li>Open Telegram and search for <strong style={{ color: colors.text }}>@BotFather</strong></li>
              <li>
                Send <code style={{ color: colors.accent }}>{'/'+'newbot'}</code> and follow the prompts
              </li>
              <li>
                BotFather will reply with a <strong style={{ color: colors.text }}>bot token</strong> (looks like{' '}
                <code style={{ color: colors.accent }}>123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11</code>)
              </li>
              <li>Paste the token into the form below</li>
            </ol>
          </div>
          <form method="POST" action="/api/telegram/connect">
            <label style={{ color: colors.text }}>
              <strong>Bot Token:</strong>
              <br />
              <Input
                type="text"
                name="token"
                placeholder="123456:ABC-DEF..."
                style={{ marginTop: '0.25rem' }}
              />
            </label>
            <br />
            <Button type="submit" variant="primary" style={{ marginTop: '0.5rem' }}>
              Connect
            </Button>
          </form>
        </div>
      );
      break;
    case 'connecting':
      statusBlock = (
        <p style={{ color: colors.warning }}>
          <StatusDot color="yellow" /> <strong>Status:</strong> Connecting&hellip;
        </p>
      );
      break;
    case 'connected':
      statusBlock = (
        <div>
          <p style={{ color: colors.success }}>
            <StatusDot color="green" /> <strong>Status:</strong> Connected as @{tgState.botUsername ?? 'unknown'}
          </p>
          <form method="POST" action="/api/telegram/disconnect">
            <Button type="submit" variant="danger" style={{ marginTop: '0.5rem' }}>
              Disconnect
            </Button>
          </form>
        </div>
      );
      break;
  }

  return (
    <div className="sc-section">
      <PageHeader
        title="Telegram"
        subtitle="Connects to Telegram via the Bot API. Incoming messages are queued for the muteworker; outbound messages require human approval."
      />
      <Card>
        <CardHeader>
          <span style={{ fontWeight: 600, color: colors.text }}>Connection</span>
        </CardHeader>
        <CardBody>{statusBlock}</CardBody>
      </Card>
      <Card>
        <CardHeader>
          <span style={{ fontWeight: 600, color: colors.text }}>Recent Conversations</span>
          <Badge bg={colors.border} fg={colors.muted}>{tgState.recentConversations.length}</Badge>
        </CardHeader>
        <CardBody>
          <ConversationList conversations={tgState.recentConversations} />
        </CardBody>
      </Card>
    </div>
  );
}

export function TelegramVerificationRenderer({ data }: VerificationRendererProps) {
  const chatId = data?.chatId ?? 'Unknown';
  const text = data?.text ?? '';

  return (
    <div>
      <div style={{ marginBottom: '0.75rem', fontSize: '0.85rem', color: colors.muted }}>
        <strong style={{ color: colors.text }}>Chat ID:</strong>{' '}
        <span className="sc-mono">{chatId}</span>
      </div>
      <div
        className="sc-message-bubble"
        style={{ background: '#2563eb22', border: '1px solid #2563eb44', color: colors.text }}
      >
        {text}
      </div>
    </div>
  );
}
