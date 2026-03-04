import React, { createElement, type ComponentType } from 'react';
import type { VerificationRendererProps } from '@sandclaw/gatekeeper-plugin-api';

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
  /** Map of plugin id → verification renderer component (if the plugin provides one). */
  renderers: Record<string, ComponentType<VerificationRendererProps>>;
}

const styles = {
  container: {
    padding: '1.5rem',
    maxWidth: '900px',
  } as React.CSSProperties,
  card: {
    background: '#ffffff',
    border: '1px solid #e5e7eb',
    borderRadius: '0.75rem',
    marginBottom: '1rem',
    overflow: 'hidden',
  } as React.CSSProperties,
  cardHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '0.75rem 1.25rem',
    background: '#f9fafb',
    borderBottom: '1px solid #e5e7eb',
  } as React.CSSProperties,
  headerLeft: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.75rem',
  } as React.CSSProperties,
  badge: {
    padding: '0.2rem 0.6rem',
    borderRadius: '9999px',
    fontSize: '0.75rem',
    fontWeight: 600,
    textTransform: 'uppercase',
    letterSpacing: '0.03em',
  } as React.CSSProperties,
  actionLabel: {
    fontFamily: 'monospace',
    fontSize: '0.85rem',
    color: '#374151',
  } as React.CSSProperties,
  timestamp: {
    fontSize: '0.8rem',
    color: '#9ca3af',
    whiteSpace: 'nowrap',
  } as React.CSSProperties,
  cardBody: {
    padding: '1.25rem',
  } as React.CSSProperties,
  cardFooter: {
    display: 'flex',
    gap: '0.5rem',
    padding: '0.75rem 1.25rem',
    borderTop: '1px solid #e5e7eb',
    background: '#f9fafb',
  } as React.CSSProperties,
  approveBtn: {
    background: '#22c55e',
    color: '#fff',
    border: 'none',
    borderRadius: '0.375rem',
    padding: '0.5rem 1.25rem',
    cursor: 'pointer',
    fontSize: '0.85rem',
    fontWeight: 600,
  } as React.CSSProperties,
  rejectBtn: {
    background: '#ef4444',
    color: '#fff',
    border: 'none',
    borderRadius: '0.375rem',
    padding: '0.5rem 1.25rem',
    cursor: 'pointer',
    fontSize: '0.85rem',
    fontWeight: 600,
  } as React.CSSProperties,
  fallbackPre: {
    margin: 0,
    padding: '1rem',
    background: '#f3f4f6',
    borderRadius: '0.5rem',
    fontSize: '0.85rem',
    fontFamily: 'monospace',
    whiteSpace: 'pre-wrap',
    wordBreak: 'break-word',
    overflowX: 'auto',
    lineHeight: 1.5,
  } as React.CSSProperties,
};

const pluginColors: Record<string, { bg: string; fg: string }> = {
  whatsapp: { bg: '#dcfce7', fg: '#166534' },
  telegram: { bg: '#dbeafe', fg: '#1e40af' },
  obsidian: { bg: '#f3e8ff', fg: '#6b21a8' },
  gmail: { bg: '#fef3c7', fg: '#92400e' },
  browser: { bg: '#ffedd5', fg: '#9a3412' },
};

function DefaultRenderer({ data }: VerificationRendererProps) {
  return <pre style={styles.fallbackPre}>{JSON.stringify(data, null, 2)}</pre>;
}

export function VerificationsPage({ requests, renderers }: VerificationsPageProps) {
  if (requests.length === 0) {
    return (
      <div style={styles.container}>
        <h2 style={{ marginTop: 0, marginBottom: '0.5rem' }}>Verifications</h2>
        <p style={{ color: '#6b7280' }}>No pending verification requests.</p>
        <script
          dangerouslySetInnerHTML={{ __html: 'setTimeout(function(){location.reload()},5000)' }}
        />
      </div>
    );
  }

  return (
    <div style={styles.container}>
      <h2 style={{ marginTop: 0, marginBottom: '0.25rem' }}>Verifications</h2>
      <p style={{ color: '#6b7280', marginBottom: '1.25rem' }}>
        {requests.length} pending action{requests.length !== 1 ? 's' : ''} awaiting human approval.
      </p>
      {requests.map((r) => {
        let parsed: any;
        try {
          parsed = JSON.parse(r.data);
        } catch {
          parsed = r.data;
        }

        const Renderer = renderers[r.plugin] ?? DefaultRenderer;
        const colors = pluginColors[r.plugin] ?? { bg: '#e0e7ff', fg: '#3730a3' };
        const createdDate = new Date(r.createdAt).toLocaleString();

        return (
          <div key={r.id} style={styles.card}>
            <div style={styles.cardHeader}>
              <div style={styles.headerLeft}>
                <span style={{ ...styles.badge, background: colors.bg, color: colors.fg }}>
                  {r.plugin}
                </span>
                <span style={styles.actionLabel}>{r.action}</span>
                <span style={{ color: '#d1d5db' }}>#{r.id}</span>
              </div>
              <span style={styles.timestamp}>{createdDate}</span>
            </div>
            <div style={styles.cardBody}>
              {createElement(Renderer, { action: r.action, data: parsed })}
            </div>
            <div style={styles.cardFooter}>
              <form method="post" action={`/verifications/approve/${r.id}`}>
                <button type="submit" style={styles.approveBtn}>
                  Approve
                </button>
              </form>
              <form method="post" action={`/verifications/reject/${r.id}`}>
                <button type="submit" style={styles.rejectBtn}>
                  Reject
                </button>
              </form>
            </div>
          </div>
        );
      })}
      <script
        dangerouslySetInnerHTML={{ __html: 'setTimeout(function(){location.reload()},5000)' }}
      />
    </div>
  );
}
