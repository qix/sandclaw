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
