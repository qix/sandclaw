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

interface PreparedRequest {
  method: string;
  url: string;
  domain: string;
  jobId: number | null;
  requestHeaders: Record<string, string>;
  requestBody: string | undefined;
}

interface PreparedError {
  status: number;
  payload: Record<string, unknown>;
  blockedRow?: HttpRequestRow;
}

async function prepareAndAuthorize(
  db: Knex,
  ws: WebSocketService,
  body: any,
): Promise<{ ok: true; data: PreparedRequest } | { ok: false; error: PreparedError }> {
  const method = normalizeMethod(body.method);
  const parsed = parseUrl(body.url);
  if (!method) {
    return {
      ok: false,
      error: { status: 400, payload: { error: "Invalid or missing 'method'" } },
    };
  }
  if (!parsed) {
    return {
      ok: false,
      error: { status: 400, payload: { error: "Invalid or missing 'url'" } },
    };
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
    return {
      ok: false,
      error: {
        status: 403,
        payload: {
          allowed: false,
          method,
          domain,
          requestId: row.id,
          message: `Request blocked. Operator must allow ${method} on ${domain} from the HTTP page.`,
        },
        blockedRow: row,
      },
    };
  }

  const requestHeaders: Record<string, string> = {};
  if (body.headers && typeof body.headers === "object") {
    for (const [key, value] of Object.entries(body.headers)) {
      if (typeof value === "string") requestHeaders[key] = value;
    }
  }

  const requestBody =
    method !== "GET" && method !== "HEAD" && typeof body.body === "string"
      ? body.body
      : undefined;

  return {
    ok: true,
    data: { method, url, domain, jobId, requestHeaders, requestBody },
  };
}

export function registerHttpRoutes(
  app: Hono,
  db: Knex,
  ws: WebSocketService,
): void {
  // Muteworker entry point — execute (or block) an HTTP request and return the
  // body inline (truncated to MAX_RESPONSE_BYTES).
  app.post("/request", async (c: any) => {
    const body = await c.req.json().catch(() => ({}));
    const prep = await prepareAndAuthorize(db, ws, body);
    if (!prep.ok) {
      return c.json(prep.error.payload, prep.error.status);
    }
    const { method, url, domain, jobId, requestHeaders, requestBody } =
      prep.data;

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

  // Streaming download — same auth/allow-list as /request, but pipes the raw
  // upstream body back to the caller and returns metadata in custom response
  // headers. Used by the muteworker tool when output_path is set.
  app.post("/download", async (c: any) => {
    const body = await c.req.json().catch(() => ({}));
    const prep = await prepareAndAuthorize(db, ws, body);
    if (!prep.ok) {
      return c.json(prep.error.payload, prep.error.status);
    }
    const { method, url, domain, jobId, requestHeaders, requestBody } =
      prep.data;

    let response: Response;
    try {
      response = await fetch(url, {
        method,
        headers: requestHeaders,
        body: requestBody,
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

    // Reserve a request id up front so the caller knows it before the stream
    // finishes. We update bytes/error after the stream completes.
    const placeholder = await recordRequest(db, {
      jobId,
      method,
      url,
      domain,
      outcome: "allowed",
      statusCode: response.status,
      responseBytes: null,
      error: null,
    });
    broadcastUpdate(ws);

    const responseHeaders: Record<string, string> = {};
    response.headers.forEach((v, k) => {
      responseHeaders[k] = v;
    });

    const upstreamBody = response.body;
    if (!upstreamBody) {
      await db("http_requests")
        .where({ id: placeholder.id })
        .update({ response_bytes: 0 });
      return c.body(new Uint8Array(0), 200, {
        "X-Http-Status": String(response.status),
        "X-Http-Status-Text": response.statusText,
        "X-Http-Url": url,
        "X-Http-Method": method,
        "X-Http-Domain": domain,
        "X-Http-Request-Id": String(placeholder.id),
        "X-Http-Headers": safeJsonHeader(responseHeaders),
      });
    }

    let bytes = 0;
    const counted = new ReadableStream({
      async start(controller) {
        const reader = upstreamBody.getReader();
        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            if (value) {
              bytes += value.byteLength;
              controller.enqueue(value);
            }
          }
          controller.close();
          await db("http_requests")
            .where({ id: placeholder.id })
            .update({ response_bytes: bytes });
          broadcastUpdate(ws);
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          controller.error(err);
          await db("http_requests")
            .where({ id: placeholder.id })
            .update({
              outcome: "error",
              response_bytes: bytes,
              error: message,
            });
          broadcastUpdate(ws);
        }
      },
      cancel(reason) {
        upstreamBody.cancel(reason).catch(() => {});
      },
    });

    return c.body(counted, 200, {
      "Content-Type":
        responseHeaders["content-type"] ?? "application/octet-stream",
      "X-Http-Status": String(response.status),
      "X-Http-Status-Text": response.statusText,
      "X-Http-Url": url,
      "X-Http-Method": method,
      "X-Http-Domain": domain,
      "X-Http-Request-Id": String(placeholder.id),
      "X-Http-Headers": safeJsonHeader(responseHeaders),
    });
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

// HTTP header values can't contain newlines or non-ASCII reliably; encode
// the upstream headers as an ASCII-safe JSON string for the X-Http-Headers
// custom header.
function safeJsonHeader(value: unknown): string {
  return JSON.stringify(value).replace(/[^ -~]/g, (ch) =>
    "\\u" + ch.charCodeAt(0).toString(16).padStart(4, "0"),
  );
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
