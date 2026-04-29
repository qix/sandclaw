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

function memoryAccessInstructions(memoryDir: string): string {
  return [
    `Memory files live at \`${memoryDir}\`.`,
    "To read or search them, use the built-in Read, Grep, and Glob tools with that absolute path.",
    "To modify them, use the `write_memory_file` and `edit_memory_file` tools — direct writes via Write/Edit are not allowed.",
  ].join("\n");
}

/**
 * Loads all files from `memoryDir` and wraps them in `<MEMORY>` tags
 * for inclusion in the system prompt.
 *
 * Returns a structured map of `{ "memory/filename": wrappedContent }`,
 * plus a `memory/_access` entry telling the agent how to read/write
 * memory files using built-in tools and plugin tools.
 */
export async function loadMemoryPrompt(
  memoryDir: string,
): Promise<Record<string, string>> {
  const memoryFilenames = await listFiles(memoryDir);
  const sources: Record<string, string> = {
    "memory/_access": memoryAccessInstructions(memoryDir),
  };
  await Promise.all(
    memoryFilenames.map(async (filename) => {
      const content = await tryReadFile(path.join(memoryDir, filename));
      if (content) {
        sources[`memory/${filename}`] = wrapMemory(filename, content);
      }
    }),
  );
  return sources;
}
