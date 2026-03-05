import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

async function listFiles(basePath: string): Promise<string[]> {
  const entries = await readdir(basePath, { withFileTypes: true }).catch(
    (error) => {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
      throw error;
    },
  );
  const files = await Promise.all(
    entries.map(async (entry) => {
      if (entry.isDirectory()) {
        const sub = await listFiles(path.join(basePath, entry.name));
        return sub.map((f) => path.join(entry.name, f));
      }
      return entry.isFile() ? [entry.name] : [];
    }),
  );
  return files.flat().sort((a, b) => a.localeCompare(b));
}

async function tryReadFile(filePath: string): Promise<string | null> {
  return readFile(filePath, "utf8").catch((error) => {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  });
}

function wrapMemory(filename: string, content: string): string {
  const name = filename.endsWith(".md") ? filename.slice(0, -3) : filename;
  return `File: ${name}\n<MEMORY>\n${content.trim()}\n</MEMORY>`;
}

/**
 * Loads all files from `memoryDir` and wraps them in `<MEMORY>` tags
 * for inclusion in the system prompt.
 */
export async function loadMemoryPrompt(memoryDir: string): Promise<string> {
  const memoryFilenames = await listFiles(memoryDir);
  const memoryPrompts = await Promise.all(
    memoryFilenames.map(async (filename) => {
      const content = await tryReadFile(path.join(memoryDir, filename));
      if (!content) return null;
      return wrapMemory(filename, content);
    }),
  );

  return memoryPrompts.filter((p): p is string => p !== null).join("\n");
}
