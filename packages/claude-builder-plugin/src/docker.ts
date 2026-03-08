import { spawn } from "node:child_process";
import { quote } from "shell-quote";

const DIM = "\x1b[2m";
const BOLD = "\x1b[1m";
const RESET = "\x1b[0m";

function logCmd(cmd: string, args: string[]) {
  process.stderr.write(`${BOLD}$ ${quote([cmd, ...args])}${RESET}\n`);
}

export interface RunDockerClaudeOptions {
  /** Docker image name (e.g. "claude-builder-plugin"). */
  image: string;
  /** Prompt to pass to claude. */
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
  /**
   * Override the container command entirely.
   * When set, `prompt` is NOT used to build the command —
   * the caller is responsible for embedding it (e.g. via an env var).
   */
  command?: string[];
}

export interface RunDockerClaudeResult {
  /** The final assistant reply (empty string if none). */
  finalReply: string;
  /** The child process exit code. */
  exitCode: number;
}

/**
 * Spawn a Docker container running `claude` in print mode, stream stderr
 * output to the host, and resolve with the final assistant reply from stdout.
 */
export function runDockerClaude(
  options: RunDockerClaudeOptions,
): Promise<RunDockerClaudeResult> {
  const {
    image,
    prompt,
    envKeys = ["ANTHROPIC_API_KEY"],
    dockerArgs = [],
    command,
  } = options;

  const envFlags: string[] = [];
  for (const key of envKeys) {
    if (process.env[key]) {
      envFlags.push("-e", key);
    }
  }

  const containerCommand = command ?? [
    "claude",
    "-p",
    prompt,
    "--dangerously-skip-permissions",
  ];

  const fullArgs = [
    "run",
    "--rm",
    ...envFlags,
    ...dockerArgs,
    image,
    ...containerCommand,
  ];
  logCmd("docker", fullArgs);

  const child = spawn("docker", fullArgs, {
    stdio: ["ignore", "pipe", "pipe"],
  });

  const stdoutChunks: Buffer[] = [];
  child.stdout.on("data", (chunk: Buffer) => {
    stdoutChunks.push(chunk);
  });

  child.stderr.on("data", (chunk: Buffer) => {
    process.stderr.write(`${DIM}${chunk.toString()}${RESET}`);
  });

  return new Promise<RunDockerClaudeResult>((resolve) => {
    child.on("close", (code) => {
      const finalReply = Buffer.concat(stdoutChunks).toString("utf-8").trim();
      resolve({ finalReply, exitCode: code ?? 1 });
    });
  });
}
