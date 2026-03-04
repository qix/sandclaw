#!/usr/bin/env npx tsx

import cac from "cac";
import { spawn } from "node:child_process";
import { createInterface } from "node:readline";

// --- Muted stderr helpers ---

const DIM = "\x1b[2m";
const RESET = "\x1b[0m";

function muted(text: string) {
  process.stderr.write(`${DIM}${text}${RESET}\n`);
}

function mutedInline(text: string) {
  process.stderr.write(`${DIM}${text}${RESET}`);
}

// --- Streaming state ---

let needsNewline = false; // track whether a delta stream needs closing

function ensureNewline() {
  if (needsNewline) {
    process.stderr.write("\n");
    needsNewline = false;
  }
}

// --- Final reply tracking ---

let finalReply = "";
let currentStopReason = "";

// --- Event handler ---

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function handleEvent(event: any): void {
  switch (event.type) {
    case "session":
      muted(`[session] ${event.id} (v${event.version}) cwd=${event.cwd}`);
      break;

    case "agent_start":
      muted("[agent] started");
      break;

    case "turn_start":
      ensureNewline();
      muted("\n--- turn ---");
      break;

    case "message_start": {
      const msg = event.message;
      if (msg?.role === "user") {
        const text = msg.content?.[0]?.text ?? "";
        muted(`[user] ${text}`);
      }
      break;
    }

    case "message_update": {
      const ame = event.assistantMessageEvent;
      if (!ame) break;

      switch (ame.type) {
        case "thinking_start":
          ensureNewline();
          muted("[thinking]");
          needsNewline = true;
          break;

        case "thinking_delta":
          mutedInline(ame.delta ?? "");
          needsNewline = true;
          break;

        case "thinking_end":
          ensureNewline();
          break;

        case "text_start":
          ensureNewline();
          needsNewline = true;
          break;

        case "text_delta":
          mutedInline(ame.delta ?? "");
          needsNewline = true;
          break;

        case "text_end":
          ensureNewline();
          break;

        case "toolcall_start":
          ensureNewline();
          break;

        case "toolcall_end": {
          const tc = ame.toolCall;
          if (tc) {
            muted(
              `[tool-call] ${tc.name}(${JSON.stringify(tc.arguments)})`,
            );
          }
          break;
        }
      }
      break;
    }

    case "tool_execution_start":
      ensureNewline();
      muted(
        `[executing] ${event.toolName}(${JSON.stringify(event.args)})`,
      );
      break;

    case "tool_execution_end": {
      const text = event.result?.content?.[0]?.text ?? "";
      const preview = text.slice(0, 200).replace(/\n/g, " ");
      const prefix = event.isError ? "[tool-error]" : "[tool-result]";
      muted(
        `${prefix} ${event.toolName}: ${preview}${text.length > 200 ? "..." : ""}`,
      );
      break;
    }

    case "message_end": {
      const msg = event.message;
      if (msg?.role === "assistant") {
        currentStopReason = msg.stopReason ?? "";
        const texts = (msg.content ?? []).filter(
          (c: { type: string; text?: string }) => c.type === "text" && c.text,
        );
        if (texts.length > 0) {
          const text = texts
            .map((c: { text: string }) => c.text)
            .join("\n");
          // Only treat as final reply when the model stopped naturally
          // (not when it stopped to make a tool call)
          if (currentStopReason === "stop") {
            finalReply = text;
          }
        }
      }
      break;
    }

    case "turn_end":
      ensureNewline();
      break;

    default:
      if (event.type) {
        muted(`[${event.type}]`);
      }
      break;
  }
}

// --- CLI ---

const cli = cac("run-browser");
cli.option("--image <name>", "Docker image to use", {
  default: "sandclaw-browser-plugin",
});
cli.help();

const parsed = cli.parse();
if (parsed.options.help) process.exit(0);

const prompt = parsed.args[0] as string | undefined;
if (!prompt) {
  console.error("Usage: run-browser <prompt>");
  process.exit(1);
}

const image = parsed.options.image as string;

const envFlags: string[] = [];
for (const key of ["ANTHROPIC_API_KEY", "OPENAI_API_KEY", "GEMINI_API_KEY"]) {
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
    "node_modules/pi-agent-browser",
    "--print",
    prompt,
  ],
  { stdio: ["ignore", "pipe", "pipe"] },
);

const rl = createInterface({ input: child.stdout });

rl.on("line", (line) => {
  if (!line.trim()) return;
  try {
    handleEvent(JSON.parse(line));
  } catch {
    muted(line);
  }
});

child.stderr.on("data", (chunk: Buffer) => {
  process.stderr.write(`${DIM}${chunk.toString()}${RESET}`);
});

child.on("close", (code) => {
  ensureNewline();
  if (finalReply) {
    process.stdout.write(finalReply + "\n");
  }
  process.exit(code ?? 1);
});
