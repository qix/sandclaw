import React, { createElement } from 'react';
import type { GatekeeperPlugin, VerificationRendererProps, TabMeta } from '@sandclaw/gatekeeper-plugin-api';
import { getGlobalStyles } from '@sandclaw/ui';
import { StatusDot } from '@sandclaw/ui';
import { Badge } from '@sandclaw/ui';
import { VerificationsPage, type VerificationRequest } from './VerificationsPage';
import type { ComponentType } from 'react';

interface AppProps {
  plugins: GatekeeperPlugin[];
  activePluginId: string;
  activePage?: string;
  verificationRequests?: VerificationRequest[];
  pendingVerificationCount: number;
  pluginTabMeta: Record<string, TabMeta>;
}

export function App({
  plugins,
  activePluginId,
  activePage,
  verificationRequests,
  pendingVerificationCount,
  pluginTabMeta,
}: AppProps) {
  const active = activePage ? null : (plugins.find((p) => p.id === activePluginId) ?? plugins[0]);

  const renderers: Record<string, ComponentType<VerificationRendererProps>> = {};
  for (const p of plugins) {
    if (p.verificationRenderer) {
      renderers[p.id] = p.verificationRenderer;
    }
  }

  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>Sandclaw Gatekeeper</title>
        <style dangerouslySetInnerHTML={{ __html: getGlobalStyles() }} />
      </head>
      <body>
        {/* Desktop sidebar */}
        <nav className="sc-sidebar">
          <div className="sc-brand">
            Sand<span>Claw</span>
          </div>
          <a
            href="?page=verifications"
            className={`sc-nav-link ${activePage === 'verifications' ? 'active' : ''}`}
          >
            Verifications
            {pendingVerificationCount > 0 && (
              <Badge bg="#ef4444" fg="#fff" style={{ marginLeft: '0.4rem', fontSize: '0.65rem' }}>
                {pendingVerificationCount}
              </Badge>
            )}
          </a>
          <div className="sc-nav-divider" />
          {plugins.map((p) => {
            const meta = pluginTabMeta[p.id];
            return (
              <a
                key={p.id}
                href={`?plugin=${p.id}`}
                className={`sc-nav-link ${p.id === active?.id ? 'active' : ''}`}
              >
                {meta?.statusColor && <StatusDot color={meta.statusColor} />}
                {p.title}
              </a>
            );
          })}
        </nav>

        {/* Mobile top nav */}
        <div className="sc-mobile-nav">
          <div className="sc-brand">
            Sand<span>Claw</span>
          </div>
          <div className="sc-dropdown" id="sc-mobile-dropdown">
            <button className="sc-dropdown-trigger" type="button" id="sc-dropdown-trigger">
              <span>
                {activePage === 'verifications'
                  ? 'Verifications'
                  : active?.title ?? 'Select page'}
              </span>
              <svg className="sc-dropdown-chevron" width="16" height="16" viewBox="0 0 16 16" fill="none">
                <path d="M4 6l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </button>
            <div className="sc-dropdown-content" id="sc-dropdown-content" role="menu">
              <a
                href="?page=verifications"
                className={`sc-dropdown-item ${activePage === 'verifications' ? 'active' : ''}`}
                role="menuitem"
              >
                <span className="sc-dropdown-check">{activePage === 'verifications' ? '\u2713' : ''}</span>
                Verifications
                {pendingVerificationCount > 0 && (
                  <Badge bg="#ef4444" fg="#fff" style={{ marginLeft: 'auto', fontSize: '0.65rem' }}>
                    {pendingVerificationCount}
                  </Badge>
                )}
              </a>
              <div className="sc-dropdown-separator" />
              {plugins.map((p) => {
                const isActive = p.id === active?.id;
                const meta = pluginTabMeta[p.id];
                return (
                  <a
                    key={p.id}
                    href={`?plugin=${p.id}`}
                    className={`sc-dropdown-item ${isActive ? 'active' : ''}`}
                    role="menuitem"
                  >
                    <span className="sc-dropdown-check">{isActive ? '\u2713' : ''}</span>
                    {meta?.statusColor && <StatusDot color={meta.statusColor} />}
                    {p.title}
                  </a>
                );
              })}
            </div>
          </div>
          <script dangerouslySetInnerHTML={{ __html: `(function(){
  var dd = document.getElementById('sc-mobile-dropdown');
  var trigger = document.getElementById('sc-dropdown-trigger');
  var content = document.getElementById('sc-dropdown-content');
  trigger.addEventListener('click', function(e) {
    e.stopPropagation();
    var open = dd.classList.toggle('open');
    trigger.setAttribute('aria-expanded', open);
  });
  document.addEventListener('click', function(e) {
    if (!dd.contains(e.target)) {
      dd.classList.remove('open');
      trigger.setAttribute('aria-expanded', 'false');
    }
  });
})();` }} />
        </div>
        <main className="sc-main">
          {activePage === 'verifications' ? (
            <VerificationsPage requests={verificationRequests ?? []} renderers={renderers} />
          ) : active ? (
            createElement(active.component)
          ) : (
            <NoPlugins />
          )}
        </main>
      </body>
    </html>
  );
}

function NoPlugins() {
  return (
    <div className="sc-section" style={{ color: '#8b8fa3' }}>
      <p>No plugins registered. Pass plugins to <code>startGatekeeper</code>.</p>
    </div>
  );
}
