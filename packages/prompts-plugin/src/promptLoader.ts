import { readFile } from "node:fs/promises";
import path from "node:path";

async function tryReadFile(filePath: string): Promise<string | null> {
  return readFile(filePath, "utf8").catch((error) => {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  });
}

function escapeHTML(str: string) {
  const p = {
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;",
  };
  return str.replace(/[&<>"']/g, ((s: keyof typeof p) => p[s]) as any);
}

function wrapPrompt(filename: string, content: string): string {
  return `<PROMPT filename="${escapeHTML(filename)}">\n${content.trim()}\n</PROMPT>`;
}

function promptAccessInstructions(promptsDir: string): string {
  return [
    `Prompt files live at \`${promptsDir}\`.`,
    "To read or search them, use the built-in Read, Grep, and Glob tools with that absolute path.",
    "To modify them, use the `write_prompt_file`, `edit_prompt_file`, or `verified_write_prompt_file` tools — direct writes via Write/Edit are not allowed.",
  ].join("\n");
}

/**
 * Loads the core prompt files (IDENTITY.md, SYSTEM.md, SOUL.md, USER.md)
 * from `promptsDir` and wraps each in `<PROMPT>` tags.
 *
 * Returns a structured map of `{ filename: wrappedContent }`, plus a
 * `prompts/_access` entry telling the agent how to read/write prompt
 * files using built-in tools and plugin tools.
 */
export async function loadPromptsPrompt(
  promptsDir: string,
): Promise<Record<string, string>> {
  const coreFiles = ["IDENTITY.md", "SYSTEM.md", "SOUL.md", "USER.md"];
  const sources: Record<string, string> = {
    "prompts/_access": promptAccessInstructions(promptsDir),
  };
  await Promise.all(
    coreFiles.map(async (filename) => {
      const content = await tryReadFile(path.join(promptsDir, filename));
      if (content) {
        sources[filename] = wrapPrompt(filename, content);
      }
    }),
  );
  return sources;
}
