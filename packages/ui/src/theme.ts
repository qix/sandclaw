/** Dark theme color tokens. */
export const colors = {
  bg: '#0f1117',
  surface: '#1a1d27',
  surfaceHover: '#22253a',
  border: '#2e3348',
  text: '#e4e6f0',
  muted: '#8b8fa3',
  accent: '#6366f1',
  accentHover: '#818cf8',
  success: '#22c55e',
  warning: '#f59e0b',
  danger: '#ef4444',
  dangerHover: '#f87171',
} as const;

/**
 * Returns the global CSS string that should be embedded in a `<style>` tag.
 * All classes use the `sc-` prefix to avoid collisions with plugin CSS.
 */
export function getGlobalStyles(): string {
  return `
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
body {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif;
  display: flex;
  height: 100vh;
  background: ${colors.bg};
  color: ${colors.text};
}

/* --- Sidebar --- */
nav.sc-sidebar {
  width: 230px;
  background: ${colors.surface};
  border-right: 1px solid ${colors.border};
  display: flex;
  flex-direction: column;
  padding: 1rem 0;
  flex-shrink: 0;
  overflow-y: auto;
}
.sc-brand {
  font-weight: 700;
  font-size: 1.1rem;
  padding: 0.5rem 1.25rem 1.25rem;
  color: ${colors.text};
  letter-spacing: 0.05em;
}
.sc-brand span { color: ${colors.accent}; }

.sc-nav-link {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.6rem 1.25rem;
  color: ${colors.muted};
  text-decoration: none;
  font-size: 0.9rem;
  border-left: 3px solid transparent;
  transition: background 0.15s, color 0.15s;
}
.sc-nav-link:hover {
  color: ${colors.text};
  background: ${colors.surfaceHover};
}
.sc-nav-link.active {
  color: ${colors.text};
  border-left-color: ${colors.accent};
  background: ${colors.surfaceHover};
}

.sc-nav-divider {
  border-top: 1px solid ${colors.border};
  margin: 0.5rem 1rem;
}

/* --- Main content area --- */
main.sc-main {
  flex: 1;
  overflow-y: auto;
  background: ${colors.bg};
}

/* --- Card --- */
.sc-card {
  background: ${colors.surface};
  border: 1px solid ${colors.border};
  border-radius: 0.75rem;
  margin-bottom: 1rem;
  overflow: hidden;
}
.sc-card-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.75rem 1.25rem;
  border-bottom: 1px solid ${colors.border};
}
.sc-card-body {
  padding: 1.25rem;
}
.sc-card-footer {
  display: flex;
  gap: 0.5rem;
  padding: 0.75rem 1.25rem;
  border-top: 1px solid ${colors.border};
}

/* --- Badge --- */
.sc-badge {
  display: inline-flex;
  align-items: center;
  padding: 0.15rem 0.55rem;
  border-radius: 9999px;
  font-size: 0.7rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  line-height: 1.4;
}

/* --- Button --- */
.sc-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: none;
  border-radius: 0.375rem;
  padding: 0.5rem 1.25rem;
  cursor: pointer;
  font-size: 0.85rem;
  font-weight: 600;
  font-family: inherit;
  transition: background 0.15s;
}
.sc-btn-primary { background: ${colors.accent}; color: #fff; }
.sc-btn-primary:hover { background: ${colors.accentHover}; }
.sc-btn-success { background: ${colors.success}; color: #fff; }
.sc-btn-success:hover { background: #16a34a; }
.sc-btn-danger { background: ${colors.danger}; color: #fff; }
.sc-btn-danger:hover { background: ${colors.dangerHover}; }

/* --- Status dot --- */
.sc-status-dot {
  display: inline-block;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
}
.sc-status-dot-green { background: ${colors.success}; }
.sc-status-dot-yellow { background: ${colors.warning}; }
.sc-status-dot-red { background: ${colors.danger}; }
.sc-status-dot-gray { background: ${colors.muted}; }

/* --- Input --- */
.sc-input {
  width: 100%;
  max-width: 480px;
  padding: 0.5rem 0.75rem;
  background: ${colors.bg};
  color: ${colors.text};
  border: 1px solid ${colors.border};
  border-radius: 0.375rem;
  font-family: monospace;
  font-size: 0.9rem;
  outline: none;
  transition: border-color 0.15s;
}
.sc-input:focus { border-color: ${colors.accent}; }

/* --- Conversation list --- */
.sc-conv-list {
  list-style: none;
  padding: 0;
}
.sc-conv-item {
  display: flex;
  gap: 0.75rem;
  padding: 0.75rem 0;
  border-bottom: 1px solid ${colors.border};
}
.sc-conv-item:last-child { border-bottom: none; }
.sc-conv-avatar {
  width: 36px;
  height: 36px;
  border-radius: 50%;
  background: ${colors.border};
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 0.8rem;
  font-weight: 600;
  color: ${colors.muted};
  flex-shrink: 0;
}
.sc-conv-body { flex: 1; min-width: 0; }
.sc-conv-header {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  gap: 0.5rem;
  margin-bottom: 0.2rem;
}
.sc-conv-name {
  font-weight: 600;
  font-size: 0.85rem;
  color: ${colors.text};
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.sc-conv-time {
  font-size: 0.75rem;
  color: ${colors.muted};
  white-space: nowrap;
}
.sc-conv-preview {
  font-size: 0.82rem;
  color: ${colors.muted};
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.sc-conv-direction {
  font-size: 0.7rem;
  color: ${colors.muted};
  margin-right: 0.25rem;
}

/* --- Page header --- */
.sc-page-header {
  margin-bottom: 1.25rem;
}
.sc-page-header h2 {
  font-size: 1.3rem;
  font-weight: 700;
  color: ${colors.text};
  margin: 0 0 0.25rem;
}
.sc-page-header p {
  color: ${colors.muted};
  font-size: 0.9rem;
  margin: 0;
}

/* --- Misc helpers --- */
.sc-pre {
  margin: 0;
  padding: 1rem;
  background: ${colors.bg};
  border: 1px solid ${colors.border};
  border-radius: 0.5rem;
  font-size: 0.85rem;
  font-family: monospace;
  white-space: pre-wrap;
  word-break: break-word;
  overflow-x: auto;
  line-height: 1.5;
  color: ${colors.text};
}
.sc-section {
  padding: 1.5rem;
  max-width: 900px;
}
.sc-mono { font-family: monospace; }
.sc-flex-row { display: flex; align-items: center; gap: 0.75rem; }
.sc-message-bubble {
  border-radius: 0.75rem;
  padding: 1rem 1.25rem;
  font-size: 0.95rem;
  line-height: 1.6;
  white-space: pre-wrap;
  word-break: break-word;
}
`;
}
