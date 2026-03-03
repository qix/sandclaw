import React, { createElement } from 'react';
import type { GatekeeperPlugin } from '@sandclaw/gatekeeper-plugin-api';
import { VerificationsPage, type VerificationRequest } from './VerificationsPage';

interface AppProps {
  plugins: GatekeeperPlugin[];
  /** The `id` of the currently active plugin tab. */
  activePluginId: string;
  /** When set, a core page is active instead of a plugin tab. */
  activePage?: string;
  /** Pending verification requests (only populated when activePage === 'verifications'). */
  verificationRequests?: VerificationRequest[];
}

/**
 * Root Gatekeeper React application.
 *
 * Rendered server-side via `renderToString` for the initial page load.
 * Plugin switching uses plain server-side navigation (`?plugin=<id>`) so no
 * client-side JS bundle is needed for the minimal implementation.
 *
 * Future: replace with a full Vite SPA + client-side hydration.
 */
export function App({ plugins, activePluginId, activePage, verificationRequests }: AppProps) {
  const active = activePage ? null : (plugins.find((p) => p.id === activePluginId) ?? plugins[0]);

  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>Sandclaw Gatekeeper</title>
        <style
          dangerouslySetInnerHTML={{
            __html: `
              *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
              body { font-family: system-ui, sans-serif; display: flex; height: 100vh; background: #f9fafb; color: #111827; }
              nav { width: 220px; background: #1f2937; color: #f9fafb; display: flex; flex-direction: column; padding: 1rem 0; flex-shrink: 0; }
              nav .brand { font-weight: 700; font-size: 1.1rem; padding: 0.5rem 1.25rem 1.25rem; color: #f3f4f6; letter-spacing: 0.05em; }
              nav .brand span { color: #6366f1; }
              nav a { display: block; padding: 0.6rem 1.25rem; color: #9ca3af; text-decoration: none; font-size: 0.9rem; border-left: 3px solid transparent; }
              nav a:hover { color: #f9fafb; background: #374151; }
              nav a.active { color: #f9fafb; border-left-color: #6366f1; background: #374151; }
              main { flex: 1; overflow-y: auto; }
            `,
          }}
        />
      </head>
      <body>
        <nav>
          <div className="brand">
            Sand<span>Claw</span>
          </div>
          <a
            href="?page=verifications"
            className={activePage === 'verifications' ? 'active' : undefined}
          >
            Verifications
          </a>
          <div style={{ borderTop: '1px solid #374151', margin: '0.5rem 1rem' }} />
          {plugins.map((p) => (
            <a
              key={p.id}
              href={`?plugin=${p.id}`}
              className={p.id === active?.id ? 'active' : undefined}
            >
              {p.title}
            </a>
          ))}
        </nav>
        <main>
          {activePage === 'verifications' ? (
            <VerificationsPage requests={verificationRequests ?? []} />
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
    <div style={{ padding: '2rem', color: '#6b7280' }}>
      <p>No plugins registered. Pass plugins to <code>startGatekeeper</code>.</p>
    </div>
  );
}
