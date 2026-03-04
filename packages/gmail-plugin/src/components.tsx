import React from 'react';
import type { VerificationRendererProps } from '@sandclaw/gatekeeper-plugin-api';

export function GmailPanel() {
  return (
    <div style={{ padding: '1.5rem' }}>
      <h2 style={{ marginTop: 0 }}>Gmail</h2>
      <p style={{ color: '#6b7280' }}>
        Connects to Gmail via the Google Gmail API with OAuth2. Incoming emails
        are queued for the muteworker; outbound emails require human approval
        before dispatch.
      </p>
      <section>
        <h3>Capabilities</h3>
        <ul style={{ lineHeight: '1.8' }}>
          <li><strong>Receive:</strong> Polls for new emails and queues as jobs</li>
          <li><strong>Send:</strong> Compose and send emails (requires approval)</li>
        </ul>
      </section>
      <section>
        <h3>Pending actions</h3>
        <p>Check the verification panel for pending send requests.</p>
      </section>
    </div>
  );
}

export function GmailVerificationRenderer({ data }: VerificationRendererProps) {
  const to = data?.to ?? '';
  const from = data?.from ?? '';
  const subject = data?.subject ?? '(no subject)';
  const text = data?.text ?? '';

  return (
    <div>
      <table style={{ fontSize: '0.85rem', marginBottom: '0.75rem', borderCollapse: 'collapse' }}>
        <tbody>
          <tr>
            <td style={{ padding: '0.2rem 0.75rem 0.2rem 0', color: '#6b7280', fontWeight: 600, whiteSpace: 'nowrap', verticalAlign: 'top' }}>From</td>
            <td style={{ padding: '0.2rem 0', fontFamily: 'monospace' }}>{from}</td>
          </tr>
          <tr>
            <td style={{ padding: '0.2rem 0.75rem 0.2rem 0', color: '#6b7280', fontWeight: 600, whiteSpace: 'nowrap', verticalAlign: 'top' }}>To</td>
            <td style={{ padding: '0.2rem 0', fontFamily: 'monospace' }}>{to}</td>
          </tr>
          <tr>
            <td style={{ padding: '0.2rem 0.75rem 0.2rem 0', color: '#6b7280', fontWeight: 600, whiteSpace: 'nowrap', verticalAlign: 'top' }}>Subject</td>
            <td style={{ padding: '0.2rem 0', fontWeight: 600 }}>{subject}</td>
          </tr>
        </tbody>
      </table>
      <div
        style={{
          background: '#fefce8',
          border: '1px solid #fef08a',
          borderRadius: '0.75rem',
          padding: '1rem 1.25rem',
          fontSize: '0.95rem',
          lineHeight: 1.6,
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-word',
        }}
      >
        {text}
      </div>
    </div>
  );
}
