#!/usr/bin/env npx tsx

import cac from "cac";
import { spawn, execSync } from "node:child_process";
import { createInterface } from "node:readline";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

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

let needsNewline = false;

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

// --- Helper: run a command and return its exit code ---

function runSpawn(
  cmd: string,
  args: string[],
  stdio: "inherit" | "pipe" = "inherit",
): Promise<number> {
  return new Promise((resolve) => {
    const child = spawn(cmd, args, {
      stdio: stdio === "pipe" ? ["ignore", "pipe", "pipe"] : "inherit",
    });
    if (stdio === "pipe") {
      child.stdout?.on("data", () => {});
      child.stderr?.on("data", (chunk: Buffer) => {
        process.stderr.write(`${DIM}${chunk.toString()}${RESET}`);
      });
    }
    child.on("close", (code) => resolve(code ?? 1));
  });
}

// --- CLI ---

const cli = cac("run-build");
cli.option("--repo <url>", "Git repo URL to clone (required)");
cli.option("--work-dir <dir>", "Working directory to clone into (required)");
cli.option("--image <name>", "Docker image to use", {
  default: "builder-plugin",
});
cli.option("--branch <branch>", "Branch to checkout", { default: "main" });
cli.option("--commit-message <msg>", "Commit message for changes");
cli.help();

const parsed = cli.parse();
if (parsed.options.help) process.exit(0);

const prompt = parsed.args[0] as string | undefined;
if (!prompt) {
  console.error("Usage: run-build <prompt> --repo <url> --work-dir <dir>");
  process.exit(1);
}

const repo = parsed.options.repo as string | undefined;
const workDirRaw = parsed.options.workDir as string | undefined;

if (!repo) {
  console.error("Error: --repo is required");
  process.exit(1);
}

if (!workDirRaw) {
  console.error("Error: --work-dir is required");
  process.exit(1);
}

const workDir = resolve(workDirRaw);
const image = parsed.options.image as string;
const branch = parsed.options.branch as string;
const commitMessage = (parsed.options.commitMessage as string) || prompt;

// --- Step 1: Prepare working directory ---

if (existsSync(workDir)) {
  // Verify the existing directory is clean
  try {
    const status = execSync("git status --porcelain", {
      cwd: workDir,
      encoding: "utf-8",
    });
    if (status.trim()) {
      console.error(
        `Error: working directory ${workDir} has uncommitted changes`,
      );
      process.exit(1);
    }
    muted(`Working directory ${workDir} exists and is clean`);
  } catch (e) {
    console.error(`Error: could not check git status of ${workDir}: ${e}`);
    process.exit(1);
  }
} else {
  muted(`Cloning ${repo} (branch: ${branch}) into ${workDir}...`);
  const cloneCode = await runSpawn("git", [
    "clone",
    "--branch",
    branch,
    repo,
    workDir,
  ]);
  if (cloneCode !== 0) {
    console.error(`Error: git clone failed with code ${cloneCode}`);
    process.exit(1);
  }
}

// Record HEAD before
const headBefore = execSync("git rev-parse HEAD", {
  cwd: workDir,
  encoding: "utf-8",
}).trim();
muted(`HEAD before: ${headBefore}`);

// --- Step 2: npm install in Docker ---

muted("Running npm install in Docker container...");
const npmInstallCode = await runSpawn("docker", [
  "run",
  "--rm",
  "-v",
  `${workDir}:/workspace`,
  image,
  "npm",
  "install",
]);

if (npmInstallCode !== 0) {
  console.error(`Error: npm install failed with code ${npmInstallCode}`);
  process.exit(1);
}

muted("npm install completed successfully");

// --- Step 3: Run pi in Docker with event streaming ---

muted(`Running pi in Docker container (${image})...`);

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
    "--cap-add=NET_ADMIN",
    "--cap-add=NET_RAW",
    "-v",
    `${workDir}:/workspace`,
    ...envFlags,
    "-e",
    `PI_PROMPT=${prompt}`,
    image,
    "bash",
    "-c",
    'sudo /usr/local/bin/init-firewall.sh && pi --mode json --print "$PI_PROMPT"',
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

const piExitCode = await new Promise<number>((res) => {
  child.on("close", (code) => {
    ensureNewline();
    res(code ?? 1);
  });
});

muted(`pi exited with code: ${piExitCode}`);

// --- Step 4: Check for changes and commit ---

const status = execSync("git status --porcelain", {
  cwd: workDir,
  encoding: "utf-8",
});

if (status.trim()) {
  muted("Changes detected, committing...");
  execSync("git add -A", { cwd: workDir });
  execSync(`git commit -m ${JSON.stringify(commitMessage)}`, { cwd: workDir });
  muted(`Committed changes with message: ${commitMessage}`);
} else {
  muted("No changes detected.");
}

const headAfter = execSync("git rev-parse HEAD", {
  cwd: workDir,
  encoding: "utf-8",
}).trim();
muted(`HEAD after: ${headAfter}`);
muted(`Repo path: ${workDir}`);

if (finalReply) {
  process.stdout.write(finalReply + "\n");
}

process.exit(piExitCode);
