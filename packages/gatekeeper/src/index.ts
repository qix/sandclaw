import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import { Hono } from 'hono';
import { serve } from '@hono/node-server';
import type { Knex } from 'knex';
import type { GatekeeperPlugin, GatekeeperHooks } from '@sandclaw/gatekeeper-plugin-api';
import { App } from './App';
import { createDb, runCoreMigrations } from './db';
import { logger } from './logger';

export interface GatekeeperOptions {
  /** Plugins to load into the gatekeeper. */
  plugins: GatekeeperPlugin[];
  /** Path to the SQLite database file. Parent directory is created if absent. */
  dbPath: string;
  /** TCP port to listen on. Defaults to 3000. */
  port?: number;
}

/**
 * Starts the Sandclaw Gatekeeper server.
 *
 * Steps:
 * 1. Run each plugin's `migrations` (when implemented)
 * 2. Register core REST API routes
 * 3. Register each plugin's `routes` on the Hono app
 * 4. Mount the React SSR handler and begin serving requests
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

  // 5. Form-action routes for the Verifications page (approve / reject with
  //    redirect back to the page).
  registerVerificationFormRoutes(app, db);

  // 6. SSR — render the React shell on every GET and use ?plugin= to track
  //    the active tab.  ?page=verifications shows the core verifications page.
  app.get('/*', async (c) => {
    const explicitPlugin = c.req.query('plugin');
    const page = c.req.query('page') ?? (explicitPlugin ? undefined : 'verifications');
    const activePluginId = explicitPlugin ?? plugins[0]?.id ?? '';

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
      createElement(App, { plugins, activePluginId, activePage: page, verificationRequests }),
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

function registerCoreRoutes(app: Hono, db: Knex): void {
  // --- Safe Queue (Muteworker) ---

  // GET /api/muteworker-queue/next — long-poll for the next pending job
  app.get('/api/muteworker-queue/next', async (c) => {
    const timeoutParam = c.req.query('timeout');
    const timeoutSec = Math.min(600, Math.max(1, parseInt(timeoutParam || '25', 10) || 25));
    const deadline = Date.now() + timeoutSec * 1000;
    const pollMs = 500;

    while (Date.now() < deadline) {
      const now = Date.now();
      const job = await db('safe_queue')
        .where('status', 'pending')
        .orderBy('id', 'asc')
        .first();

      if (job) {
        await db('safe_queue').where('id', job.id).update({ status: 'in_progress', updated_at: now });
        return c.json({
          job: {
            id: job.id,
            jobType: job.job_type,
            data: job.data,
            context: job.context ?? null,
            status: 'in_progress',
          },
        });
      }

      const remaining = deadline - Date.now();
      if (remaining <= 0) break;
      await new Promise((resolve) => setTimeout(resolve, Math.min(pollMs, remaining)));
    }

    return c.body(null, 204);
  });

  // POST /api/muteworker-queue/complete — mark a job as complete
  app.post('/api/muteworker-queue/complete', async (c) => {
    const body = await c.req.json<{ id: number }>();
    if (!body.id) return c.json({ error: 'id is required' }, 400);

    const updated = await db('safe_queue')
      .where('id', body.id)
      .update({ status: 'complete', updated_at: Date.now() });

    if (updated === 0) return c.json({ error: 'Job not found' }, 404);
    return c.json({ success: true });
  });

  // POST /api/muteworker-queue/add — add a new job to the safe queue
  app.post('/api/muteworker-queue/add', async (c) => {
    const body = await c.req.json<{ jobType: string; data: string; context?: string }>();
    if (!body.jobType) return c.json({ error: 'jobType is required' }, 400);
    if (body.data === undefined) return c.json({ error: 'data is required' }, 400);

    const now = Date.now();
    const [id] = await db('safe_queue').insert({
      job_type: body.jobType,
      data: typeof body.data === 'string' ? body.data : JSON.stringify(body.data),
      context: body.context ?? null,
      status: 'pending',
      created_at: now,
      updated_at: now,
    });

    const job = await db('safe_queue').where('id', id).first();
    return c.json({
      id: job.id,
      jobType: job.job_type,
      data: job.data,
      context: job.context ?? null,
      status: job.status,
    });
  });

  // --- Verifications ---

  // POST /api/verifications/reject/:id — reject a pending verification request
  app.post('/api/verifications/reject/:id', async (c) => {
    const id = parseInt(c.req.param('id'), 10);
    if (!id || isNaN(id)) return c.json({ error: 'Invalid id' }, 400);

    const request = await db('verification_requests').where('id', id).first();
    if (!request || request.status !== 'pending') {
      return c.json({ error: 'Not found or already resolved' }, 404);
    }

    await db('verification_requests')
      .where('id', id)
      .update({ status: 'rejected', updated_at: Date.now() });

    return c.json({ success: true });
  });

  // GET /api/verifications/pending — list all pending verification requests
  app.get('/api/verifications/pending', async (c) => {
    const requests = await db('verification_requests')
      .where('status', 'pending')
      .orderBy('created_at', 'desc');

    return c.json({
      requests: requests.map((r: any) => ({
        id: r.id,
        plugin: r.plugin,
        action: r.action,
        data: r.data,
        status: r.status,
        createdAt: r.created_at,
      })),
    });
  });

  // --- Confidante Queue ---

  // GET /api/confidante-queue/next — long-poll for the next pending confidante job
  app.get('/api/confidante-queue/next', async (c) => {
    const timeoutParam = c.req.query('timeout');
    const timeoutSec = Math.min(600, Math.max(1, parseInt(timeoutParam || '25', 10) || 25));
    const deadline = Date.now() + timeoutSec * 1000;
    const pollMs = 500;

    while (Date.now() < deadline) {
      const now = Date.now();
      const job = await db('confidante_queue')
        .where('status', 'pending')
        .orderBy('id', 'asc')
        .first();

      if (job) {
        await db('confidante_queue').where('id', job.id).update({ status: 'in_progress', updated_at: now });
        return c.json({
          job: {
            id: job.id,
            jobType: job.job_type,
            data: job.data,
            status: 'in_progress',
          },
        });
      }

      const remaining = deadline - Date.now();
      if (remaining <= 0) break;
      await new Promise((resolve) => setTimeout(resolve, Math.min(pollMs, remaining)));
    }

    return c.body(null, 204);
  });

  // POST /api/confidante-queue/complete — mark a confidante job as complete
  app.post('/api/confidante-queue/complete', async (c) => {
    const body = await c.req.json<{ id: number; result?: string }>();
    if (!body.id) return c.json({ error: 'id is required' }, 400);

    const updated = await db('confidante_queue')
      .where('id', body.id)
      .update({
        status: 'complete',
        result: body.result ?? null,
        updated_at: Date.now(),
      });

    if (updated === 0) return c.json({ error: 'Job not found' }, 404);
    return c.json({ success: true });
  });
}

function registerVerificationFormRoutes(app: Hono, db: Knex): void {
  // POST /verifications/approve/:id — forward to the plugin's approve endpoint, then redirect
  app.post('/verifications/approve/:id', async (c) => {
    const id = parseInt(c.req.param('id'), 10);
    if (!id || isNaN(id)) return c.redirect('/?page=verifications');

    const request = await db('verification_requests').where('id', id).first();
    if (!request || request.status !== 'pending') {
      return c.redirect('/?page=verifications');
    }

    // Try the plugin-specific approve endpoint (it may deliver the message, etc.)
    const pluginApproveUrl = `/api/${request.plugin}/approve/${id}`;
    const res = await app.request(pluginApproveUrl, { method: 'POST' });

    // If the plugin doesn't have an approve endpoint, fall back to a direct DB update
    if (res.status === 404) {
      await db('verification_requests')
        .where('id', id)
        .update({ status: 'approved', updated_at: Date.now() });
    }

    return c.redirect('/?page=verifications');
  });

  // POST /verifications/reject/:id — reject and redirect
  app.post('/verifications/reject/:id', async (c) => {
    const id = parseInt(c.req.param('id'), 10);
    if (!id || isNaN(id)) return c.redirect('/?page=verifications');

    await db('verification_requests')
      .where('id', id)
      .where('status', 'pending')
      .update({ status: 'rejected', updated_at: Date.now() });

    return c.redirect('/?page=verifications');
  });
}

// Re-export the plugin API type so consumers don't need to import it separately.
export type { GatekeeperPlugin } from '@sandclaw/gatekeeper-plugin-api';
