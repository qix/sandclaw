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
 * from `promptsDir` and wraps each in `<PROMPT>` tags.
 *
 * Returns a structured map of `{ filename: wrappedContent }`.
 */
export async function loadPromptsPrompt(
  promptsDir: string,
): Promise<Record<string, string>> {
  const coreFiles = ["IDENTITY.md", "SYSTEM.md", "SOUL.md", "USER.md"];
  const sources: Record<string, string> = {};
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
