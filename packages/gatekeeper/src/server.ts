import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import { Hono } from 'hono';
import { serve } from '@hono/node-server';
import type { Knex } from 'knex';
import type { GatekeeperPlugin, GatekeeperHooks, TabMeta } from '@sandclaw/gatekeeper-plugin-api';
import { App } from './pages/App';
import { createDb, runCoreMigrations } from './db';
import { logger } from './logger';
import { registerCoreRoutes, registerVerificationFormRoutes } from './routes';

export interface GatekeeperOptions {
  /** Plugins to load into the gatekeeper. */
  plugins: GatekeeperPlugin[];
  /** Path to the SQLite database file. Parent directory is created if absent. */
  dbPath: string;
  /** TCP port to listen on. Defaults to 3000. */
  port?: number;
}

export async function startGatekeeper(options: GatekeeperOptions): Promise<void> {
  const { plugins, dbPath, port = 3000 } = options;
  const app = new Hono();

  // Request logging middleware
  app.use('*', async (c, next) => {
    const start = Date.now();
    await next();
    const ms = Date.now() - start;
    logger.info({ method: c.req.method, path: c.req.path, status: c.res.status, ms }, 'request');
  });

  // 1. Initialise DB and run core + plugin migrations
  const db = createDb(dbPath);
  await runCoreMigrations(db);
  for (const plugin of plugins) {
    if (plugin.migrations) {
      await plugin.migrations(db);
    }
  }

  // 2. Plugin lifecycle: create services, run register + init
  const startHooks: Array<() => Promise<void>> = [];
  const stopHooks: Array<() => Promise<void>> = [];
  const hooksService: GatekeeperHooks = {
    register(hooks) {
      if (hooks['gatekeeper:start']) startHooks.push(async () => hooks['gatekeeper:start']!());
      if (hooks['gatekeeper:stop']) stopHooks.push(async () => hooks['gatekeeper:stop']!());
    },
  };

  const services = new Map<string, any>();
  services.set('core.db', db);
  services.set('core.hooks', hooksService);

  const initFns: Array<() => void | Promise<void>> = [];
  for (const plugin of plugins) {
    if (!plugin.registerGateway) {
      throw new Error(`Plugin "${plugin.id}" is missing required registerGateway method`);
    }
    plugin.registerGateway({
      registerInit({ deps, init }) {
        const resolved: Record<string, any> = {};
        for (const [key, ref] of Object.entries(deps)) {
          resolved[key] = services.get(ref.id);
        }
        initFns.push(() => init(resolved as any));
      },
    });
  }
  for (const fn of initFns) { await fn(); }

  // 3. Register core API routes
  registerCoreRoutes(app, db);

  // 4. Register plugin API routes under /api/<plugin-id>/
  for (const plugin of plugins) {
    if (plugin.routes) {
      const sub = new Hono();
      plugin.routes(sub, db);
      app.route(`/api/${plugin.id}`, sub);
    }
  }

  // 5. Form-action routes for the Verifications page
  registerVerificationFormRoutes(app, db);

  // 6. SSR — render the React shell on every GET
  app.get('/*', async (c) => {
    const explicitPlugin = c.req.query('plugin');
    const page = c.req.query('page') ?? (explicitPlugin ? undefined : 'verifications');
    const activePluginId = explicitPlugin ?? plugins[0]?.id ?? '';

    // Always fetch pending count for the sidebar badge
    const [{ count: pendingVerificationCount }] = await db('verification_requests')
      .where('status', 'pending')
      .count('* as count');

    // Collect tab meta from each plugin
    const pluginTabMeta: Record<string, TabMeta> = {};
    for (const plugin of plugins) {
      if (plugin.getTabMeta) {
        pluginTabMeta[plugin.id] = plugin.getTabMeta();
      }
    }

    let verificationRequests: any[] | undefined;
    if (page === 'verifications') {
      const rows = await db('verification_requests')
        .where('status', 'pending')
        .orderBy('created_at', 'desc');
      verificationRequests = rows.map((r: any) => ({
        id: r.id,
        plugin: r.plugin,
        action: r.action,
        data: r.data,
        status: r.status,
        createdAt: r.created_at,
      }));
    }

    const html = renderToString(
      createElement(App, {
        plugins,
        activePluginId,
        activePage: page,
        verificationRequests,
        pendingVerificationCount: Number(pendingVerificationCount),
        pluginTabMeta,
      }),
    );
    return c.html(`<!DOCTYPE html>${html}`);
  });

  serve({ fetch: app.fetch, port });
  logger.info({ port }, 'Gatekeeper listening');

  // Fire start hooks (after server is accepting connections)
  for (const fn of startHooks) { await fn(); }

  // Graceful shutdown
  const shutdown = async () => {
    for (const fn of stopHooks) { await fn(); }
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}
