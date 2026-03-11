import React, { createElement } from "react";
import { renderToString } from "react-dom/server";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Hono } from "hono";
import { serve } from "@hono/node-server";
import type { Knex } from "knex";
import type {
  GatekeeperPlugin,
  GatekeeperHooks,
  ComponentsService,
  RoutesService,
  WebSocketService,
  NotifyService,
  VerificationRendererProps,
} from "@sandclaw/gatekeeper-plugin-api";
import type { ComponentType } from "react";
import { WebSocketServer, WebSocket } from "ws";
import { App } from "./pages/App";
import type { VerificationHistoryPage } from "./pages/VerificationsPage";
import { createDb, runCoreMigrations } from "./db";
import { logger } from "./logger";
import { registerCoreRoutes, registerVerificationFormRoutes } from "./routes";

export interface GatekeeperConfig {
  /** External url */
  gatekeeperExternalUrl: string;
  /** Path to the SQLite database file. Parent directory is created if absent. */
  dbPath: string;
  /** TCP port to listen on. Defaults to 3000. */
  gatekeeperPort?: number;
  /** Host/IP to bind to. Defaults to "127.0.0.1". */
  gatekeeperHost?: string;
}

export interface GatekeeperOptions {
  /** Plugins to load into the gatekeeper. */
  plugins: GatekeeperPlugin[];
  /** Config overrides (merged with defaults). */
  config: GatekeeperConfig;
}

export async function startGatekeeper(
  options: GatekeeperOptions,
): Promise<void> {
  const { plugins, config } = options;
  const {
    dbPath,
    gatekeeperPort = 3000,
    gatekeeperHost = "127.0.0.1",
  } = config;
  const app = new Hono();

  // Request logging middleware
  app.use("*", async (c, next) => {
    const start = Date.now();
    await next();
    const ms = Date.now() - start;
    logger.info(
      { method: c.req.method, path: c.req.path, status: c.res.status, ms },
      "request",
    );
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
      if (hooks["gatekeeper:start"])
        startHooks.push(async () => hooks["gatekeeper:start"]!());
      if (hooks["gatekeeper:stop"])
        stopHooks.push(async () => hooks["gatekeeper:stop"]!());
    },
  };

  // Component registry: maps names like "tabs:channels", "tabs:primary", "page:whatsapp" to components
  const componentRegistry = new Map<string, ComponentType<any>[]>();
  const componentsService: ComponentsService = {
    register(name, component) {
      let list = componentRegistry.get(name);
      if (!list) {
        list = [];
        componentRegistry.set(name, list);
      }
      list.push(component);
    },
  };

  // Collected route handlers from all plugins
  const allRouteHandlers: Array<{
    pluginId: string;
    handler: (app: Hono) => void;
  }> = [];

  // Collected verification renderers
  const renderers: Record<
    string,
    ComponentType<VerificationRendererProps>
  > = {};

  // WebSocket upgrade handlers collected from plugins
  const wsUpgradeHandlers = new Map<
    string,
    (req: any, socket: any, head: Buffer) => void
  >();
  const wsService: WebSocketService = {
    onUpgrade(path, handler) {
      wsUpgradeHandlers.set(path, handler);
    },
  };

  const services = new Map<string, any>();
  services.set("core.db", db);
  services.set("core.hooks", hooksService);
  services.set("core.components", componentsService);
  services.set("core.ws", wsService);

  const initFns: Array<() => void | Promise<void>> = [];
  for (const plugin of plugins) {
    if (!plugin.registerGateway) {
      throw new Error(
        `Plugin "${plugin.id}" is missing required registerGateway method`,
      );
    }

    // Collect verification renderers
    if (plugin.verificationRenderer) {
      renderers[plugin.id] = plugin.verificationRenderer;
    }

    // Create per-plugin RoutesService
    const pluginId = plugin.id;
    const routesService: RoutesService = {
      registerRoutes(handler) {
        allRouteHandlers.push({ pluginId, handler });
      },
    };

    // Clone services map with per-plugin routes service
    const pluginServices = new Map(services);
    pluginServices.set("core.routes", routesService);

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
  for (const fn of initFns) {
    await fn();
  }

  // 3. Core WebSocket for real-time verification count
  const coreWss = new WebSocketServer({ noServer: true });
  const coreClients = new Set<WebSocket>();
  let lastBroadcastCount = -1;

  async function broadcastVerificationCount() {
    const [{ count }] = await db("verification_requests")
      .where("status", "pending")
      .count("* as count");
    const n = Number(count);
    if (n === lastBroadcastCount) return;
    lastBroadcastCount = n;
    const msg = JSON.stringify({ type: "verification_count", count: n });
    for (const client of coreClients) {
      if (client.readyState === WebSocket.OPEN) client.send(msg);
    }
  }

  function notifyVerificationChange() {
    broadcastVerificationCount();
  }

  // Chat unread count broadcasting
  let lastBroadcastChatUnread = -1;

  async function broadcastChatUnreadCount() {
    const kvRow = await db("plugin_kv")
      .where({ plugin: "chat", key: "last_read_message_id" })
      .first();
    const lastReadId = kvRow ? Number(kvRow.value) : 0;

    const convRow = await db("conversations")
      .where({ plugin: "chat", channel: "chat", external_id: "operator" })
      .first();

    let n = 0;
    if (convRow) {
      const [{ count }] = await db("conversation_message")
        .where("conversation_id", convRow.id)
        .where("id", ">", lastReadId)
        .count("* as count");
      n = Number(count);
    }

    if (n === lastBroadcastChatUnread) return;
    lastBroadcastChatUnread = n;
    const msg = JSON.stringify({ type: "chat_unread_count", count: n });
    for (const client of coreClients) {
      if (client.readyState === WebSocket.OPEN) client.send(msg);
    }
  }

  const notifyService: NotifyService = {
    notifyCountChange() {
      broadcastChatUnreadCount();
    },
  };
  services.set("core.notify", notifyService);

  // Poll every 2s to detect plugin-side inserts without requiring plugin changes
  setInterval(() => {
    if (coreClients.size > 0) {
      broadcastVerificationCount();
      broadcastChatUnreadCount();
    }
  }, 2000);

  // 3b. Register core API routes
  registerCoreRoutes(app, db, notifyVerificationChange);

  // 4. Mount plugin routes under /api/<pluginId>/
  for (const { pluginId, handler } of allRouteHandlers) {
    const sub = new Hono();
    handler(sub);
    app.route(`/api/${pluginId}`, sub);
  }

  // 5. Form-action routes for the Verifications page
  registerVerificationFormRoutes(app, db, notifyVerificationChange);

  // 6. Favicon
  const faviconPath = resolve(
    dirname(fileURLToPath(import.meta.url)),
    "../../../assets/favicon.svg",
  );
  const faviconSvg = readFileSync(faviconPath, "utf-8");
  app.get("/favicon.svg", (c) => {
    return c.body(faviconSvg, {
      headers: {
        "Content-Type": "image/svg+xml",
        "Cache-Control": "public, max-age=86400",
      },
    });
  });
  app.get("/favicon.ico", (c) => c.redirect("/favicon.svg", 301));

  // 7. SSR — render the React shell on every GET
  app.get("/*", async (c) => {
    const activePage = c.req.query("page") ?? "verifications";

    // Always fetch pending count for the sidebar badge
    const [{ count: pendingVerificationCount }] = await db(
      "verification_requests",
    )
      .where("status", "pending")
      .count("* as count");

    // Tab component arrays (rendered directly by App via context)
    const channelTabs = componentRegistry.get("tabs:channels") ?? [];
    const primaryTabs = componentRegistry.get("tabs:primary") ?? [];

    // Resolve page component (if not the built-in verifications page)
    let pageComponent: ComponentType | undefined;
    let pageNotFound = false;

    let verificationRequests: any[] | undefined;
    let verificationHistory: VerificationHistoryPage | undefined;
    if (activePage === "verifications") {
      const rows = await db("verification_requests")
        .where("status", "pending")
        .orderBy("created_at", "desc");
      verificationRequests = rows.map((r: any) => ({
        id: r.id,
        plugin: r.plugin,
        action: r.action,
        data: r.data,
        status: r.status,
        createdAt: r.created_at,
      }));

      // Fetch resolved verifications history with pagination
      const historyPageParam = parseInt(c.req.query("historyPage") || "1", 10);
      const historyPage = Math.max(
        1,
        isNaN(historyPageParam) ? 1 : historyPageParam,
      );
      const historyLimit = 20;
      const historyOffset = (historyPage - 1) * historyLimit;

      const [{ count: totalResolved }] = await db("verification_requests")
        .whereIn("status", ["approved", "rejected"])
        .count("* as count");

      const total = Number(totalResolved);
      if (total > 0) {
        const historyRows = await db("verification_requests")
          .whereIn("status", ["approved", "rejected"])
          .orderBy("updated_at", "desc")
          .limit(historyLimit)
          .offset(historyOffset);

        verificationHistory = {
          requests: historyRows.map((r: any) => ({
            id: r.id,
            plugin: r.plugin,
            action: r.action,
            data: r.data,
            status: r.status,
            createdAt: r.created_at,
            updatedAt: r.updated_at,
          })),
          page: historyPage,
          totalPages: Math.ceil(total / historyLimit),
          total,
        };
      }
    } else {
      const components = componentRegistry.get(`page:${activePage}`);
      if (components?.[0]) {
        pageComponent = components[0];
      } else {
        pageNotFound = true;
      }
    }

    // Build App element, then wrap in registered context providers
    let element: React.ReactElement = createElement(App, {
      channelTabs,
      primaryTabs,
      activePage,
      pageComponent,
      pageNotFound,
      verificationRequests,
      verificationHistory,
      pendingVerificationCount: Number(pendingVerificationCount),
      renderers,
    });
    for (const Provider of componentRegistry.get("provider") ?? []) {
      element = createElement(Provider, null, element);
    }

    const html = renderToString(element);
    return c.html(`<!DOCTYPE html>${html}`);
  });

  const server = serve({
    fetch: app.fetch,
    port: gatekeeperPort,
    hostname: gatekeeperHost,
  });

  const cyan = "\x1b[36m";
  const yellow = "\x1b[33m";
  const white = "\x1b[37m";
  const whiteBright = "\x1b[97m";
  const bold = "\x1b[1m";
  const dim = "\x1b[2m";
  const reset = "\x1b[0m";

  const externalUrl =
    config.gatekeeperExternalUrl || `http://localhost:${gatekeeperPort}`;

  const logoLines = [
    "╔══╗     /\\_/\\     ╔══╗",
    "║  ║    ( o.o )    ║  ║",
    "║  ╠════╡ > < ╞════╣  ║",
    "║  ║     \\_^_/     ║  ║",
    "╚══╝               ╚══╝",
  ];
  const infoLines = [
    `${bold}${whiteBright}Sand${cyan}claw ${white}Gatekeeper${reset}`,
    "",
    `${dim}Listening on ${gatekeeperHost}:${gatekeeperPort}${reset}`,
    `${white}${externalUrl}${reset}`,
    "",
  ];

  const stripAnsi = (s: string) => s.replace(/\x1b\[[0-9;]*m/g, "");

  const logoWidth = 23;
  const gap = "    ";
  const gapWidth = gap.length;
  const pad = 2;
  const infoWidth = Math.max(...infoLines.map((l) => stripAnsi(l).length));
  const innerWidth = pad + logoWidth + gapWidth + infoWidth + pad;

  const top = `${dim}╭${"─".repeat(innerWidth)}╮${reset}`;
  const bot = `${dim}╰${"─".repeat(innerWidth)}╯${reset}`;
  const empty = `${dim}│${reset}${" ".repeat(innerWidth)}${dim}│${reset}`;

  const rows = logoLines.map((logo, i) => {
    const info = infoLines[i] ?? "";
    const infoPad = " ".repeat(infoWidth - stripAnsi(info).length);
    return `${dim}│${reset}${" ".repeat(pad)}${bold}${cyan}${logo}${reset}${gap}${info}${infoPad}${" ".repeat(pad)}${dim}│${reset}`;
  });

  console.log([top, empty, ...rows, empty, bot].join("\n"));

  // Attach WebSocket upgrade dispatcher (always — core WS is always available)
  (server as any).on("upgrade", (req: any, socket: any, head: Buffer) => {
    const url = new URL(req.url!, `http://${req.headers.host}`);

    // Core gatekeeper WebSocket for verification count
    if (url.pathname === "/api/gatekeeper/ws") {
      coreWss.handleUpgrade(req, socket, head, async (ws) => {
        coreClients.add(ws);
        // Query and send current count immediately on connect
        const [{ count }] = await db("verification_requests")
          .where("status", "pending")
          .count("* as count");
        const n = Number(count);
        lastBroadcastCount = n;
        ws.send(JSON.stringify({ type: "verification_count", count: n }));

        // Send initial chat unread count
        const kvRow = await db("plugin_kv")
          .where({ plugin: "chat", key: "last_read_message_id" })
          .first();
        const lastReadId = kvRow ? Number(kvRow.value) : 0;
        const convRow = await db("conversations")
          .where({ plugin: "chat", channel: "chat", external_id: "operator" })
          .first();
        let chatUnread = 0;
        if (convRow) {
          const [{ count: uc }] = await db("conversation_message")
            .where("conversation_id", convRow.id)
            .where("id", ">", lastReadId)
            .count("* as count");
          chatUnread = Number(uc);
        }
        lastBroadcastChatUnread = chatUnread;
        ws.send(JSON.stringify({ type: "chat_unread_count", count: chatUnread }));

        ws.on("close", () => coreClients.delete(ws));
      });
      return;
    }

    // Plugin WebSocket handlers
    const handler = wsUpgradeHandlers.get(url.pathname);
    if (handler) {
      handler(req, socket, head);
    } else {
      socket.destroy();
    }
  });

  // Fire start hooks (after server is accepting connections)
  for (const fn of startHooks) {
    await fn();
  }

  // Graceful shutdown
  const shutdown = async () => {
    for (const fn of stopHooks) {
      await fn();
    }
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}
