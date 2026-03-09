import { spawn } from "node:child_process";
import { createInterface } from "node:readline";
import { quote } from "shell-quote";

const DIM = "\x1b[2m";
const BOLD = "\x1b[1m";
const RESET = "\x1b[0m";

function logCmd(cmd: string, args: string[]) {
  process.stderr.write(`${BOLD}$ ${quote([cmd, ...args])}${RESET}\n`);
}

export interface RunDockerClaudeOptions {
  /** Docker image name (e.g. "builder-plugin"). */
  image: string;
  /** Prompt to pass to claude (set as CLAUDE_PROMPT env var). */
  prompt: string;
  /**
   * Environment variable names to forward from the host into the container.
   * Only variables that are actually set will be forwarded.
   * @default ["ANTHROPIC_API_KEY"]
   */
  envKeys?: string[];
  /**
   * Extra `docker run` flags inserted before the image name
   * (e.g. ["-v", "/host:/container", "--cap-add=NET_ADMIN"]).
   */
  dockerArgs?: string[];
}

export interface RunDockerClaudeResult {
  /** The final assistant reply (empty string if none). */
  finalReply: string;
  /** The child process exit code. */
  exitCode: number;
  /** User prompts collected by the transparent API proxy. */
  prompts: string[];
  /** Status messages collected during execution. */
  statusMessages: string[];
}

/**
 * Spawn a Docker container running the builder entry point (proxy + claude).
 * The container writes JSON blobs to stdout (status + result) and
 * human-readable logs to stderr.
 */
export function runDockerClaude(
  options: RunDockerClaudeOptions,
): Promise<RunDockerClaudeResult> {
  const {
    image,
    prompt,
    envKeys = ["ANTHROPIC_API_KEY"],
    dockerArgs = [],
  } = options;

  const envFlags: string[] = [];
  for (const key of envKeys) {
    if (process.env[key]) {
      envFlags.push("-e", key);
    }
  }

  // Pass prompt via environment variable for the entry point
  envFlags.push("-e", `CLAUDE_PROMPT=${prompt}`);

  const fullArgs = [
    "run",
    "--rm",
    ...envFlags,
    ...dockerArgs,
    image,
  ];
  logCmd("docker", fullArgs);

  const child = spawn("docker", fullArgs, {
    stdio: ["ignore", "pipe", "pipe"],
  });

  const statusMessages: string[] = [];
  let finalReply = "";
  let prompts: string[] = [];

  const rl = createInterface({ input: child.stdout });

  rl.on("line", (line) => {
    if (!line.trim()) return;
    try {
      const blob = JSON.parse(line);
      if (blob.type === "status") {
        statusMessages.push(blob.message);
        process.stderr.write(`${DIM}[builder] ${blob.message}${RESET}\n`);
      } else if (blob.type === "result") {
        finalReply = blob.data ?? "";
        prompts = blob.prompts ?? [];
      }
    } catch {
      process.stderr.write(`${DIM}${line}${RESET}\n`);
    }
  });

  child.stderr.on("data", (chunk: Buffer) => {
    process.stderr.write(`${DIM}${chunk.toString()}${RESET}`);
  });

  return new Promise<RunDockerClaudeResult>((resolve) => {
    child.on("close", (code) => {
      resolve({ finalReply, statusMessages, prompts, exitCode: code ?? 1 });
    });
  });
}
