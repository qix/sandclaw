import React, { createElement, type ComponentType } from 'react';
import type { VerificationRendererProps } from '@sandclaw/gatekeeper-plugin-api';
import { Card, CardHeader, CardBody, CardFooter, Button, Badge, PageHeader, colors } from '@sandclaw/ui';

export interface VerificationRequest {
  id: number;
  plugin: string;
  action: string;
  data: string;
  status: string;
  createdAt: number;
}

interface VerificationsPageProps {
  requests: VerificationRequest[];
  renderers: Record<string, ComponentType<VerificationRendererProps>>;
}

const pluginColors: Record<string, { bg: string; fg: string }> = {
  whatsapp: { bg: '#16a34a', fg: '#fff' },
  telegram: { bg: '#2563eb', fg: '#fff' },
  obsidian: { bg: '#7c3aed', fg: '#fff' },
  gmail: { bg: '#d97706', fg: '#fff' },
  browser: { bg: '#ea580c', fg: '#fff' },
};

function DefaultRenderer({ data }: VerificationRendererProps) {
  return <pre className="sc-pre">{JSON.stringify(data, null, 2)}</pre>;
}

export function VerificationsPage({ requests, renderers }: VerificationsPageProps) {
  if (requests.length === 0) {
    return (
      <div className="sc-section">
        <PageHeader title="Verifications" />
        <p style={{ color: colors.muted }}>No pending verification requests.</p>
      </div>
    );
  }

  return (
    <div className="sc-section">
      <PageHeader
        title="Verifications"
        subtitle={`${requests.length} pending action${requests.length !== 1 ? 's' : ''} awaiting human approval.`}
      />
      {requests.map((r) => {
        let parsed: any;
        try {
          parsed = JSON.parse(r.data);
        } catch {
          parsed = r.data;
        }

        const Renderer = renderers[r.plugin] ?? DefaultRenderer;
        const badgeColors = pluginColors[r.plugin] ?? { bg: colors.accent, fg: '#fff' };
        const createdDate = new Date(r.createdAt).toLocaleString();

        return (
          <Card key={r.id}>
            <CardHeader>
              <div className="sc-flex-row">
                <Badge bg={badgeColors.bg} fg={badgeColors.fg}>{r.plugin}</Badge>
                <span className="sc-mono" style={{ fontSize: '0.85rem', color: colors.text }}>{r.action}</span>
                <span style={{ color: colors.muted }}>#{r.id}</span>
              </div>
              <span style={{ fontSize: '0.8rem', color: colors.muted, whiteSpace: 'nowrap' }}>{createdDate}</span>
            </CardHeader>
            <CardBody>
              {createElement(Renderer, { action: r.action, data: parsed })}
            </CardBody>
            <CardFooter>
              <form method="post" action={`/verifications/approve/${r.id}`}>
                <Button type="submit" variant="success">Approve</Button>
              </form>
              <form method="post" action={`/verifications/reject/${r.id}`}>
                <Button type="submit" variant="danger">Reject</Button>
              </form>
            </CardFooter>
          </Card>
        );
      })}
    </div>
  );
}
