import { spawn } from "node:child_process";
import { createInterface } from "node:readline";
import { PiEventPrinter } from "./events.js";

const DIM = "\x1b[2m";
const RESET = "\x1b[0m";

export interface RunPiOptions {
  /** Docker image name (e.g. "sandclaw-browser-plugin"). */
  image: string;
  /** Prompt to pass to pi. */
  prompt: string;
  /** pi extension path inside the container (e.g. "node_modules/pi-agent-browser"). */
  extension: string;
  /**
   * Environment variable names to forward from the host into the container.
   * Only variables that are actually set will be forwarded.
   * @default ["ANTHROPIC_API_KEY", "OPENAI_API_KEY", "GEMINI_API_KEY"]
   */
  envKeys?: string[];
}

export interface RunPiResult {
  /** The final assistant reply (empty string if none). */
  finalReply: string;
  /** The child process exit code. */
  exitCode: number;
}

/**
 * Spawn a Docker container running `pi` in JSON mode, stream and pretty-print
 * events to stderr, and resolve with the final assistant reply.
 */
export function runPi(options: RunPiOptions): Promise<RunPiResult> {
  const {
    image,
    prompt,
    extension,
    envKeys = ["ANTHROPIC_API_KEY", "OPENAI_API_KEY", "GEMINI_API_KEY"],
  } = options;

  const envFlags: string[] = [];
  for (const key of envKeys) {
    if (process.env[key]) {
      envFlags.push("-e", key);
    }
  }

  const child = spawn(
    "docker",
    [
      "run",
      "--rm",
      ...envFlags,
      image,
      "npx",
      "pi",
      "--mode",
      "json",
      "--extension",
      extension,
      "--print",
      prompt,
    ],
    { stdio: ["ignore", "pipe", "pipe"] },
  );

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

  return new Promise<RunPiResult>((resolve) => {
    child.on("close", (code) => {
      printer.flush();
      resolve({ finalReply: printer.finalReply, exitCode: code ?? 1 });
    });
  });
}
