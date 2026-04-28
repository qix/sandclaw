import { TSchema } from "@mariozechner/pi-ai";
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { MuteworkerPluginContext } from "@sandclaw/muteworker-plugin-api";
import { createFileEditTool, createFileWriteTool } from "@sandclaw/gatekeeper-util";

export function createPromptTools(
  ctx: MuteworkerPluginContext,
  promptsDir: string,
) {
  return [
    {
      name: "list_prompt_files",
      label: "List Prompt Files",
      description:
        "List all files available under prompts/. Use this before reading or writing prompt files.",
      parameters: {
        type: "object",
        properties: {},
        additionalProperties: false,
      } as unknown as TSchema,
      execute: async () => {
        const files = await listDir(promptsDir).catch((error) => {
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
                  : "No prompt files found in prompts/.",
            },
          ],
          details: { files },
        };
      },
    },
    {
      name: "read_prompt_file",
      label: "Read Prompt File",
      description:
        "Read a UTF-8 text file from prompts/. Path must be relative to prompts/.",
      parameters: {
        type: "object",
        properties: { path: { type: "string" } },
        required: ["path"],
        additionalProperties: false,
      } as unknown as TSchema,
      execute: async (_toolCallId: string, params: any) => {
        const relativePath = validateRelativePath(
          String(params.path),
          promptsDir,
          "prompts/",
        );
        const absolutePath = path.join(promptsDir, relativePath);
        const contents = await readFile(absolutePath, "utf8");
        ctx.artifacts.push({
          type: "text",
          label: "Prompt Read",
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
      name: "write_prompt_file",
      label: "Write Prompt File",
      description:
        "Write UTF-8 text to a file in prompts/. Path must be relative to prompts/.",
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
          promptsDir,
          "prompts/",
        );
        const absolutePath = path.join(promptsDir, relativePath);
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
          label: "Prompt Write",
          value: relativePath,
        });
        return {
          content: [
            {
              type: "text",
              text: `Wrote ${Buffer.byteLength(contents, "utf8")} bytes to prompts/${relativePath}`,
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
    createFileEditTool(ctx, {
      name: "edit_prompt_file",
      label: "Edit Prompt File",
      description:
        "Create a verification request to perform a targeted string replacement in a prompt file. " +
        "Specify old_string (text to find) and new_string (replacement). " +
        "old_string must be unique in the file unless replace_all is true. " +
        "No changes will be made until a human approves the verification request.",
      artifactLabel: "Prompt Edit Request",
      apiBase: "/api/prompts",
    }),
    createFileWriteTool(ctx, {
      name: "verified_write_prompt_file",
      label: "Verified Write Prompt File",
      description:
        "Create a verification request to overwrite a prompt file. " +
        "The entire file will be overwritten. " +
        "No changes will be made until a human approves the verification request.",
      artifactLabel: "Prompt Write Request",
      apiBase: "/api/prompts",
    }),
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
