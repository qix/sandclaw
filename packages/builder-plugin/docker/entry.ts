import { startProxy } from "./proxy.js";
import { spawn } from "node:child_process";

// Prevent nested Claude Code detection
delete process.env.CLAUDECODE;
delete process.env.CLAUDE_CODE_ENTRYPOINT;

// -- helpers ----------------------------------------------------------------

function log(msg: string) {
  process.stderr.write(`[builder-entry] ${msg}\n`);
}

function writeStatus(message: string) {
  const blob = { type: "status", message, timestamp: new Date().toISOString() };
  process.stdout.write(JSON.stringify(blob) + "\n");
}

function writeResult(data: string, exitCode: number, prompts: string[]) {
  const blob = { type: "result", data, exitCode, prompts };
  process.stdout.write(JSON.stringify(blob) + "\n");
}

// -- main -------------------------------------------------------------------

async function main() {
  const prompt = process.env.CLAUDE_PROMPT;
  if (!prompt) {
    log("ERROR: CLAUDE_PROMPT env var is required");
    writeResult("", 1, []);
    process.exit(1);
  }

  const saveLogs = process.env.CLAUDE_SAVE_LOGS || undefined;

  log(`prompt: ${prompt.slice(0, 120)}...`);

  // Start the transparent proxy to intercept API calls and collect prompts
  writeStatus("Starting API proxy...");
  const proxy = await startProxy({ saveLogs });
  log(`Proxy started on port ${proxy.port}`);

  const baseUrl = `http://127.0.0.1:${proxy.port}`;

  // Spawn claude with the proxy as ANTHROPIC_BASE_URL
  writeStatus("Starting claude...");
  const claudeArgs = ["-p", prompt, "--dangerously-skip-permissions"];

  const stdoutChunks: Buffer[] = [];
  const result = await new Promise<{ exitCode: number }>((resolve) => {
    const child = spawn("claude", claudeArgs, {
      stdio: ["ignore", "pipe", "pipe"],
      env: {
        ...process.env,
        ANTHROPIC_BASE_URL: baseUrl,
      },
    });

    child.stdout.on("data", (chunk: Buffer) => {
      stdoutChunks.push(chunk);
    });

    child.stderr.on("data", (chunk: Buffer) => {
      process.stderr.write(chunk);
    });

    child.on("close", (code) => {
      resolve({ exitCode: code ?? 1 });
    });

    child.on("error", (err) => {
      log(`ERROR: ${err.message}`);
      resolve({ exitCode: 1 });
    });
  });

  proxy.close();

  const reply = Buffer.concat(stdoutChunks).toString("utf-8").trim();

  log(`claude exited with code ${result.exitCode}`);
  log(`Collected ${proxy.prompts.length} user prompt(s) from proxy`);

  writeStatus(`Completed (exit code: ${result.exitCode})`);
  writeResult(reply, result.exitCode, proxy.prompts);

  process.exit(result.exitCode);
}

main().catch((err: any) => {
  log(`Fatal error: ${err.message ?? String(err)}`);
  writeResult("", 1, []);
  process.exit(1);
});
