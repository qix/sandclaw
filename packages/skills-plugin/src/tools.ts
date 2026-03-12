import { TSchema } from "@mariozechner/pi-ai";
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { MuteworkerPluginContext } from "@sandclaw/muteworker-plugin-api";

function extractDescription(content: string): string | null {
  const match = content.match(/^---\s*\n([\s\S]*?)\n---/);
  if (!match) return null;
  const descMatch = match[1].match(/^description:\s*"?([^"\n]+)"?\s*$/m);
  return descMatch ? descMatch[1].trim() : null;
}

export function createSkillTools(
  ctx: MuteworkerPluginContext,
  skillsDir: string,
) {
  return [
    {
      name: "list_skills",
      label: "List Skills",
      description:
        "List all skills with their descriptions. Returns skill filenames and descriptions for use in the system prompt.",
      parameters: {
        type: "object",
        properties: {},
        additionalProperties: false,
      } as unknown as TSchema,
      execute: async () => {
        const files = await listDir(skillsDir).catch((error) => {
          if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
          throw error;
        });

        if (files.length === 0) {
          return {
            content: [{ type: "text", text: "No skills found." }],
            details: { skills: [] },
          };
        }

        const entries = await Promise.all(
          files.map(async (filename) => {
            const content = await readFile(
              path.join(skillsDir, filename),
              "utf8",
            ).catch(() => null);
            const description = content ? extractDescription(content) : null;
            return { filename, description };
          }),
        );

        const lines = entries.map(
          (e) => `# ${e.filename}\n${e.description ?? "(no description)"}`,
        );
        const block = `<SKILLS>\nThe following is a list of skill names and their descriptions. Use the \`skill_read\` tool to fetch more details.\n\n${lines.join("\n\n")}\n</SKILLS>`;

        return {
          content: [{ type: "text", text: block }],
          details: { skills: entries },
        };
      },
    },
    {
      name: "list_skill_files",
      label: "List Skill Files",
      description:
        "List all files available under skills/. Use this before reading or writing skill files.",
      parameters: {
        type: "object",
        properties: {},
        additionalProperties: false,
      } as unknown as TSchema,
      execute: async () => {
        const files = await listDir(skillsDir).catch((error) => {
          if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
          throw error;
        });
        return {
          content: [
            {
              type: "text",
              text:
                files.length > 0
                  ? files.join("\n")
                  : "No skill files found in skills/.",
            },
          ],
          details: { files },
        };
      },
    },
    {
      name: "read_skill_file",
      label: "Read Skill File",
      description:
        "Read a UTF-8 text file from skills/. Path must be relative to skills/.",
      parameters: {
        type: "object",
        properties: { path: { type: "string" } },
        required: ["path"],
        additionalProperties: false,
      } as unknown as TSchema,
      execute: async (_toolCallId: string, params: any) => {
        const relativePath = validateRelativePath(
          String(params.path),
          skillsDir,
          "skills/",
        );
        const absolutePath = path.join(skillsDir, relativePath);
        const contents = await readFile(absolutePath, "utf8");
        ctx.artifacts.push({
          type: "text",
          label: "Skill Read",
          value: relativePath,
        });
        return {
          content: [{ type: "text", text: contents }],
          details: {
            path: relativePath,
            bytes: Buffer.byteLength(contents, "utf8"),
          },
        };
      },
    },
    {
      name: "write_skill_file",
      label: "Write Skill File",
      description:
        "Write UTF-8 text to a file in skills/. Path must be relative to skills/.",
      parameters: {
        type: "object",
        properties: {
          path: { type: "string" },
          content: { type: "string" },
          append: { type: "boolean" },
        },
        required: ["path", "content"],
        additionalProperties: false,
      } as unknown as TSchema,
      execute: async (_toolCallId: string, params: any) => {
        const relativePath = validateRelativePath(
          String(params.path),
          skillsDir,
          "skills/",
        );
        const absolutePath = path.join(skillsDir, relativePath);
        const contents = String(params.content);
        const append = Boolean(params.append);

        await mkdir(path.dirname(absolutePath), { recursive: true });
        if (append) {
          const current = await readFile(absolutePath, "utf8").catch(
            (error) => {
              if ((error as NodeJS.ErrnoException).code === "ENOENT") return "";
              throw error;
            },
          );
          await writeFile(absolutePath, `${current}${contents}`, "utf8");
        } else {
          await writeFile(absolutePath, contents, "utf8");
        }

        ctx.artifacts.push({
          type: "text",
          label: "Skill Write",
          value: relativePath,
        });
        return {
          content: [
            {
              type: "text",
              text: `Wrote ${Buffer.byteLength(contents, "utf8")} bytes to skills/${relativePath}`,
            },
          ],
          details: {
            path: relativePath,
            append,
            bytes: Buffer.byteLength(contents, "utf8"),
          },
        };
      },
    },
  ];
}

function validateRelativePath(
  inputPath: string,
  rootDir: string,
  label: string,
): string {
  const normalized = inputPath.trim().replaceAll("\\", "/");
  if (!normalized) throw new Error(`${label} file path cannot be empty`);
  if (path.isAbsolute(normalized))
    throw new Error(`${label} file path must be relative`);
  const absolute = path.resolve(rootDir, normalized);
  const relative = path.relative(rootDir, absolute);
  if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error(`Path escapes ${label} and is not allowed`);
  }
  return relative.replaceAll("\\", "/");
}

async function listDir(dirPath: string): Promise<string[]> {
  const entries = await readdir(dirPath, { withFileTypes: true });
  const files = await Promise.all(
    entries.map(async (entry) => {
      const abs = path.join(dirPath, entry.name);
      if (entry.isDirectory()) {
        const sub = await listDir(abs);
        return sub.map((f) => `${entry.name}/${f}`);
      }
      return entry.isFile() ? [entry.name] : [];
    }),
  );
  return files.flat().sort((a, b) => a.localeCompare(b));
}
