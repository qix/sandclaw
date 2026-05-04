import { localTimestamp } from "@sandclaw/util";
import {
  httpState,
  isAllowed,
  loadHttpState,
  pushRequest,
  reloadAllowList,
  type HttpRequestRow,
} from "./state";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Knex = any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Hono = any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type WebSocketService = any;

const ALLOWED_METHODS = new Set([
  "GET",
  "HEAD",
  "POST",
  "PUT",
  "PATCH",
  "DELETE",
  "OPTIONS",
]);

const MAX_RESPONSE_BYTES = 256 * 1024;

function normalizeMethod(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const upper = value.trim().toUpperCase();
  return ALLOWED_METHODS.has(upper) ? upper : null;
}

function parseUrl(value: unknown): URL | null {
  if (typeof value !== "string") return null;
  try {
    const u = new URL(value);
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    return u;
  } catch {
    return null;
  }
}

function broadcastUpdate(ws: WebSocketService): void {
  ws.broadcast({ type: "http:update" });
}

export function registerHttpRoutes(
  app: Hono,
  db: Knex,
  ws: WebSocketService,
): void {
  // Muteworker entry point — execute (or block) an HTTP request.
  app.post("/request", async (c: any) => {
    const body = await c.req.json().catch(() => ({}));
    const method = normalizeMethod(body.method);
    const parsed = parseUrl(body.url);
    if (!method) {
      return c.json({ error: "Invalid or missing 'method'" }, 400);
    }
    if (!parsed) {
      return c.json({ error: "Invalid or missing 'url'" }, 400);
    }

    const url = parsed.toString();
    const domain = parsed.hostname.toLowerCase();
    const jobId =
      body.jobContext && typeof body.jobContext.jobId === "number"
        ? body.jobContext.jobId
        : null;

    if (!isAllowed(method, domain)) {
      const row = await recordRequest(db, {
        jobId,
        method,
        url,
        domain,
        outcome: "blocked",
        statusCode: null,
        responseBytes: null,
        error: null,
      });
      broadcastUpdate(ws);
      return c.json(
        {
          allowed: false,
          method,
          domain,
          requestId: row.id,
          message: `Request blocked. Operator must allow ${method} on ${domain} from the HTTP page.`,
        },
        403,
      );
    }

    const requestHeaders: Record<string, string> = {};
    if (body.headers && typeof body.headers === "object") {
      for (const [key, value] of Object.entries(body.headers)) {
        if (typeof value === "string") requestHeaders[key] = value;
      }
    }

    let requestBody: BodyInit | undefined;
    if (
      method !== "GET" &&
      method !== "HEAD" &&
      typeof body.body === "string"
    ) {
      requestBody = body.body;
    }

    try {
      const response = await fetch(url, {
        method,
        headers: requestHeaders,
        body: requestBody,
      });

      const buf = await response.arrayBuffer();
      const totalBytes = buf.byteLength;
      const truncated = totalBytes > MAX_RESPONSE_BYTES;
      const slice = truncated ? buf.slice(0, MAX_RESPONSE_BYTES) : buf;
      const text = new TextDecoder("utf-8", { fatal: false }).decode(slice);

      const responseHeaders: Record<string, string> = {};
      response.headers.forEach((v, k) => {
        responseHeaders[k] = v;
      });

      const row = await recordRequest(db, {
        jobId,
        method,
        url,
        domain,
        outcome: "allowed",
        statusCode: response.status,
        responseBytes: totalBytes,
        error: null,
      });
      broadcastUpdate(ws);

      return c.json({
        allowed: true,
        method,
        url,
        domain,
        requestId: row.id,
        status: response.status,
        statusText: response.statusText,
        headers: responseHeaders,
        body: text,
        bodyBytes: totalBytes,
        truncated,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const row = await recordRequest(db, {
        jobId,
        method,
        url,
        domain,
        outcome: "error",
        statusCode: null,
        responseBytes: null,
        error: message,
      });
      broadcastUpdate(ws);
      return c.json(
        {
          allowed: true,
          method,
          domain,
          requestId: row.id,
          error: message,
        },
        502,
      );
    }
  });

  // Recent requests + allow list snapshot for the UI to refresh from.
  app.get("/state", async (c: any) => {
    return c.json({
      recent: httpState.recent,
      allowList: httpState.allowList,
    });
  });

  app.post("/allow", async (c: any) => {
    const body = await c.req.json().catch(() => ({}));
    const method = normalizeMethod(body.method);
    const domain =
      typeof body.domain === "string" ? body.domain.trim().toLowerCase() : "";
    if (!method) return c.json({ error: "Invalid 'method'" }, 400);
    if (!domain) return c.json({ error: "Invalid 'domain'" }, 400);

    const existing = await db("http_allow_list")
      .where({ method, domain })
      .first();
    if (!existing) {
      await db("http_allow_list").insert({
        method,
        domain,
        created_at: localTimestamp(),
      });
    }

    await reloadAllowList(db);
    broadcastUpdate(ws);
    return c.json({ ok: true, method, domain });
  });

  app.post("/revoke", async (c: any) => {
    const body = await c.req.json().catch(() => ({}));
    const method = normalizeMethod(body.method);
    const domain =
      typeof body.domain === "string" ? body.domain.trim().toLowerCase() : "";
    if (!method) return c.json({ error: "Invalid 'method'" }, 400);
    if (!domain) return c.json({ error: "Invalid 'domain'" }, 400);

    await db("http_allow_list").where({ method, domain }).delete();
    await reloadAllowList(db);
    broadcastUpdate(ws);
    return c.json({ ok: true, method, domain });
  });
}

interface InsertRequestArgs {
  jobId: number | null;
  method: string;
  url: string;
  domain: string;
  outcome: "allowed" | "blocked" | "error";
  statusCode: number | null;
  responseBytes: number | null;
  error: string | null;
}

async function recordRequest(
  db: Knex,
  args: InsertRequestArgs,
): Promise<HttpRequestRow> {
  const createdAt = localTimestamp();
  const [{ id }] = await db("http_requests")
    .insert({
      job_id: args.jobId,
      method: args.method,
      url: args.url,
      domain: args.domain,
      outcome: args.outcome,
      status_code: args.statusCode,
      response_bytes: args.responseBytes,
      error: args.error,
      created_at: createdAt,
    })
    .returning("id");

  const row: HttpRequestRow = {
    id,
    jobId: args.jobId,
    method: args.method,
    url: args.url,
    domain: args.domain,
    outcome: args.outcome,
    statusCode: args.statusCode,
    responseBytes: args.responseBytes,
    error: args.error,
    createdAt,
  };
  pushRequest(row);
  return row;
}

export { loadHttpState };
