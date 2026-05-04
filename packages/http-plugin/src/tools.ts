import { createWriteStream } from "node:fs";
import { mkdir, open, stat } from "node:fs/promises";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import path from "node:path";
import type { MuteworkerPluginContext } from "@sandclaw/muteworker-plugin-api";

const ALLOWED_METHODS = [
  "GET",
  "HEAD",
  "POST",
  "PUT",
  "PATCH",
  "DELETE",
  "OPTIONS",
] as const;

const RESPONSE_PREVIEW_CHARS = 8 * 1024;
const FILE_PREVIEW_BYTES = 1024;

interface HttpResponseSuccess {
  allowed: true;
  method: string;
  url: string;
  domain: string;
  requestId: number;
  status: number;
  statusText: string;
  headers: Record<string, string>;
  body: string;
  bodyBytes: number;
  truncated: boolean;
}

interface HttpResponseFetchError {
  allowed: true;
  method: string;
  domain: string;
  requestId: number;
  error: string;
}

interface HttpResponseBlocked {
  allowed: false;
  method: string;
  domain: string;
  requestId: number;
  message: string;
}

export function createHttpRequestTool(ctx: MuteworkerPluginContext) {
  return {
    name: "http_request",
    label: "HTTP Request",
    description: [
      "Issue an HTTP request via the gatekeeper.",
      "All hosts are blocked by default; the operator must explicitly allow each",
      "(method, domain) pair from the HTTP page in the gatekeeper UI before the",
      "request will be executed. A blocked request is recorded so the operator",
      "can review and approve it.",
      "For large or binary responses (e.g. RSS feeds), pass output_path to stream",
      "the body to a local file instead of returning it inline; then inspect the",
      "file with shell tools (xmlstarlet, xmllint, jq, head, grep, ripgrep).",
    ].join(" "),
    parameters: {
      type: "object",
      properties: {
        method: {
          type: "string",
          enum: [...ALLOWED_METHODS],
          description: "HTTP method (GET, POST, ...).",
        },
        url: {
          type: "string",
          description: "Absolute http(s) URL to request.",
        },
        headers: {
          type: "object",
          description: "Optional request headers as a string→string map.",
          additionalProperties: { type: "string" },
        },
        body: {
          type: "string",
          description:
            "Optional request body, sent verbatim. Set the content-type header explicitly (e.g. 'application/json') and JSON-encode the value yourself if needed.",
        },
        output_path: {
          type: "string",
          description:
            "Optional absolute path on the muteworker filesystem to stream the response body into. When set, the body is NOT returned inline — only metadata (status, headers, file path, byte size, head preview) is returned. Use this for RSS, large JSON, or other large responses, then inspect the file with shell tools (xmlstarlet, xmllint, head, grep, jq).",
        },
      },
      required: ["method", "url"],
      additionalProperties: false,
    } as any,
    execute: async (_toolCallId: string, params: any) => {
      const method =
        typeof params.method === "string"
          ? params.method.trim().toUpperCase()
          : "";
      if (!method || !ALLOWED_METHODS.includes(method as any)) {
        throw new Error(
          `method must be one of ${ALLOWED_METHODS.join(", ")}`,
        );
      }
      const url = typeof params.url === "string" ? params.url.trim() : "";
      if (!url) throw new Error("url is required");

      const outputPath =
        typeof params.output_path === "string" && params.output_path.trim()
          ? params.output_path.trim()
          : null;
      if (outputPath && !path.isAbsolute(outputPath)) {
        throw new Error("output_path must be an absolute path");
      }

      const payload: Record<string, unknown> = {
        method,
        url,
        jobContext: { worker: "muteworker", jobId: ctx.job.id },
      };
      if (params.headers && typeof params.headers === "object") {
        payload.headers = params.headers;
      }
      if (params.body !== undefined) {
        payload.body = params.body;
      }

      ctx.artifacts.push({
        type: "text",
        label: outputPath ? "HTTP Download" : "HTTP Request",
        value: `${method} ${url}${outputPath ? ` → ${outputPath}` : ""}`,
      });

      if (outputPath) {
        return executeDownload(ctx, payload, method, url, outputPath);
      }
      return executeInline(ctx, payload, method, url);
    },
  };
}

async function executeInline(
  ctx: MuteworkerPluginContext,
  payload: Record<string, unknown>,
  method: string,
  url: string,
) {
  const response = await fetch(
    `${ctx.gatekeeperInternalUrl}/api/http/request`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    },
  );

  const data = (await response.json().catch(() => ({}))) as
    | HttpResponseSuccess
    | HttpResponseFetchError
    | HttpResponseBlocked
    | { error?: string };

  if (response.status === 400 && "error" in data && data.error) {
    throw new Error(`http_request: ${data.error}`);
  }

  if (response.status === 403 && "allowed" in data && !data.allowed) {
    return blockedReply(ctx, data as HttpResponseBlocked);
  }

  if (response.status === 502 && "error" in data && "allowed" in data) {
    const errored = data as HttpResponseFetchError;
    return {
      content: [
        {
          type: "text",
          text: `Request to ${errored.method} ${errored.domain} failed: ${errored.error}`,
        },
      ],
      details: errored,
    };
  }

  if (!response.ok) {
    const message =
      "error" in data && typeof data.error === "string"
        ? data.error
        : `gatekeeper returned ${response.status}`;
    throw new Error(`http_request: ${message}`);
  }

  const success = data as HttpResponseSuccess;
  const headerLines = Object.entries(success.headers)
    .slice(0, 30)
    .map(([k, v]) => `${k}: ${v}`)
    .join("\n");

  const bodyPreview =
    success.body.length > RESPONSE_PREVIEW_CHARS
      ? success.body.slice(0, RESPONSE_PREVIEW_CHARS) +
        `\n…[truncated, ${success.body.length - RESPONSE_PREVIEW_CHARS} more chars]`
      : success.body;

  const trailer = success.truncated
    ? `\n[response body truncated at ${RESPONSE_PREVIEW_CHARS} chars; total ${success.bodyBytes} bytes — pass output_path to stream large responses to a file]`
    : "";

  return {
    content: [
      {
        type: "text",
        text: [
          `${success.status} ${success.statusText} — ${success.method} ${success.url}`,
          headerLines,
          "",
          bodyPreview + trailer,
        ].join("\n"),
      },
    ],
    details: {
      status: success.status,
      statusText: success.statusText,
      url: success.url,
      method: success.method,
      domain: success.domain,
      headers: success.headers,
      bodyBytes: success.bodyBytes,
      truncated: success.truncated,
    },
  };
}

async function executeDownload(
  ctx: MuteworkerPluginContext,
  payload: Record<string, unknown>,
  method: string,
  url: string,
  outputPath: string,
) {
  const response = await fetch(
    `${ctx.gatekeeperInternalUrl}/api/http/download`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    },
  );

  // Block / validation / fetch errors come back as JSON.
  if (response.status === 400 || response.status === 403 || response.status === 502) {
    const data = (await response.json().catch(() => ({}))) as
      | HttpResponseFetchError
      | HttpResponseBlocked
      | { error?: string };
    if (response.status === 400 && "error" in data && data.error) {
      throw new Error(`http_request: ${data.error}`);
    }
    if (response.status === 403 && "allowed" in data && !data.allowed) {
      return blockedReply(ctx, data as HttpResponseBlocked);
    }
    if (response.status === 502 && "error" in data && "allowed" in data) {
      const errored = data as HttpResponseFetchError;
      return {
        content: [
          {
            type: "text",
            text: `Request to ${errored.method} ${errored.domain} failed: ${errored.error}`,
          },
        ],
        details: errored,
      };
    }
    throw new Error(`http_request: gatekeeper returned ${response.status}`);
  }

  if (!response.ok || !response.body) {
    throw new Error(
      `http_request: download failed with status ${response.status}`,
    );
  }

  const upstreamStatus = Number(response.headers.get("X-Http-Status") ?? "0");
  const upstreamStatusText =
    response.headers.get("X-Http-Status-Text") ?? "";
  const upstreamUrl = response.headers.get("X-Http-Url") ?? url;
  const upstreamDomain = response.headers.get("X-Http-Domain") ?? "";
  const requestId = Number(response.headers.get("X-Http-Request-Id") ?? "0");
  let upstreamHeaders: Record<string, string> = {};
  try {
    const raw = response.headers.get("X-Http-Headers");
    if (raw) upstreamHeaders = JSON.parse(raw);
  } catch {
    // ignore — header is best-effort metadata
  }

  await mkdir(path.dirname(outputPath), { recursive: true });

  const writer = createWriteStream(outputPath);
  await pipeline(Readable.fromWeb(response.body as any), writer);

  const head = await readHead(outputPath, FILE_PREVIEW_BYTES);
  const stats = await stat(outputPath);

  const headerLines = Object.entries(upstreamHeaders)
    .slice(0, 30)
    .map(([k, v]) => `${k}: ${v}`)
    .join("\n");

  const previewText = head.text;
  const previewTrailer =
    stats.size > FILE_PREVIEW_BYTES
      ? `\n…[file continues; ${stats.size - FILE_PREVIEW_BYTES} more bytes — use shell tools to inspect]`
      : "";

  return {
    content: [
      {
        type: "text",
        text: [
          `${upstreamStatus} ${upstreamStatusText} — ${method} ${upstreamUrl}`,
          headerLines,
          "",
          `Saved ${stats.size} bytes to ${outputPath}`,
          "",
          "--- head ---",
          previewText + previewTrailer,
          "",
          rssShellHints(outputPath, upstreamHeaders["content-type"] ?? ""),
        ].join("\n"),
      },
    ],
    details: {
      status: upstreamStatus,
      statusText: upstreamStatusText,
      url: upstreamUrl,
      method,
      domain: upstreamDomain,
      headers: upstreamHeaders,
      outputPath,
      bytesWritten: stats.size,
      requestId,
    },
  };
}

function blockedReply(
  ctx: MuteworkerPluginContext,
  blocked: HttpResponseBlocked,
) {
  return {
    content: [
      {
        type: "text",
        text: [
          `Request blocked by allow list: ${blocked.method} ${blocked.domain}`,
          blocked.message,
          `Open ${ctx.gatekeeperExternalUrl}?page=http to allow this domain.`,
        ].join("\n"),
      },
    ],
    details: blocked,
  };
}

async function readHead(
  filePath: string,
  bytes: number,
): Promise<{ text: string; bytesRead: number }> {
  const fh = await open(filePath, "r");
  try {
    const buf = Buffer.alloc(bytes);
    const { bytesRead } = await fh.read(buf, 0, bytes, 0);
    return {
      text: new TextDecoder("utf-8", { fatal: false }).decode(
        buf.subarray(0, bytesRead),
      ),
      bytesRead,
    };
  } finally {
    await fh.close();
  }
}

function rssShellHints(filePath: string, contentType: string): string {
  const looksXml =
    /xml|rss|atom/i.test(contentType) ||
    filePath.endsWith(".xml") ||
    filePath.endsWith(".rss") ||
    filePath.endsWith(".atom");
  if (!looksXml) {
    return [
      "--- shell hints ---",
      `head -c 4000 ${shellEscape(filePath)}`,
      `wc -c ${shellEscape(filePath)}`,
    ].join("\n");
  }
  const f = shellEscape(filePath);
  return [
    "--- shell hints (RSS/Atom) ---",
    `xmllint --xpath 'count(//item | //entry)' ${f}                  # number of entries`,
    `xmlstarlet sel -t -m '//item|//entry' -v 'title' -n ${f}        # all entry titles`,
    `xmlstarlet sel -t -m '//item|//entry' -v 'concat(pubDate|published, " — ", title)' -n ${f}`,
    `xmlstarlet sel -t -v '//channel/title|//feed/title' ${f}        # feed title`,
    `xml2 < ${f} | grep -E '/(title|link|pubDate|published)' | head` ,
  ].join("\n");
}

function shellEscape(value: string): string {
  if (/^[A-Za-z0-9_./@:+-]+$/.test(value)) return value;
  return "'" + value.replace(/'/g, "'\\''") + "'";
}
