import React from 'react';
import type { VerificationRendererProps } from '@sandclaw/gatekeeper-plugin-api';
import { Card, CardHeader, CardBody, Badge, PageHeader, StatusDot, ConversationList, colors } from '@sandclaw/ui';
import { waState } from './state';

export function WhatsAppPanel() {
  let statusBlock: React.ReactNode;

  switch (waState.connectionStatus) {
    case 'disconnected':
      statusBlock = (
        <p style={{ color: colors.danger }}>
          <StatusDot color="red" /> <strong>Status:</strong> Disconnected
        </p>
      );
      break;
    case 'qr_pending':
      statusBlock = (
        <div>
          <p style={{ color: colors.warning }}>
            <StatusDot color="yellow" /> <strong>Status:</strong> Waiting for QR scan
          </p>
          {waState.qrDataUrl && (
            <div style={{ marginTop: '0.75rem' }}>
              <img
                src={waState.qrDataUrl}
                alt="WhatsApp QR Code"
                style={{ width: 264, height: 264, imageRendering: 'pixelated', borderRadius: '0.5rem' }}
              />
              <p style={{ color: colors.muted, fontSize: '0.875rem', marginTop: '0.5rem' }}>
                Open WhatsApp on your phone &rarr; Linked Devices &rarr; Link a Device &rarr; Scan
                this code
              </p>
            </div>
          )}
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
        <p style={{ color: colors.success }}>
          <StatusDot color="green" /> <strong>Status:</strong> Connected as {waState.phoneNumber ?? 'unknown'}
        </p>
      );
      break;
  }


  return (
    <div className="sc-section">
      <PageHeader
        title="WhatsApp"
        subtitle="Connects to WhatsApp via Baileys. Incoming messages are queued for the muteworker; outbound messages require human approval."
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
          <Badge bg={colors.border} fg={colors.muted}>{waState.recentConversations.length}</Badge>
        </CardHeader>
        <CardBody>
          <ConversationList conversations={waState.recentConversations} />
        </CardBody>
      </Card>
    </div>
  );
}

export function WhatsAppVerificationRenderer({ data }: VerificationRendererProps) {
  const jid = data?.jid ?? 'Unknown';
  const text = data?.text ?? '';
  const phone = jid.replace(/@.*$/, '');

  return (
    <div>
      <div style={{ marginBottom: '0.75rem', fontSize: '0.85rem', color: colors.muted }}>
        <strong style={{ color: colors.text }}>To:</strong>{' '}
        <span className="sc-mono">{phone}</span>
        <span style={{ color: colors.border, margin: '0 0.5rem' }}>|</span>
        <span style={{ fontSize: '0.8rem', color: colors.muted }}>{jid}</span>
      </div>
      <div
        className="sc-message-bubble"
        style={{ background: colors.successTint, border: `1px solid ${colors.successTintBorder}`, color: colors.text }}
      >
        {text}
      </div>
    </div>
  );
}
