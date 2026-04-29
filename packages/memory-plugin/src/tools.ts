import { TSchema } from "@mariozechner/pi-ai";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { MuteworkerPluginContext } from "@sandclaw/muteworker-plugin-api";
import { createFileEditTool } from "@sandclaw/gatekeeper-util";

export function createMemoryTools(
  ctx: MuteworkerPluginContext,
  memoryDir: string,
) {
  return [
    {
      name: "write_memory_file",
      label: "Write Memory File",
      description:
        "Write UTF-8 text to a file in memory/. Path must be relative to memory/.",
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
          memoryDir,
          "memory/",
        );
        const absolutePath = path.join(memoryDir, relativePath);
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
          label: "Memory Write",
          value: relativePath,
        });
        return {
          content: [
            {
              type: "text",
              text: `Wrote ${Buffer.byteLength(contents, "utf8")} bytes to memory/${relativePath}`,
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
      name: "edit_memory_file",
      label: "Edit Memory File",
      description:
        "Perform a targeted string replacement in a memory file. " +
        "Specify old_string (text to find) and new_string (replacement). " +
        "old_string must be unique in the file unless replace_all is true. " +
        "This action is applied immediately.",
      artifactLabel: "Memory Edit",
      apiBase: "/api/memory",
      requireVerification: false,
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
