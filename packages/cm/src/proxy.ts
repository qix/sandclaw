import http from 'node:http';
import https from 'node:https';
import { writeFileSync, mkdirSync } from 'node:fs';
import { randomUUID } from 'node:crypto';

interface ProxyOptions {
  saveLogs?: boolean;
}

interface ProxyHandle {
  port: number;
  prompts: string[];
  close(): void;
}

/**
 * Strip system-injected content from a text string, returning only the
 * user-authored portion. Returns an empty string if the entire text is
 * system-injected.
 */
function stripSystemContent(text: string): string {
  let stripped = text;
  // Remove common system-injected XML-tagged blocks (multiline)
  stripped = stripped.replace(/<system-reminder>[\s\S]*?<\/system-reminder>/g, '');
  stripped = stripped.replace(/<environment_details>[\s\S]*?<\/environment_details>/g, '');
  stripped = stripped.replace(/<context>[\s\S]*?<\/context>/g, '');
  stripped = stripped.replace(/<user-prompt-submit-hook>[\s\S]*?<\/user-prompt-submit-hook>/g, '');
  stripped = stripped.replace(/<command-name>[\s\S]*?<\/command-name>/g, '');
  return stripped.trim();
}

/**
 * Extract user text prompts from a /v1/messages request body.
 * Keeps only `type: "text"` content blocks from `role: "user"` messages,
 * filtering out tool_result blocks and system-injected content.
 */
function extractUserPrompts(body: unknown): string[] {
  if (!body || typeof body !== 'object') return [];
  const { messages } = body as { messages?: unknown[] };
  if (!Array.isArray(messages)) return [];

  const texts: string[] = [];

  for (const msg of messages) {
    if (!msg || typeof msg !== 'object') continue;
    const { role, content } = msg as { role?: string; content?: unknown };
    if (role !== 'user') continue;

    if (typeof content === 'string') {
      const clean = stripSystemContent(content);
      if (clean && clean !== 'quota') {
        texts.push(clean);
      }
      continue;
    }

    if (Array.isArray(content)) {
      // Skip messages that contain tool_result blocks — these are automated
      // tool responses and any accompanying text is system-injected context,
      // not human-authored prompts.
      const hasToolResult = content.some(
        (block) =>
          block &&
          typeof block === 'object' &&
          (block as { type?: string }).type === 'tool_result',
      );
      if (hasToolResult) continue;

      for (const block of content) {
        if (
          block &&
          typeof block === 'object' &&
          (block as { type?: string }).type === 'text' &&
          typeof (block as { text?: string }).text === 'string'
        ) {
          const clean = stripSystemContent((block as { text: string }).text);
          if (clean) texts.push(clean);
        }
      }
    }
  }

  return texts;
}

export function startProxy(options: ProxyOptions = {}): Promise<ProxyHandle> {
  const prompts: string[] = [];
  const seenPrompts = new Set<string>();
  let logDir: string | null = null;

  if (options.saveLogs) {
    logDir = 'cm-logs';
    mkdirSync(logDir, { recursive: true });
  }

  const HOP_BY_HOP = new Set([
    'connection',
    'keep-alive',
    'transfer-encoding',
    'te',
    'trailer',
    'upgrade',
  ]);

  const server = http.createServer((clientReq, clientRes) => {
    const chunks: Buffer[] = [];

    clientReq.on('data', (chunk: Buffer) => chunks.push(chunk));

    clientReq.on('error', (err) => {
      console.error('Proxy client request error:', err.message);
      if (!clientRes.headersSent) clientRes.writeHead(400);
      clientRes.end();
    });

    clientReq.on('end', () => {
      const bodyBuf = Buffer.concat(chunks);

      // Extract prompts from POST /v1/messages
      if (clientReq.method === 'POST' && clientReq.url?.startsWith('/v1/messages')) {
        try {
          const parsed = JSON.parse(bodyBuf.toString('utf8'));

          if (logDir) {
            const logFile = `${logDir}/${randomUUID()}.json`;
            writeFileSync(logFile, JSON.stringify(parsed, null, 2));
          }

          const texts = extractUserPrompts(parsed);
          for (const text of texts) {
            if (text.trim() && !seenPrompts.has(text)) {
              seenPrompts.add(text);
              prompts.push(text);
            }
          }
        } catch {
          // ignore parse errors
        }
      }

      // Forward headers, stripping hop-by-hop
      const fwdHeaders: Record<string, string | string[]> = {};
      for (const [key, val] of Object.entries(clientReq.headers)) {
        if (HOP_BY_HOP.has(key.toLowerCase())) continue;
        if (key.toLowerCase() === 'host') continue;
        if (val !== undefined) fwdHeaders[key] = val;
      }
      fwdHeaders['host'] = 'api.anthropic.com';
      fwdHeaders['content-length'] = String(bodyBuf.length);

      const upstreamReq = https.request(
        {
          hostname: 'api.anthropic.com',
          port: 443,
          path: clientReq.url,
          method: clientReq.method,
          headers: fwdHeaders,
        },
        (upstreamRes) => {
          // Strip hop-by-hop headers from the upstream response so Node's
          // HTTP server can manage transfer-encoding / connection itself.
          const resHeaders: http.OutgoingHttpHeaders = {};
          for (const [key, val] of Object.entries(upstreamRes.headers)) {
            if (HOP_BY_HOP.has(key.toLowerCase())) continue;
            if (val !== undefined) resHeaders[key] = val;
          }
          clientRes.writeHead(upstreamRes.statusCode ?? 502, resHeaders);
          upstreamRes.pipe(clientRes);
        },
      );

      upstreamReq.setTimeout(120_000, () => {
        upstreamReq.destroy(new Error('upstream timeout'));
      });

      upstreamReq.on('error', (err) => {
        console.error('Proxy upstream error:', err.message);
        if (!clientRes.headersSent) {
          clientRes.writeHead(502);
        }
        clientRes.end('Bad Gateway');
      });

      // If client disconnects, abort the upstream request
      clientRes.on('close', () => {
        upstreamReq.destroy();
      });

      upstreamReq.end(bodyBuf);
    });
  });

  return new Promise((resolve, reject) => {
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address();
      if (!addr || typeof addr === 'string') {
        server.close();
        reject(new Error('Failed to get proxy port'));
        return;
      }
      resolve({
        port: addr.port,
        prompts,
        close() {
          server.close();
        },
      });
    });

    server.on('error', reject);
  });
}
