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

function extractDescription(content: string): string | null {
  const match = content.match(/^---\s*\n([\s\S]*?)\n---/);
  if (!match) return null;
  const descMatch = match[1].match(/^description:\s*"?([^"\n]+)"?\s*$/m);
  return descMatch ? descMatch[1].trim() : null;
}

/**
 * Loads skill filenames and frontmatter descriptions from `skillsDir`.
 * Only the filename and description are included in the system prompt;
 * the agent can use `read_skill_file` to fetch full content on demand.
 *
 * Returns a structured map with a single `"SKILLS"` key.
 */
export async function loadSkillsPrompt(
  skillsDir: string,
): Promise<Record<string, string>> {
  const filenames = await listFiles(skillsDir);
  const entries = await Promise.all(
    filenames.map(async (filename) => {
      const content = await tryReadFile(path.join(skillsDir, filename));
      if (!content) return null;
      const description = extractDescription(content);
      return `- ${filename}: ${description ?? "(no description)"}`;
    }),
  );

  const lines = entries.filter((e): e is string => e !== null);
  if (lines.length === 0) return {};

  return {
    SKILLS: `<SKILLS>\nAvailable skills (use \`read_skill_file\` to fetch full details):\n${lines.join("\n")}\n</SKILLS>`,
  };
}
