/**
 * Terminal chat client for the gatekeeper's chat-plugin channel.
 *
 * Connects to ws://<host>/api/gatekeeper/ws, prints history, and lets the
 * operator send messages via the same channel the browser UI uses.
 */
import readline from "node:readline";
import WebSocket from "ws";

interface ChatMessage {
  id: number;
  from: string;
  text: string;
  direction: "inbound" | "outbound";
  timestamp?: string;
}

const baseUrl = (
  process.env.GATEKEEPER_INTERNAL_URL ??
  process.env.GATEKEEPER_URL ??
  "http://localhost:8888"
).replace(/\/+$/, "");
const wsUrl = baseUrl.replace(/^http/, "ws") + "/api/gatekeeper/ws";

const C = {
  reset: "\x1b[0m",
  dim: "\x1b[2m",
  bold: "\x1b[1m",
  red: "\x1b[31m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  magenta: "\x1b[35m",
  cyan: "\x1b[36m",
  gray: "\x1b[90m",
};

const seenMessageIds = new Set<number>();
let latestMessageId = 0;

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
  prompt: `${C.bold}${C.cyan}>${C.reset} `,
  terminal: true,
});

/**
 * Print a line above the readline prompt without disturbing in-progress
 * input. We clear the current line, write, then redraw the prompt + buffer.
 */
function printAbovePrompt(line: string): void {
  if (process.stdout.isTTY) {
    readline.cursorTo(process.stdout, 0);
    readline.clearLine(process.stdout, 0);
    process.stdout.write(line + "\n");
    rl.prompt(true);
  } else {
    process.stdout.write(line + "\n");
  }
}

function info(line: string): void {
  printAbovePrompt(`${C.gray}── ${line} ──${C.reset}`);
}

function formatTime(ts?: string): string {
  if (!ts) return "";
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function printMessage(msg: ChatMessage): void {
  if (seenMessageIds.has(msg.id)) return;
  seenMessageIds.add(msg.id);
  if (msg.id > latestMessageId) latestMessageId = msg.id;

  const time = formatTime(msg.timestamp);
  const isOperator = msg.direction === "inbound";
  const tag = isOperator
    ? `${C.bold}${C.cyan}you${C.reset}`
    : `${C.bold}${C.green}agent${C.reset}`;
  const timeStr = time ? `${C.gray}${time}${C.reset} ` : "";
  const lines = msg.text.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const prefix = i === 0 ? `${timeStr}${tag} ` : "        ";
    printAbovePrompt(`${prefix}${lines[i]}`);
  }
}

async function fetchInitialHistory(): Promise<void> {
  try {
    const r = await fetch(`${baseUrl}/api/chat/history?limit=30`);
    if (!r.ok) return;
    const body = (await r.json()) as { messages?: ChatMessage[] };
    const msgs = body.messages ?? [];
    if (msgs.length === 0) {
      info("No prior messages — say hi!");
      return;
    }
    info(`Loaded ${msgs.length} message${msgs.length === 1 ? "" : "s"}`);
    for (const m of msgs) printMessage(m);
  } catch (err) {
    info(`Failed to load history: ${(err as Error).message}`);
  }
}

function markRead(): void {
  if (latestMessageId <= 0) return;
  fetch(`${baseUrl}/api/chat/mark-read`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ messageId: latestMessageId }),
  }).catch(() => {});
}

const RECONNECT_INITIAL_MS = 1000;
const RECONNECT_MAX_MS = 5000;

let ws: WebSocket | null = null;
let pendingOutbound: string[] = [];
let everConnected = false;
let retryAnnounced = false;
let reconnectDelay = RECONNECT_INITIAL_MS;

function connect(): void {
  if (!everConnected && !retryAnnounced) {
    info(`Connecting to ${wsUrl}…`);
  }
  const sock = new WebSocket(wsUrl);
  ws = sock;

  sock.on("open", () => {
    everConnected = true;
    retryAnnounced = false;
    reconnectDelay = RECONNECT_INITIAL_MS;
    info("Connected");
    while (pendingOutbound.length > 0) {
      const text = pendingOutbound.shift()!;
      sock.send(JSON.stringify({ type: "chat-plugin:message", text }));
    }
  });

  sock.on("message", (raw: WebSocket.RawData) => {
    let data: any;
    try {
      data = JSON.parse(String(raw));
    } catch {
      return;
    }
    if (data.type === "chat-plugin:history" && Array.isArray(data.messages)) {
      for (const m of data.messages as ChatMessage[]) printMessage(m);
      markRead();
      return;
    }
    if (data.type === "chat-plugin:message" && data.message) {
      printMessage(data.message as ChatMessage);
      markRead();
      return;
    }
  });

  sock.on("close", () => {
    if (ws !== sock) return;
    ws = null;
    if (!retryAnnounced) {
      info("Disconnected — retrying every 5 seconds…");
      retryAnnounced = true;
    }
    setTimeout(connect, reconnectDelay);
    reconnectDelay = Math.min(reconnectDelay * 2, RECONNECT_MAX_MS);
  });

  // Errors are followed by a `close`, which is what the user sees. Swallow
  // the per-attempt error noise so the retry message stays the only output.
  sock.on("error", () => {});
}

function sendMessage(text: string): void {
  if (!text.trim()) return;
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ type: "chat-plugin:message", text }));
  } else {
    pendingOutbound.push(text);
    info("Queued (not connected) — will send on reconnect");
  }
}

rl.on("line", (raw) => {
  const text = raw.trimEnd();
  if (!text) {
    rl.prompt();
    return;
  }
  if (text === "/quit" || text === "/exit") {
    rl.close();
    return;
  }
  if (text === "/clear") {
    process.stdout.write("\x1b[2J\x1b[H");
    rl.prompt();
    return;
  }
  if (text.startsWith("/")) {
    info(`Unknown command: ${text}. Available: /quit, /clear`);
    rl.prompt();
    return;
  }
  sendMessage(text);
  rl.prompt();
});

rl.on("close", () => {
  if (ws) ws.close();
  process.stdout.write("\n");
  process.exit(0);
});

process.on("SIGINT", () => {
  rl.close();
});

(async () => {
  process.stdout.write(
    `${C.bold}${C.cyan}sandclaw chat${C.reset} ${C.gray}— ${baseUrl} (Ctrl+D / /quit to exit)${C.reset}\n`,
  );
  await fetchInitialHistory();
  connect();
  rl.prompt();
})();
