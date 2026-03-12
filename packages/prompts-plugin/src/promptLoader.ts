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

/**
 * Loads the core prompt files (IDENTITY.md, SYSTEM.md, SOUL.md, USER.md)
 * from `promptsDir` and wraps each in `<PROMPTS>` tags.
 */
export async function loadPromptsPrompt(promptsDir: string): Promise<string> {
  const coreFiles = ["IDENTITY.md", "SYSTEM.md", "SOUL.md", "USER.md"];
  const corePrompts = await Promise.all(
    coreFiles.map(async (filename) => {
      const content = await tryReadFile(path.join(promptsDir, filename));
      if (!content) return null;
      return wrapPrompt(filename, content);
    }),
  );

  return corePrompts.filter((p): p is string => p !== null).join("\n");
}
