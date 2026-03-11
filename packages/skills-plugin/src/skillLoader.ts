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

function wrapSkill(filename: string, content: string): string {
  const name = filename.endsWith(".md") ? filename.slice(0, -3) : filename;
  return `File: ${name}\n<SKILLS>\n${content.trim()}\n</SKILLS>`;
}

/**
 * Loads all skill files from `skillsDir` and wraps each in `<SKILLS>` tags.
 */
export async function loadSkillsPrompt(skillsDir: string): Promise<string> {
  const filenames = await listFiles(skillsDir);
  const skillPrompts = await Promise.all(
    filenames.map(async (filename) => {
      const content = await tryReadFile(path.join(skillsDir, filename));
      if (!content) return null;
      return wrapSkill(filename, content);
    }),
  );

  return skillPrompts.filter((p): p is string => p !== null).join("\n");
}
