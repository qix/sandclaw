import { readFileSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, extname } from "node:path";
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import {
  truncateHead,
  DEFAULT_MAX_BYTES,
  DEFAULT_MAX_LINES,
  formatSize,
} from "@mariozechner/pi-coding-agent";
import { Text } from "@mariozechner/pi-tui";
import { Type } from "@sinclair/typebox";

function shellSplit(str: string): string[] {
  const args: string[] = [];
  let current = "";
  let quote = "";
  for (let i = 0; i < str.length; i++) {
    const ch = str[i];
    if (quote) {
      if (ch === "\\" && quote === '"' && i + 1 < str.length) {
        current += str[++i];
      } else if (ch === quote) {
        quote = "";
      } else {
        current += ch;
      }
    } else if (ch === '"' || ch === "'") {
      quote = ch;
    } else if (ch === "\\" && i + 1 < str.length) {
      current += str[++i];
    } else if (/\s/.test(ch)) {
      if (current) {
        args.push(current);
        current = "";
      }
    } else {
      current += ch;
    }
  }
  if (current) args.push(current);
  return args;
}

const TOOL_DESCRIPTION = `Browser automation via agent-browser CLI.
Workflow: open URL → snapshot -i (get @refs like @e1) → interact → re-snapshot after page changes.
Commands:
  open <url> - Navigate to URL
  snapshot -i - Interactive elements with @refs (re-snapshot after navigation)
  click <@ref> - Click element
  fill <@ref> <text> - Clear and type
  type <@ref> <text> - Type without clearing
  select <@ref> <value> - Select dropdown
  press <key> - Press key (Enter, Tab, etc.)
  scroll <dir> [px] - Scroll (up/down/left/right)
  get text|url|title [@ref] - Get information
  wait <@ref|ms> - Wait for element or time
  screenshot [--full] - Take screenshot (image returned inline)
  close - Close browser
Any valid agent-browser command works.`;

function writeTempFile(content: string, prefix: string): string {
  const dir = mkdtempSync(join(tmpdir(), `pi-browser-${prefix}-`));
  const file = join(dir, "output.txt");
  writeFileSync(file, content);
  return file;
}

export default function agentBrowserExtension(pi: ExtensionAPI) {
  pi.registerTool({
    name: "browser",
    label: "Browser",
    description: TOOL_DESCRIPTION,
    parameters: Type.Object({
      command: Type.String({
        description: "agent-browser command (without 'agent-browser' prefix)",
      }),
    }),

    renderCall(args: { command: string }, theme: any) {
      const text =
        theme.fg("toolTitle", theme.bold("browser ")) +
        theme.fg("accent", args.command);
      return new Text(text, 0, 0);
    },

    renderResult(
      result: any,
      { expanded, isPartial }: { expanded: boolean; isPartial: boolean },
      theme: any,
    ) {
      if (isPartial) {
        return new Text(theme.fg("warning", "Running..."), 0, 0);
      }

      const details = result.details || {};

      if (result.isError || details.error) {
        const errorText = details.error || result.content?.[0]?.text || "Error";
        return new Text(theme.fg("error", errorText), 0, 0);
      }

      const action = details.action || "";
      const content = result.content?.[0]?.text || "";

      if (action === "screenshot") {
        return new Text(
          theme.fg(
            "success",
            `Screenshot saved: ${details.screenshotPath || "unknown"}`,
          ),
          0,
          0,
        );
      }

      if (action === "snapshot") {
        const refCount = (content.match(/@e\d+/g) || []).length;
        let text = theme.fg("success", `${refCount} interactive elements`);
        if (details.truncated) {
          text += theme.fg("warning", " (truncated)");
        }
        if (expanded) {
          text += "\n" + theme.fg("dim", content);
        }
        return new Text(text, 0, 0);
      }

      if (expanded) {
        return new Text(theme.fg("dim", content), 0, 0);
      }

      const firstLine = content.split("\n")[0] || "(no output)";
      const truncated = content.includes("\n") ? "…" : "";
      return new Text(theme.fg("dim", firstLine + truncated), 0, 0);
    },

    async execute(toolCallId, params, signal, onUpdate, ctx) {
      const commandStr = params.command.trim();
      const parts = shellSplit(commandStr);
      const action = parts[0].toLowerCase();

      const result = await pi.exec("agent-browser", parts, {
        signal,
        timeout: 60000,
      });

      if (result.code !== 0) {
        const errorOutput = (result.stderr || result.stdout).trim();
        return {
          content: [
            {
              type: "text",
              text:
                errorOutput || `Command failed with exit code ${result.code}`,
            },
          ],
          details: {
            error: errorOutput,
            exitCode: result.code,
            command: commandStr,
          },
          isError: true,
        };
      }

      const output = result.stdout.trim();

      if (action === "screenshot") {
        const pathMatch = output.match(/saved to (.+)$/i);
        if (pathMatch) {
          const screenshotPath = pathMatch[1].trim();
          try {
            const imageData = readFileSync(screenshotPath);
            const base64 = imageData.toString("base64");
            const ext = extname(screenshotPath).toLowerCase();
            const mimeType =
              ext === ".jpg" || ext === ".jpeg"
                ? "image/jpeg"
                : ext === ".webp"
                  ? "image/webp"
                  : "image/png";
            return {
              content: [
                { type: "text", text: `Screenshot saved: ${screenshotPath}` },
                { type: "image", data: base64, mimeType },
              ],
              details: { command: commandStr, action, screenshotPath },
            };
          } catch (err: any) {
            return {
              content: [
                {
                  type: "text",
                  text: `Screenshot saved to ${screenshotPath} but could not read file: ${err.message}`,
                },
              ],
              details: {
                command: commandStr,
                action,
                screenshotPath,
                readError: err.message,
              },
            };
          }
        }
      }

      const truncation = truncateHead(output, {
        maxLines: DEFAULT_MAX_LINES,
        maxBytes: DEFAULT_MAX_BYTES,
      });

      let resultText = truncation.content;

      if (truncation.truncated) {
        const tempFile = writeTempFile(output, action);
        resultText += `\n\n[Output truncated: ${truncation.outputLines} of ${truncation.totalLines} lines`;
        resultText += ` (${formatSize(truncation.outputBytes)} of ${formatSize(truncation.totalBytes)}).`;
        resultText += ` Full output saved to: ${tempFile}]`;
      }

      return {
        content: [{ type: "text", text: resultText || "(no output)" }],
        details: {
          command: commandStr,
          action,
          truncated: truncation.truncated,
        },
      };
    },
  });

  pi.on("session_shutdown", async (_event, _ctx) => {
    try {
      await pi.exec("agent-browser", ["close"], { timeout: 5000 });
    } catch {
      // Browser may already be closed
    }
  });
}
