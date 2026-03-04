import React, { createElement } from 'react';
import type { StatusColorValue, VerificationRendererProps } from '@sandclaw/gatekeeper-plugin-api';
import { getGlobalStyles } from '@sandclaw/ui';
import { StatusDot } from '@sandclaw/ui';
import { Badge } from '@sandclaw/ui';
import { VerificationsPage, type VerificationRequest, type VerificationHistoryPage } from './VerificationsPage';
import type { ComponentType } from 'react';

export interface TabRenderData {
  tabKey: string;
  pluginId: string;
  tabName: string;
  component: ComponentType;
  statusColor?: StatusColorValue;
}

interface AppProps {
  tabs: TabRenderData[];
  activeTabKey: string;
  activePage?: string;
  verificationRequests?: VerificationRequest[];
  verificationHistory?: VerificationHistoryPage;
  pendingVerificationCount: number;
  renderers: Record<string, ComponentType<VerificationRendererProps>>;
}

export function App({
  tabs,
  activeTabKey,
  activePage,
  verificationRequests,
  verificationHistory,
  pendingVerificationCount,
  renderers,
}: AppProps) {
  const activeTab = activePage ? null : (tabs.find((t) => t.tabKey === activeTabKey) ?? tabs[0]);

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
            <StatusDot id="sc-sidebar-verification-dot" color="yellow" style={{ display: pendingVerificationCount > 0 ? undefined : 'none', marginLeft: '0.4rem' }} />
            <span id="sc-sidebar-verification-badge" style={{ display: pendingVerificationCount > 0 ? undefined : 'none' }}>
              <Badge bg="#ef4444" fg="#fff" style={{ marginLeft: '0.4rem', fontSize: '0.65rem' }}>
                <span id="sc-sidebar-verification-count">{pendingVerificationCount}</span>
              </Badge>
            </span>
          </a>
          <div className="sc-nav-divider" />
          {tabs.map((t) => (
            <a
              key={t.tabKey}
              href={`?tab=${t.tabKey}`}
              className={`sc-nav-link ${t.tabKey === activeTab?.tabKey ? 'active' : ''}`}
            >
              {t.statusColor && <StatusDot color={t.statusColor} />}
              {t.tabName}
            </a>
          ))}
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
                  : activeTab?.tabName ?? 'Select page'}
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
                <StatusDot id="sc-mobile-verification-dot" color="yellow" style={{ display: pendingVerificationCount > 0 ? undefined : 'none', marginLeft: '0.4rem' }} />
                <span id="sc-mobile-verification-badge" style={{ display: pendingVerificationCount > 0 ? undefined : 'none', marginLeft: 'auto' }}>
                  <Badge bg="#ef4444" fg="#fff" style={{ fontSize: '0.65rem' }}>
                    <span id="sc-mobile-verification-count">{pendingVerificationCount}</span>
                  </Badge>
                </span>
              </a>
              <div className="sc-dropdown-separator" />
              {tabs.map((t) => {
                const isActive = t.tabKey === activeTab?.tabKey;
                return (
                  <a
                    key={t.tabKey}
                    href={`?tab=${t.tabKey}`}
                    className={`sc-dropdown-item ${isActive ? 'active' : ''}`}
                    role="menuitem"
                  >
                    <span className="sc-dropdown-check">{isActive ? '\u2713' : ''}</span>
                    {t.statusColor && <StatusDot color={t.statusColor} />}
                    {t.tabName}
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
            <VerificationsPage requests={verificationRequests ?? []} history={verificationHistory} renderers={renderers} />
          ) : activeTab ? (
            createElement(activeTab.component)
          ) : (
            <NoPlugins />
          )}
        </main>
        <script dangerouslySetInnerHTML={{ __html: `(function(){
  var ids = {
    sidebarCount: 'sc-sidebar-verification-count',
    sidebarBadge: 'sc-sidebar-verification-badge',
    sidebarDot: 'sc-sidebar-verification-dot',
    mobileCount: 'sc-mobile-verification-count',
    mobileBadge: 'sc-mobile-verification-badge',
    mobileDot: 'sc-mobile-verification-dot'
  };
  function update(count) {
    var pairs = [
      [ids.sidebarCount, ids.sidebarBadge, ids.sidebarDot],
      [ids.mobileCount, ids.mobileBadge, ids.mobileDot]
    ];
    for (var i = 0; i < pairs.length; i++) {
      var countEl = document.getElementById(pairs[i][0]);
      var badgeEl = document.getElementById(pairs[i][1]);
      var dotEl = document.getElementById(pairs[i][2]);
      if (countEl) countEl.textContent = String(count);
      if (badgeEl) badgeEl.style.display = count > 0 ? '' : 'none';
      if (dotEl) dotEl.style.display = count > 0 ? '' : 'none';
    }
  }
  function connect() {
    var proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
    var ws = new WebSocket(proto + '//' + location.host + '/api/gatekeeper/ws');
    ws.onmessage = function(e) {
      try {
        var msg = JSON.parse(e.data);
        if (msg.type === 'verification_count') update(msg.count);
      } catch(err) {}
    };
    ws.onclose = function() { setTimeout(connect, 2000); };
  }
  connect();
})();` }} />
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
