import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import { Hono } from 'hono';
import { serve } from '@hono/node-server';
import type { GatekeeperPlugin } from '@sandclaw/gatekeeper-plugin-api';
import { App } from './App';

export interface GatekeeperOptions {
  /** Plugins to load into the gatekeeper. */
  plugins: GatekeeperPlugin[];
  /** TCP port to listen on. Defaults to 3000. */
  port?: number;
}

/**
 * Starts the Sandclaw Gatekeeper server.
 *
 * Steps:
 * 1. Run each plugin's `migrations` (when implemented)
 * 2. Register each plugin's `routes` on the Hono app
 * 3. Mount the React SSR handler and begin serving requests
 *
 * @example
 * ```ts
 * import { startGatekeeper } from '@sandclaw/gatekeeper';
 * import { whatsappPlugin } from '@sandclaw/whatsapp-plugin';
 *
 * startGatekeeper({ plugins: [whatsappPlugin], port: 3000 });
 * ```
 */
export async function startGatekeeper(options: GatekeeperOptions): Promise<void> {
  const { plugins, port = 3000 } = options;
  const app = new Hono();

  // 1. Run plugin migrations (db setup deferred to full implementation)
  for (const plugin of plugins) {
    if (plugin.migrations) {
      // TODO: pass a Knex instance once DB is wired up
      // await plugin.migrations(knex);
    }
  }

  // 2. Register plugin API routes under /api/<plugin-id>/
  for (const plugin of plugins) {
    if (plugin.routes) {
      const sub = new Hono();
      plugin.routes(sub);
      app.route(`/api/${plugin.id}`, sub);
    }
  }

  // 3. SSR — render the React shell on every GET and use ?plugin= to track
  //    the active tab.  A full Vite SPA with client-side hydration replaces
  //    this in the complete implementation.
  app.get('/*', (c) => {
    const activePluginId = c.req.query('plugin') ?? plugins[0]?.id ?? '';
    const html = renderToString(
      createElement(App, { plugins, activePluginId }),
    );
    return c.html(`<!DOCTYPE html>${html}`);
  });

  serve({ fetch: app.fetch, port });
  console.log(`Gatekeeper listening on http://localhost:${port}`);
}

// Re-export the plugin API type so consumers don't need to import it separately.
export type { GatekeeperPlugin } from '@sandclaw/gatekeeper-plugin-api';
