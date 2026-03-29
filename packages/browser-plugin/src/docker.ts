import { spawn } from "node:child_process";
import { createInterface } from "node:readline";
import { quote } from "shell-quote";

const DIM = "\x1b[2m";
const BOLD = "\x1b[1m";
const RESET = "\x1b[0m";

function logCmd(cmd: string, args: string[]) {
  process.stderr.write(`${BOLD}$ ${quote([cmd, ...args])}${RESET}\n`);
}

/** Parsed status blob from the Docker container's stdout. */
export interface BrowserStatusEvent {
  subtype: "info" | "assistant" | "tool_use" | "tool_result" | "error";
  message: string;
  timestamp: string;
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
 * The container writes JSON blobs to stdout (status + result) and
 * human-readable logs to stderr.
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
      if (blob.type === "status") {
        statusMessages.push(blob.message);
        process.stderr.write(`${DIM}[browser] ${blob.message}${RESET}\n`);
        onStatus?.({
          subtype: blob.subtype ?? "info",
          message: blob.message,
          timestamp: blob.timestamp ?? new Date().toISOString(),
        });
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
