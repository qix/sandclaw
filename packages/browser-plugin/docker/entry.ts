import { query, type SDKResultSuccess, type SDKResultError } from "@anthropic-ai/claude-agent-sdk";

// ── helpers ──────────────────────────────────────────────────────────

function log(msg: string) {
  process.stderr.write(`[browser-entry] ${msg}\n`);
}

function writeStatus(message: string) {
  const blob = { type: "status", message, timestamp: new Date().toISOString() };
  process.stdout.write(JSON.stringify(blob) + "\n");
}

function writeResult(data: string, exitCode: number) {
  const blob = { type: "result", data, exitCode };
  process.stdout.write(JSON.stringify(blob) + "\n");
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
  const maxTurns = parseInt(process.env.BROWSER_MAX_TURNS || "30", 10);

  log(`prompt: ${prompt.slice(0, 120)}...`);
  if (startUrl) log(`start URL: ${startUrl}`);
  log(`max turns: ${maxTurns}`);

  // Build system prompt
  const systemParts = [
    "You are a browser automation agent. Use the agent-browser MCP tools to browse the web and complete the user's request.",
    "Return a concise summary of what you found or accomplished.",
  ];
  if (startUrl) {
    systemParts.push(`Start by navigating to: ${startUrl}`);
  }
  const systemPrompt = systemParts.join("\n");

  // Configure agent-browser-mcp as a stdio MCP server
  const mcpServers: Record<string, any> = {
    "agent-browser": {
      command: "npx",
      args: ["agent-browser-mcp"],
    },
  };

  writeStatus("Starting browser agent...");

  let finalReply = "";
  let exitCode = 0;

  try {
    const conversation = query({
      prompt,
      options: {
        systemPrompt,
        maxTurns,
        permissionMode: "bypassPermissions",
        allowDangerouslySkipPermissions: true,
        mcpServers,
      },
    });

    for await (const message of conversation) {
      if (message.type === "assistant") {
        writeStatus("Agent working...");
      }

      if (message.type === "result") {
        if (message.subtype === "success") {
          const success = message as SDKResultSuccess;
          finalReply = success.result ?? "";
          writeStatus(`Completed in ${success.num_turns} turns`);
        } else {
          const error = message as SDKResultError;
          exitCode = 1;
          finalReply = error.errors?.join("\n") ?? "Unknown error";
          writeStatus(`Error after ${error.num_turns} turns`);
        }
      }
    }
  } catch (err: any) {
    exitCode = 1;
    finalReply = `Agent error: ${err.message ?? String(err)}`;
    log(`ERROR: ${finalReply}`);
  }

  writeResult(finalReply, exitCode);
  process.exit(exitCode);
}

main();
