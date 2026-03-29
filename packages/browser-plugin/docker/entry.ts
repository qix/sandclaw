import {
  query,
  type SDKResultSuccess,
  type SDKResultError,
} from "@anthropic-ai/claude-agent-sdk";

// Prevent nested Claude Code detection
delete process.env.CLAUDECODE;
delete process.env.CLAUDE_CODE_ENTRYPOINT;

// ── helpers ──────────────────────────────────────────────────────────

function log(msg: string) {
  process.stderr.write(`[browser-entry] ${msg}\n`);
}

function writeClaude(body: unknown) {
  process.stdout.write(JSON.stringify({ type: "claude", body }) + "\n");
}

function writeResult(data: string, exitCode: number) {
  process.stdout.write(
    JSON.stringify({ type: "result", data, exitCode }) + "\n",
  );
}

// ── main ─────────────────────────────────────────────────────────────

async function main() {
  const prompt = process.env.BROWSER_PROMPT;
  if (!prompt) {
    log("ERROR: BROWSER_PROMPT env var is required");
    writeResult("", 1);
    process.exit(1);
  }

  const startUrl = process.env.BROWSER_START_URL || "";
  const modelId = process.env.BROWSER_MODEL_ID || undefined;
  const maxTurns = parseInt(process.env.BROWSER_MAX_TURNS || "30", 10);

  log(`prompt: ${prompt.slice(0, 120)}...`);
  if (startUrl) log(`start URL: ${startUrl}`);
  if (modelId) log(`model: ${modelId}`);
  log(`max turns: ${maxTurns}`);

  // Build system prompt — the agent-browser skill is installed at
  // .claude/skills/agent-browser/ and will be picked up by the SDK automatically.
  const systemParts = [
    "You are a browser automation agent. Use the agent-browser CLI via Bash to browse the web and complete the user's request.",
    "IMPORTANT: Do NOT use WebFetch, curl, wget, or any other tool to fetch web content. Do NOT install or use Playwright, Puppeteer, or any other browser automation library. The agent-browser CLI is already installed — use it exclusively via Bash.",
    "Return a concise summary of what you found or accomplished.",
  ];
  if (startUrl) {
    systemParts.push(`Start by navigating to: ${startUrl}`);
  }
  const systemPrompt = systemParts.join("\n");

  let finalReply = "";
  let exitCode = 0;
  let gotResult = false;

  try {
    const conversation = query({
      prompt,
      options: {
        systemPrompt,
        model: modelId,
        maxTurns,
        permissionMode: "bypassPermissions",
        allowDangerouslySkipPermissions: true,
        cwd: "/workspace",
        settingSources: ["project"],
      },
    });

    for await (const message of conversation) {
      writeClaude(message);

      if (message.type === "result") {
        gotResult = true;
        if (message.subtype === "success") {
          finalReply = (message as SDKResultSuccess).result ?? "";
        } else {
          exitCode = 1;
          finalReply =
            (message as SDKResultError).errors?.join("\n") ?? "Unknown error";
        }
      }
    }
  } catch (err: any) {
    // The SDK may throw "process exited with code 1" after yielding the
    // result message. Only treat this as an error if we never got a result.
    if (gotResult) {
      finalReply = `Agent error: ${finalReply}`;
    } else {
      exitCode = 1;
      finalReply = `Agent error: ${err.message ?? String(err)}`;
      log(`ERROR: ${finalReply}`);
    }
  }

  writeResult(finalReply, exitCode);
  process.exit(exitCode);
}

main();
