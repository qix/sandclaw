import { readFile, readdir } from "node:fs/promises";
import path from "node:path";

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
  let files: string[];
  try {
    const entries = await readdir(skillsDir);
    files = entries.filter((f) => f.endsWith(".md")).sort();
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return "";
    throw error;
  }

  const skillPrompts = await Promise.all(
    files.map(async (filename) => {
      const content = await tryReadFile(path.join(skillsDir, filename));
      if (!content) return null;
      return wrapSkill(filename, content);
    }),
  );

  return skillPrompts.filter((p): p is string => p !== null).join("\n");
}
