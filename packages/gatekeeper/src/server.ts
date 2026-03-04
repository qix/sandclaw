import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import { Hono } from 'hono';
import { serve } from '@hono/node-server';
import type { Knex } from 'knex';
import type { GatekeeperPlugin, GatekeeperHooks, StatusColorValue, TabsService, RoutesService, VerificationRendererProps } from '@sandclaw/gatekeeper-plugin-api';
import type { ComponentType } from 'react';
import { App } from './pages/App';
import type { TabRenderData } from './pages/App';
import { createDb, runCoreMigrations } from './db';
import { logger } from './logger';
import { registerCoreRoutes, registerVerificationFormRoutes } from './routes';

/** Internal registration with the statusColor getter preserved for per-request evaluation. */
interface TabRegistrationInternal {
  tabKey: string;
  pluginId: string;
  tabName: string;
  component: ComponentType;
  statusColorFn?: () => StatusColorValue | undefined;
}

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

  // Collected tab registrations and route handlers from all plugins
  const tabRegistrations: TabRegistrationInternal[] = [];
  const allRouteHandlers: Array<{ pluginId: string; handler: (app: Hono) => void }> = [];

  // Collected verification renderers
  const renderers: Record<string, ComponentType<VerificationRendererProps>> = {};

  const services = new Map<string, any>();
  services.set('core.db', db);
  services.set('core.hooks', hooksService);

  const initFns: Array<() => void | Promise<void>> = [];
  for (const plugin of plugins) {
    if (!plugin.registerGateway) {
      throw new Error(`Plugin "${plugin.id}" is missing required registerGateway method`);
    }

    // Collect verification renderers
    if (plugin.verificationRenderer) {
      renderers[plugin.id] = plugin.verificationRenderer;
    }

    // Create per-plugin TabsService
    const pluginId = plugin.id;
    let tabCount = 0;
    const tabsService: TabsService = {
      registerTab(registration) {
        const tabKey = tabCount === 0 ? pluginId : `${pluginId}:${registration.tabName.toLowerCase().replace(/\s+/g, '-')}`;
        tabCount++;
        tabRegistrations.push({
          tabKey,
          pluginId,
          tabName: registration.tabName,
          component: registration.component,
          statusColorFn: registration.statusColor,
        });
      },
    };

    // Create per-plugin RoutesService
    const routesService: RoutesService = {
      registerRoutes(handler) {
        allRouteHandlers.push({ pluginId, handler });
      },
    };

    // Clone services map with per-plugin services
    const pluginServices = new Map(services);
    pluginServices.set('core.tabs', tabsService);
    pluginServices.set('core.routes', routesService);

    plugin.registerGateway({
      registerInit({ deps, init }) {
        const resolved: Record<string, any> = {};
        for (const [key, ref] of Object.entries(deps)) {
          resolved[key] = pluginServices.get(ref.id);
        }
        initFns.push(() => init(resolved as any));
      },
    });
  }
  for (const fn of initFns) { await fn(); }

  // 3. Register core API routes
  registerCoreRoutes(app, db);

  // 4. Mount plugin routes under /api/<pluginId>/
  for (const { pluginId, handler } of allRouteHandlers) {
    const sub = new Hono();
    handler(sub);
    app.route(`/api/${pluginId}`, sub);
  }

  // 5. Form-action routes for the Verifications page
  registerVerificationFormRoutes(app, db);

  // 6. SSR — render the React shell on every GET
  app.get('/*', async (c) => {
    const tabParam = c.req.query('tab');
    const pluginParam = c.req.query('plugin');
    const page = c.req.query('page') ?? (tabParam || pluginParam ? undefined : 'verifications');

    // Resolve active tab: ?tab= takes priority, ?plugin= as fallback (backward compat)
    let activeTabKey = tabParam ?? '';
    if (!activeTabKey && pluginParam) {
      const pluginTab = tabRegistrations.find((t) => t.pluginId === pluginParam);
      activeTabKey = pluginTab?.tabKey ?? '';
    }
    if (!activeTabKey && !page) {
      activeTabKey = tabRegistrations[0]?.tabKey ?? '';
    }

    // Always fetch pending count for the sidebar badge
    const [{ count: pendingVerificationCount }] = await db('verification_requests')
      .where('status', 'pending')
      .count('* as count');

    // Evaluate statusColor getters per-request for dynamic status
    const tabs: TabRenderData[] = tabRegistrations.map((reg) => ({
      tabKey: reg.tabKey,
      pluginId: reg.pluginId,
      tabName: reg.tabName,
      component: reg.component,
      statusColor: reg.statusColorFn?.(),
    }));

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
        tabs,
        activeTabKey,
        activePage: page,
        verificationRequests,
        pendingVerificationCount: Number(pendingVerificationCount),
        renderers,
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
