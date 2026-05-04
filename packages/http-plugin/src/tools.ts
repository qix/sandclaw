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

      ctx.artifacts.push({
        type: "text",
        label: "HTTP Request",
        value: `${method} ${url}`,
      });

      // Blocked by allow list.
      if (response.status === 403 && "allowed" in data && !data.allowed) {
        const blocked = data as HttpResponseBlocked;
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

      // Network/fetch error after being allowed.
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
        ? `\n[response body truncated at ${RESPONSE_PREVIEW_CHARS} chars; total ${success.bodyBytes} bytes]`
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
    },
  };
}
