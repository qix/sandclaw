/** Dark theme color tokens (OKLCH). */
export const colors = {
  bg: "oklch(0.13 0.01 270)",
  surface: "oklch(0.18 0.015 270)",
  surfaceHover: "oklch(0.22 0.025 270)",
  border: "oklch(0.28 0.03 265)",
  text: "oklch(0.92 0.015 275)",
  muted: "oklch(0.65 0.025 270)",
  accent: "oklch(0.54 0.24 265)",
  accentHover: "oklch(0.65 0.19 265)",
  success: "oklch(0.72 0.19 152)",
  warning: "oklch(0.78 0.17 70)",
  danger: "oklch(0.63 0.23 27)",
  dangerHover: "oklch(0.70 0.18 22)",

  /* Tinted backgrounds for message bubbles */
  accentTint: "oklch(0.54 0.24 265 / 0.13)",
  accentTintBorder: "oklch(0.54 0.24 265 / 0.27)",
  successTint: "oklch(0.60 0.17 152 / 0.13)",
  successTintBorder: "oklch(0.60 0.17 152 / 0.27)",
  warningTint: "oklch(0.78 0.17 70 / 0.15)",
  warningTintBorder: "oklch(0.78 0.17 70 / 0.30)",

  /* Diff */
  diffAddBg: "oklch(0.22 0.05 152)",
  diffAddFg: "oklch(0.78 0.18 152)",
  diffRemoveBg: "oklch(0.22 0.05 27)",
  diffRemoveFg: "oklch(0.70 0.18 22)",
  diffContextFg: "oklch(0.85 0.01 270)",
  diffBorder: "oklch(0.32 0.02 260)",
  diffBg: "oklch(0.15 0.015 270)",

  /* Mode badges */
  badgeAmberBg: "oklch(0.30 0.08 70)",
  badgeAmberFg: "oklch(0.78 0.14 70)",
  badgeIndigoBg: "oklch(0.30 0.08 265)",
  badgeIndigoFg: "oklch(0.70 0.15 265)",
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
.sc-btn-primary { background: ${colors.accent}; color: oklch(1 0 0); }
.sc-btn-primary:hover { background: ${colors.accentHover}; }
.sc-btn-success { background: ${colors.success}; color: oklch(1 0 0); }
.sc-btn-success:hover { background: oklch(0.60 0.17 152); }
.sc-btn-danger { background: ${colors.danger}; color: oklch(1 0 0); }
.sc-btn-danger:hover { background: ${colors.dangerHover}; }
.sc-btn-secondary { background: ${colors.muted}; color: oklch(1 0 0); opacity: 0.8; }
.sc-btn-secondary:hover { opacity: 1; }
.sc-btn:disabled { opacity: 0.4; cursor: not-allowed; }

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
/* --- Mobile nav (hidden by default) --- */
.sc-mobile-nav {
  display: none;
  background: ${colors.surface};
  border-bottom: 1px solid ${colors.border};
  padding: 0.75rem 1rem;
}
.sc-mobile-nav .sc-brand {
  padding: 0 0 0.5rem;
}

/* --- Dropdown menu (shadcn-style) --- */
.sc-dropdown {
  position: relative;
  width: 100%;
}
.sc-dropdown-trigger {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  padding: 0.5rem 0.75rem;
  background: ${colors.bg};
  color: ${colors.text};
  border: 1px solid ${colors.border};
  border-radius: 0.375rem;
  font-family: inherit;
  font-size: 0.875rem;
  font-weight: 500;
  cursor: pointer;
  outline: none;
  transition: border-color 0.15s, box-shadow 0.15s;
}
.sc-dropdown-trigger:hover {
  background: ${colors.surfaceHover};
}
.sc-dropdown-trigger:focus-visible {
  border-color: ${colors.accent};
  box-shadow: 0 0 0 2px oklch(0.54 0.24 265 / 0.25);
}
.sc-dropdown-chevron {
  flex-shrink: 0;
  color: ${colors.muted};
  transition: transform 0.2s;
}
.sc-dropdown.open .sc-dropdown-chevron {
  transform: rotate(180deg);
}

.sc-dropdown-content {
  display: none;
  position: absolute;
  top: calc(100% + 4px);
  left: 0;
  right: 0;
  z-index: 50;
  background: ${colors.surface};
  border: 1px solid ${colors.border};
  border-radius: 0.5rem;
  padding: 0.25rem;
  box-shadow: 0 4px 6px -1px oklch(0 0 0 / 0.3), 0 2px 4px -2px oklch(0 0 0 / 0.2);
  animation: sc-dropdown-in 0.15s ease-out;
}
.sc-dropdown.open .sc-dropdown-content {
  display: block;
}
@keyframes sc-dropdown-in {
  from { opacity: 0; transform: translateY(-4px) scale(0.97); }
  to   { opacity: 1; transform: translateY(0) scale(1); }
}

.sc-dropdown-item {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  width: 100%;
  padding: 0.4rem 0.5rem;
  border-radius: 0.25rem;
  color: ${colors.text};
  text-decoration: none;
  font-size: 0.875rem;
  cursor: pointer;
  transition: background 0.1s;
}
.sc-dropdown-item:hover {
  background: ${colors.surfaceHover};
}
.sc-dropdown-item.active {
  background: ${colors.surfaceHover};
}

.sc-dropdown-check {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 1rem;
  flex-shrink: 0;
  font-size: 0.75rem;
  color: ${colors.accent};
}

.sc-dropdown-separator {
  height: 1px;
  background: ${colors.border};
  margin: 0.25rem -0.25rem;
}

@media (max-width: 768px) {
  nav.sc-sidebar { display: none; }
  .sc-mobile-nav { display: block; }
  body { flex-direction: column; }
}

/* --- Pagination --- */
.sc-pagination {
  display: flex;
  align-items: center;
  gap: 0.25rem;
  margin-top: 1rem;
  flex-wrap: wrap;
}
.sc-pagination-link {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 2rem;
  padding: 0.35rem 0.6rem;
  border-radius: 0.375rem;
  font-size: 0.82rem;
  color: ${colors.muted};
  text-decoration: none;
  transition: background 0.15s, color 0.15s;
}
.sc-pagination-link:hover {
  background: ${colors.surfaceHover};
  color: ${colors.text};
}
.sc-pagination-link.active {
  background: ${colors.accent};
  color: oklch(1 0 0);
  pointer-events: none;
}
.sc-pagination-gap {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 1.5rem;
  color: ${colors.muted};
  font-size: 0.82rem;
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
