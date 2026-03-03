import React from 'react';

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
}

export function VerificationsPage({ requests }: VerificationsPageProps) {
  if (requests.length === 0) {
    return (
      <div style={{ padding: '1.5rem' }}>
        <h2 style={{ marginTop: 0 }}>Verifications</h2>
        <p style={{ color: '#6b7280' }}>No pending verification requests.</p>
        <script
          dangerouslySetInnerHTML={{ __html: 'setTimeout(function(){location.reload()},5000)' }}
        />
      </div>
    );
  }

  return (
    <div style={{ padding: '1.5rem' }}>
      <h2 style={{ marginTop: 0 }}>Verifications</h2>
      <p style={{ color: '#6b7280', marginBottom: '1rem' }}>
        Pending actions awaiting human approval.
      </p>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr style={{ borderBottom: '2px solid #e5e7eb', textAlign: 'left' }}>
            <th style={{ padding: '0.5rem 0.75rem' }}>ID</th>
            <th style={{ padding: '0.5rem 0.75rem' }}>Plugin</th>
            <th style={{ padding: '0.5rem 0.75rem' }}>Action</th>
            <th style={{ padding: '0.5rem 0.75rem' }}>Details</th>
            <th style={{ padding: '0.5rem 0.75rem' }}>Created</th>
            <th style={{ padding: '0.5rem 0.75rem' }}>Actions</th>
          </tr>
        </thead>
        <tbody>
          {requests.map((r) => {
            let details: string;
            try {
              const parsed = JSON.parse(r.data);
              details = Object.entries(parsed)
                .map(([k, v]) => `${k}: ${v}`)
                .join(', ');
            } catch {
              details = r.data;
            }

            const createdDate = new Date(r.createdAt).toLocaleString();

            return (
              <tr key={r.id} style={{ borderBottom: '1px solid #e5e7eb' }}>
                <td style={{ padding: '0.5rem 0.75rem', fontVariantNumeric: 'tabular-nums' }}>
                  #{r.id}
                </td>
                <td style={{ padding: '0.5rem 0.75rem' }}>
                  <span
                    style={{
                      background: '#e0e7ff',
                      color: '#3730a3',
                      padding: '0.15rem 0.5rem',
                      borderRadius: '9999px',
                      fontSize: '0.8rem',
                      fontWeight: 500,
                    }}
                  >
                    {r.plugin}
                  </span>
                </td>
                <td style={{ padding: '0.5rem 0.75rem', fontFamily: 'monospace', fontSize: '0.85rem' }}>
                  {r.action}
                </td>
                <td
                  style={{
                    padding: '0.5rem 0.75rem',
                    maxWidth: '350px',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                    fontSize: '0.85rem',
                    color: '#374151',
                  }}
                >
                  {details}
                </td>
                <td style={{ padding: '0.5rem 0.75rem', whiteSpace: 'nowrap', fontSize: '0.85rem', color: '#6b7280' }}>
                  {createdDate}
                </td>
                <td style={{ padding: '0.5rem 0.75rem', whiteSpace: 'nowrap' }}>
                  <form
                    method="post"
                    action={`/verifications/approve/${r.id}`}
                    style={{ display: 'inline' }}
                  >
                    <button
                      type="submit"
                      style={{
                        background: '#22c55e',
                        color: '#fff',
                        border: 'none',
                        borderRadius: '0.375rem',
                        padding: '0.35rem 0.75rem',
                        cursor: 'pointer',
                        fontSize: '0.8rem',
                        fontWeight: 600,
                      }}
                    >
                      Approve
                    </button>
                  </form>
                  <form
                    method="post"
                    action={`/verifications/reject/${r.id}`}
                    style={{ display: 'inline', marginLeft: '0.5rem' }}
                  >
                    <button
                      type="submit"
                      style={{
                        background: '#ef4444',
                        color: '#fff',
                        border: 'none',
                        borderRadius: '0.375rem',
                        padding: '0.35rem 0.75rem',
                        cursor: 'pointer',
                        fontSize: '0.8rem',
                        fontWeight: 600,
                      }}
                    >
                      Reject
                    </button>
                  </form>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <script
        dangerouslySetInnerHTML={{ __html: 'setTimeout(function(){location.reload()},5000)' }}
      />
    </div>
  );
}
