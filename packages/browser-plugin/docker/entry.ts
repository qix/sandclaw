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

interface StatusBlob {
  type: "status";
  subtype: "info" | "assistant" | "tool_use" | "tool_result" | "error";
  message: string;
  tool?: { name: string; input: Record<string, unknown> };
  result?: Record<string, unknown>;
  timestamp: string;
}

function writeStatus(
  message: string,
  subtype: StatusBlob["subtype"] = "info",
  extra?: { tool?: StatusBlob["tool"]; result?: StatusBlob["result"] },
) {
  const blob: StatusBlob = {
    type: "status",
    subtype,
    message,
    ...extra,
    timestamp: new Date().toISOString(),
  };
  process.stdout.write(JSON.stringify(blob) + "\n");
}

function writeResult(data: string, exitCode: number) {
  const blob = { type: "result", data, exitCode };
  process.stdout.write(JSON.stringify(blob) + "\n");
}

/** Extract text content from an assistant message's content blocks. */
function extractAssistantText(message: any): string {
  if (!message?.message?.content) return "";
  const parts: string[] = [];
  for (const block of message.message.content) {
    if (block.type === "text" && block.text) {
      parts.push(block.text);
    }
  }
  return parts.join("\n");
}

interface ToolUseInfo {
  name: string;
  input: Record<string, unknown>;
}

/** Extract tool use info from an assistant message's content blocks. */
function extractToolUses(message: any): ToolUseInfo[] {
  if (!message?.message?.content) return [];
  const tools: ToolUseInfo[] = [];
  for (const block of message.message.content) {
    if (block.type === "tool_use" && block.name) {
      tools.push({
        name: block.name,
        input: (block.input as Record<string, unknown>) ?? {},
      });
    }
  }
  return tools;
}

/** Extract tool results from a user message's content blocks. */
function extractToolResults(message: any): Record<string, unknown>[] {
  if (!message?.message?.content) return [];
  const results: Record<string, unknown>[] = [];
  for (const block of message.message.content) {
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

  writeStatus("Starting browser agent...");

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
      if (message.type === "assistant") {
        // Emit tool invocations
        const tools = extractToolUses(message);
        for (const tool of tools) {
          writeStatus(tool.name, "tool_use", { tool });
        }

        // Emit assistant text (truncated for sanity)
        const text = extractAssistantText(message);
        if (text) {
          const truncated = text.length > 500 ? text.slice(0, 500) + "…" : text;
          writeStatus(truncated, "assistant");
        }
      }

      if (message.type === "user") {
        // User messages in the SDK loop are tool results
        const results = extractToolResults(message);
        writeStatus("Processing tool results…", "tool_result", {
          result: { tool_results: results },
        });
      }

      if (message.type === "result") {
        gotResult = true;
        if (message.subtype === "success") {
          const success = message as SDKResultSuccess;
          finalReply = success.result ?? "";
          writeStatus(`Completed in ${success.num_turns} turns`);
        } else {
          const error = message as SDKResultError;
          exitCode = 1;
          finalReply = error.errors?.join("\n") ?? "Unknown error";
          writeStatus(`Error after ${error.num_turns} turns`, "error");
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
