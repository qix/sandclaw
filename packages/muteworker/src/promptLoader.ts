import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

async function listFiles(basePath: string): Promise<string[]> {
  const entries = await readdir(basePath, { withFileTypes: true }).catch((error) => {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw error;
  });
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
  return readFile(filePath, 'utf8').catch((error) => {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw error;
  });
}

function wrapPrompt(tag: string, filename: string, content: string): string {
  const name = filename.endsWith('.md') ? filename.slice(0, -3) : filename;
  return `File: ${name}\n<${tag.toUpperCase()}>\n${content.trim()}\n</${tag.toUpperCase()}>`;
}

/**
 * Loads the agent's system prompt from `promptsDir` and memory files from
 * `memoryDir`.  Both directories are optional; missing files are skipped
 * gracefully.
 */
export async function loadSystemPrompt(promptsDir: string, memoryDir: string): Promise<string> {
  const coreFiles = ['IDENTITY.md', 'SYSTEM.md', 'SOUL.md', 'USER.md'];
  const corePrompts = await Promise.all(
    coreFiles.map(async (filename) => {
      const content = await tryReadFile(path.join(promptsDir, filename));
      if (!content) return null;
      return wrapPrompt('prompts', filename, content);
    }),
  );

  const memoryFilenames = await listFiles(memoryDir);
  const memoryPrompts = await Promise.all(
    memoryFilenames.map(async (filename) => {
      const content = await tryReadFile(path.join(memoryDir, filename));
      if (!content) return null;
      return wrapPrompt('memory', filename, content);
    }),
  );

  return [...corePrompts, ...memoryPrompts]
    .filter((p): p is string => p !== null)
    .join('\n');
}
