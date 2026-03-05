import { readFile } from "node:fs/promises";
import path from "node:path";

async function tryReadFile(filePath: string): Promise<string | null> {
  return readFile(filePath, "utf8").catch((error) => {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  });
}

function wrapPrompt(filename: string, content: string): string {
  const name = filename.endsWith(".md") ? filename.slice(0, -3) : filename;
  return `File: ${name}\n<PROMPTS>\n${content.trim()}\n</PROMPTS>`;
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
