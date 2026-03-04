import React from 'react';
import type { VerificationRendererProps } from '@sandclaw/gatekeeper-plugin-api';

export function ObsidianPanel() {
  return (
    <div style={{ padding: '1.5rem' }}>
      <h2 style={{ marginTop: 0 }}>Obsidian</h2>
      <p style={{ color: '#6b7280' }}>
        Provides read and write access to an Obsidian vault on the host
        filesystem. Reading is safe (no verification needed). Writing requires
        human approval with a line-by-line diff preview.
      </p>
      <section>
        <h3>Capabilities</h3>
        <ul style={{ lineHeight: '1.8' }}>
          <li><strong>Search:</strong> Full-text BM25 search across vault files</li>
          <li><strong>Read:</strong> Read any note by path (no verification)</li>
          <li><strong>Write:</strong> Create or overwrite notes (requires approval with diff preview)</li>
        </ul>
      </section>
      <section>
        <h3>Pending actions</h3>
        <p>Check the verification panel for pending write requests.</p>
      </section>
    </div>
  );
}

export function ObsidianVerificationRenderer({ data }: VerificationRendererProps) {
  const filePath = data?.path ?? 'unknown';
  const mode = data?.mode ?? 'overwrite';
  const diff = data?.diff as
    | { lines?: Array<{ type: string; text: string }>; added?: number; removed?: number; unchanged?: number; truncated?: boolean }
    | undefined;
  const prevBytes = data?.previousBytes ?? 0;
  const nextBytes = data?.nextBytes ?? 0;

  const lineColors: Record<string, React.CSSProperties> = {
    add: { background: '#1a2e1a', color: '#4ade80' },
    remove: { background: '#2e1a1a', color: '#f87171' },
    context: { background: 'transparent', color: '#d1d5db' },
  };

  const linePrefix: Record<string, string> = {
    add: '+',
    remove: '-',
    context: ' ',
  };

  return (
    <div>
      <div style={{ marginBottom: '0.75rem', display: 'flex', gap: '1rem', alignItems: 'baseline', flexWrap: 'wrap' }}>
        <div style={{ fontSize: '0.85rem', color: '#9ca3af' }}>
          <strong style={{ color: '#e5e7eb' }}>File:</strong>{' '}
          <span style={{ fontFamily: 'monospace' }}>{filePath}</span>
        </div>
        <span
          style={{
            padding: '0.15rem 0.5rem',
            borderRadius: '9999px',
            fontSize: '0.75rem',
            fontWeight: 600,
            background: mode === 'append' ? '#fef3c7' : '#e0e7ff',
            color: mode === 'append' ? '#92400e' : '#3730a3',
          }}
        >
          {mode}
        </span>
        <span style={{ fontSize: '0.8rem', color: '#9ca3af' }}>
          {prevBytes} → {nextBytes} bytes
        </span>
      </div>

      {diff && diff.lines && diff.lines.length > 0 ? (
        <>
          <div style={{ display: 'flex', gap: '1rem', marginBottom: '0.5rem', fontSize: '0.8rem' }}>
            {diff.added != null && diff.added > 0 && (
              <span style={{ color: '#4ade80', fontWeight: 600 }}>+{diff.added} added</span>
            )}
            {diff.removed != null && diff.removed > 0 && (
              <span style={{ color: '#f87171', fontWeight: 600 }}>-{diff.removed} removed</span>
            )}
            {diff.unchanged != null && (
              <span style={{ color: '#6b7280' }}>{diff.unchanged} unchanged</span>
            )}
          </div>
          <div
            style={{
              border: '1px solid #374151',
              borderRadius: '0.5rem',
              overflow: 'hidden',
              fontFamily: "'SF Mono', 'Fira Code', 'JetBrains Mono', 'Cascadia Code', Menlo, Monaco, Consolas, monospace",
              fontSize: '0.82rem',
              lineHeight: 1.5,
              maxHeight: '400px',
              overflowY: 'auto',
              background: '#111827',
            }}
          >
            {diff.lines.map((line: any, i: number) => (
              <div
                key={i}
                style={{
                  padding: '0 0.75rem',
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-word',
                  ...(lineColors[line.type] ?? lineColors.context),
                }}
              >
                <span style={{ display: 'inline-block', width: '1.2em', userSelect: 'none', opacity: 0.6 }}>
                  {linePrefix[line.type] ?? ' '}
                </span>
                {line.text}
              </div>
            ))}
          </div>
          {diff.truncated && (
            <div style={{ marginTop: '0.5rem', fontSize: '0.8rem', color: '#9ca3af', fontStyle: 'italic' }}>
              Diff truncated — showing first lines only.
            </div>
          )}
        </>
      ) : (
        <div style={{ color: '#9ca3af', fontStyle: 'italic', fontSize: '0.85rem' }}>
          No diff available (new file).
        </div>
      )}
    </div>
  );
}
