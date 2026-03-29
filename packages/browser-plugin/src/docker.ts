import { spawn } from "node:child_process";
import { createInterface } from "node:readline";
import { quote } from "shell-quote";

const DIM = "\x1b[2m";
const BOLD = "\x1b[1m";
const RESET = "\x1b[0m";

function logCmd(cmd: string, args: string[]) {
  process.stderr.write(`${BOLD}$ ${quote([cmd, ...args])}${RESET}\n`);
}

/** Parsed status event derived from Claude SDK messages. */
export interface BrowserStatusEvent {
  subtype: "info" | "assistant" | "tool_use" | "tool_result" | "error";
  message: string;
  tool?: { name: string; input: Record<string, unknown> };
  result?: Record<string, unknown>;
  timestamp: string;
}

// ── Claude message extraction helpers ───────────────────────────────

function extractAssistantText(msg: any): string {
  if (!msg?.message?.content) return "";
  const parts: string[] = [];
  for (const block of msg.message.content) {
    if (block.type === "text" && block.text) parts.push(block.text);
  }
  return parts.join("\n");
}

function extractToolUses(
  msg: any,
): { name: string; input: Record<string, unknown> }[] {
  if (!msg?.message?.content) return [];
  const tools: { name: string; input: Record<string, unknown> }[] = [];
  for (const block of msg.message.content) {
    if (block.type === "tool_use" && block.name) {
      tools.push({
        name: block.name,
        input: (block.input as Record<string, unknown>) ?? {},
      });
    }
  }
  return tools;
}

function extractToolResults(msg: any): Record<string, unknown>[] {
  if (!msg?.message?.content) return [];
  const results: Record<string, unknown>[] = [];
  for (const block of msg.message.content) {
    if (block.type === "tool_result") {
      results.push({
        tool_use_id: block.tool_use_id,
        content:
          typeof block.content === "string"
            ? block.content.slice(0, 2000)
            : block.content,
      });
    }
  }
  return results;
}

/** Convert a raw Claude SDK message into BrowserStatusEvents. */
function claudeMessageToEvents(body: any): BrowserStatusEvent[] {
  const ts = new Date().toISOString();
  const events: BrowserStatusEvent[] = [];

  if (body.type === "assistant") {
    for (const tool of extractToolUses(body)) {
      events.push({
        subtype: "tool_use",
        message: tool.name,
        tool,
        timestamp: ts,
      });
    }
    const text = extractAssistantText(body);
    if (text) {
      const truncated =
        text.length > 500 ? text.slice(0, 500) + "\u2026" : text;
      events.push({ subtype: "assistant", message: truncated, timestamp: ts });
    }
  } else if (body.type === "user") {
    const results = extractToolResults(body);
    events.push({
      subtype: "tool_result",
      message: "Processing tool results\u2026",
      result: { tool_results: results },
      timestamp: ts,
    });
  } else if (body.type === "result") {
    if (body.subtype === "success") {
      events.push({
        subtype: "info",
        message: `Completed in ${body.num_turns} turns`,
        timestamp: ts,
      });
    } else {
      events.push({
        subtype: "error",
        message: `Error after ${body.num_turns} turns`,
        timestamp: ts,
      });
    }
  }

  return events;
}

export interface RunDockerBrowserOptions {
  /** Docker image name (e.g. "browser-plugin"). */
  image: string;
  /** Prompt to pass to the browser agent. */
  prompt: string;
  /** Optional start URL for the browser. */
  url?: string;
  /** Model ID for the agent (e.g. "claude-opus-4-6"). */
  modelId?: string;
  /** Max agent turns. @default 30 */
  maxTurns?: number;
  /**
   * Environment variable names to forward from the host into the container.
   * Only variables that are actually set will be forwarded.
   * @default ["ANTHROPIC_API_KEY"]
   */
  envKeys?: string[];
  /**
   * Extra `docker run` flags inserted before the image name.
   */
  dockerArgs?: string[];
  /**
   * Called for each status blob emitted by the container.
   * Use this to forward status to the gatekeeper's agent status API.
   */
  onStatus?: (event: BrowserStatusEvent) => void;
}

export interface RunDockerBrowserResult {
  /** The final result data (empty string if none). */
  finalResult: string;
  /** Status messages collected during execution. */
  statusMessages: string[];
  /** The child process exit code. */
  exitCode: number;
}

/**
 * Spawn a Docker container running the browser agent entry point.
 * The container writes raw Claude SDK messages as `{ type: "claude", body }`
 * and a final `{ type: "result", data, exitCode }` to stdout.
 * Human-readable logs go to stderr.
 */
export function runDockerBrowser(
  options: RunDockerBrowserOptions,
): Promise<RunDockerBrowserResult> {
  const {
    image,
    prompt,
    url,
    modelId,
    maxTurns = 30,
    envKeys = ["ANTHROPIC_API_KEY"],
    dockerArgs = [],
    onStatus,
  } = options;

  const envFlags: string[] = [];
  for (const key of envKeys) {
    if (process.env[key]) {
      envFlags.push("-e", key);
    }
  }

  // Pass prompt, URL, and max turns via environment variables
  envFlags.push("-e", `BROWSER_PROMPT=${prompt}`);
  if (url) {
    envFlags.push("-e", `BROWSER_START_URL=${url}`);
  }
  envFlags.push("-e", `BROWSER_MAX_TURNS=${maxTurns}`);
  if (modelId) {
    envFlags.push("-e", `BROWSER_MODEL_ID=${modelId}`);
  }

  const fullArgs = ["run", "--rm", ...envFlags, ...dockerArgs, image];
  logCmd("docker", fullArgs);

  const child = spawn("docker", fullArgs, {
    stdio: ["ignore", "pipe", "pipe"],
  });

  const statusMessages: string[] = [];
  let finalResult = "";

  const rl = createInterface({ input: child.stdout });

  rl.on("line", (line) => {
    if (!line.trim()) return;
    try {
      const blob = JSON.parse(line);
      if (blob.type === "claude") {
        const events = claudeMessageToEvents(blob.body);
        for (const event of events) {
          statusMessages.push(event.message);
          process.stderr.write(`${DIM}[browser] ${event.message}${RESET}\n`);
          onStatus?.(event);
        }
      } else if (blob.type === "result") {
        finalResult = blob.data ?? "";
      }
    } catch {
      process.stderr.write(`${DIM}${line}${RESET}\n`);
    }
  });

  child.stderr.on("data", (chunk: Buffer) => {
    process.stderr.write(`${DIM}${chunk.toString()}${RESET}`);
  });

  return new Promise<RunDockerBrowserResult>((resolve) => {
    child.on("close", (code) => {
      resolve({ finalResult, statusMessages, exitCode: code ?? 1 });
    });
  });
}
