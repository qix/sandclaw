import React from 'react';

export interface ConversationSummary {
  threadId: string;
  displayName: string;
  lastMessage: string;
  lastTimestamp: number;
  direction: 'inbound' | 'outbound';
}

function formatTime(ts: number): string {
  const d = new Date(ts * 1000);
  const now = new Date();
  const isToday =
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate();
  if (isToday) {
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

function initials(name: string): string {
  const parts = name.split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0][0].toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

interface ConversationListProps {
  conversations: ConversationSummary[];
}

export function ConversationList({ conversations }: ConversationListProps) {
  if (conversations.length === 0) {
    return <p style={{ color: '#8b8fa3', fontSize: '0.9rem' }}>No conversations yet.</p>;
  }

  return (
    <ul className="sc-conv-list">
      {conversations.map((c) => (
        <li key={c.threadId} className="sc-conv-item">
          <div className="sc-conv-avatar">{initials(c.displayName)}</div>
          <div className="sc-conv-body">
            <div className="sc-conv-header">
              <span className="sc-conv-name">{c.displayName}</span>
              <span className="sc-conv-time">{formatTime(c.lastTimestamp)}</span>
            </div>
            <div className="sc-conv-preview">
              <span className="sc-conv-direction">
                {c.direction === 'outbound' ? 'You: ' : ''}
              </span>
              {c.lastMessage}
            </div>
          </div>
        </li>
      ))}
    </ul>
  );
}
