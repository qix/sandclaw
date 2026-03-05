import { spawn } from "node:child_process";
import { createInterface } from "node:readline";
import { quote } from "shell-quote";
import { PiEventPrinter } from "./events.js";

const DIM = "\x1b[2m";
const BOLD = "\x1b[1m";
const RESET = "\x1b[0m";

function logCmd(cmd: string, args: string[]) {
  process.stderr.write(`${BOLD}$ ${quote([cmd, ...args])}${RESET}\n`);
}

// ---------------------------------------------------------------------------
// runDockerCommand — simple `docker run --rm` for non-pi commands
// ---------------------------------------------------------------------------

export interface RunDockerCommandOptions {
  /** Docker image name. */
  image: string;
  /** Command + args to execute inside the container. */
  command: string[];
  /**
   * Extra `docker run` flags inserted before the image name
   * (e.g. ["-v", "/host:/container"]).
   */
  dockerArgs?: string[];
}

/**
 * Run a one-shot `docker run --rm` command and return the exit code.
 * Stderr output is forwarded (dimmed) to the host stderr.
 */
export function runDockerCommand(
  options: RunDockerCommandOptions,
): Promise<{ exitCode: number }> {
  const { image, command, dockerArgs = [] } = options;

  const fullArgs = ["run", "--rm", ...dockerArgs, image, ...command];
  logCmd("docker", fullArgs);

  const child = spawn("docker", fullArgs, {
    stdio: ["ignore", "pipe", "pipe"],
  });

  child.stdout.on("data", () => {});
  child.stderr.on("data", (chunk: Buffer) => {
    process.stderr.write(`${DIM}${chunk.toString()}${RESET}`);
  });

  return new Promise((resolve) => {
    child.on("close", (code) => {
      resolve({ exitCode: code ?? 1 });
    });
  });
}

export interface RunDockerPiOptions {
  /** Docker image name (e.g. "sandclaw-browser-plugin"). */
  image: string;
  /** Prompt to pass to pi. */
  prompt: string;
  /** pi extension path inside the container (e.g. "node_modules/pi-agent-browser"). */
  extension?: string;
  /**
   * Environment variable names to forward from the host into the container.
   * Only variables that are actually set will be forwarded.
   * @default ["ANTHROPIC_API_KEY", "OPENAI_API_KEY", "GEMINI_API_KEY"]
   */
  envKeys?: string[];
  /**
   * Extra `docker run` flags inserted before the image name
   * (e.g. ["-v", "/host:/container", "--cap-add=NET_ADMIN"]).
   */
  dockerArgs?: string[];
  /**
   * Override the container command entirely.
   * When set, `extension` and `prompt` are NOT used to build the command —
   * the caller is responsible for embedding them (e.g. via an env var).
   */
  command?: string[];
}

export interface RunDockerPiResult {
  /** The final assistant reply (empty string if none). */
  finalReply: string;
  /** The child process exit code. */
  exitCode: number;
}

/**
 * Spawn a Docker container running `pi` in JSON mode, stream and pretty-print
 * events to stderr, and resolve with the final assistant reply.
 */
export function runDockerPi(
  options: RunDockerPiOptions,
): Promise<RunDockerPiResult> {
  const {
    image,
    prompt,
    extension,
    envKeys = ["ANTHROPIC_API_KEY", "OPENAI_API_KEY", "GEMINI_API_KEY"],
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
    "npx",
    "pi",
    "--mode",
    "json",
    ...(extension ? ["--extension", extension] : []),
    "--print",
    prompt,
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

  const printer = new PiEventPrinter();
  const rl = createInterface({ input: child.stdout });

  rl.on("line", (line) => {
    if (!line.trim()) return;
    try {
      printer.handleEvent(JSON.parse(line));
    } catch {
      process.stderr.write(`${DIM}${line}${RESET}\n`);
    }
  });

  child.stderr.on("data", (chunk: Buffer) => {
    process.stderr.write(`${DIM}${chunk.toString()}${RESET}`);
  });

  return new Promise<RunDockerPiResult>((resolve) => {
    child.on("close", (code) => {
      printer.flush();
      resolve({ finalReply: printer.finalReply, exitCode: code ?? 1 });
    });
  });
}
