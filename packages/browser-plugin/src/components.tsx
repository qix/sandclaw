import React from 'react';
import type { VerificationRendererProps } from '@sandclaw/gatekeeper-plugin-api';
import { colors } from '@sandclaw/ui';

export function BrowserPanel() {
  return (
    <div style={{ padding: '1.5rem' }}>
      <h2 style={{ marginTop: 0 }}>Browser</h2>
      <p style={{ color: colors.muted }}>
        Allows the muteworker to request web research. All browser research
        requires human approval before the Confidante agent executes it.
        The approval and execution are deliberately decoupled: approving once
        lets the Confidante perform multiple searches to fulfil the request.
      </p>
      <section>
        <h3>Flow</h3>
        <ol style={{ lineHeight: '1.8' }}>
          <li>Muteworker requests research (creates verification request)</li>
          <li>Human reviews and approves in this UI</li>
          <li>Confidante executes browser automation</li>
          <li>Result posted back to muteworker as a safe queue job</li>
        </ol>
      </section>
      <section>
        <h3>Pending actions</h3>
        <p>Check the verification panel for pending research requests.</p>
      </section>
    </div>
  );
}

export function BrowserVerificationRenderer({ data }: VerificationRendererProps) {
  const prompt = data?.prompt ?? '';
  const requestId = data?.requestId ?? '';
  const responseJobType = data?.responseJobType ?? '';
  const constraints = data?.constraints as { maxSteps?: number; timeoutMs?: number } | undefined;
  const createdAt = data?.createdAt ?? '';

  return (
    <div>
      <div style={{ marginBottom: '0.75rem', fontSize: '0.85rem', color: colors.muted }}>
        <strong style={{ color: colors.text }}>Research Prompt</strong>
      </div>
      <div
        style={{
          background: colors.warningTint,
          border: `1px solid ${colors.warningTintBorder}`,
          borderRadius: '0.75rem',
          padding: '1rem 1.25rem',
          fontSize: '0.95rem',
          lineHeight: 1.6,
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-word',
          marginBottom: '1rem',
          color: colors.text,
        }}
      >
        {prompt}
      </div>
      <table style={{ fontSize: '0.82rem', borderCollapse: 'collapse', color: colors.text }}>
        <tbody>
          <tr>
            <td style={{ padding: '0.2rem 0.75rem 0.2rem 0', color: colors.muted, fontWeight: 600 }}>Request ID</td>
            <td style={{ padding: '0.2rem 0', fontFamily: 'monospace', fontSize: '0.8rem' }}>{requestId}</td>
          </tr>
          <tr>
            <td style={{ padding: '0.2rem 0.75rem 0.2rem 0', color: colors.muted, fontWeight: 600 }}>Response Job Type</td>
            <td style={{ padding: '0.2rem 0', fontFamily: 'monospace', fontSize: '0.8rem' }}>{responseJobType}</td>
          </tr>
          {constraints && (constraints.maxSteps != null || constraints.timeoutMs != null) && (
            <tr>
              <td style={{ padding: '0.2rem 0.75rem 0.2rem 0', color: colors.muted, fontWeight: 600 }}>Constraints</td>
              <td style={{ padding: '0.2rem 0', fontFamily: 'monospace', fontSize: '0.8rem' }}>
                {constraints.maxSteps != null && <>max {constraints.maxSteps} steps</>}
                {constraints.maxSteps != null && constraints.timeoutMs != null && <>, </>}
                {constraints.timeoutMs != null && <>{(constraints.timeoutMs / 1000).toFixed(0)}s timeout</>}
              </td>
            </tr>
          )}
          {createdAt && (
            <tr>
              <td style={{ padding: '0.2rem 0.75rem 0.2rem 0', color: colors.muted, fontWeight: 600 }}>Created</td>
              <td style={{ padding: '0.2rem 0', fontSize: '0.8rem' }}>{createdAt}</td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
