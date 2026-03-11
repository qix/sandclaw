import { readFile, writeFile, mkdir, readdir } from "node:fs/promises";
import path from "node:path";
import { generateFileEditorScript } from "@sandclaw/ui";

/**
 * Recursively list all files under `dirPath`, returning paths relative to it.
 */
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

function validateRelativePath(inputPath: string, rootDir: string): string {
  const normalized = inputPath.trim().replaceAll("\\", "/");
  if (!normalized) throw new Error("file path cannot be empty");
  if (path.isAbsolute(normalized))
    throw new Error("file path must be relative");
  const absolute = path.resolve(rootDir, normalized);
  const relative = path.relative(rootDir, absolute);
  if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error("path escapes prompts directory");
  }
  return relative.replaceAll("\\", "/");
}

export function registerRoutes(app: any, promptsDir: string) {
  // GET /client.js — serve the file-editor client script
  const clientJs = generateFileEditorScript({
    prefix: "prompts",
    apiBase: "/api/prompts",
    newFilePrompt: "New prompt file name (e.g. CONTEXT.md):",
    emptyMessage: "No prompt files yet",
  });

  app.get("/client.js", (c: any) => {
    return c.body(clientJs, 200, {
      "Content-Type": "application/javascript",
      "Cache-Control": "no-cache",
    });
  });

  // GET /files — list all prompt files
  app.get("/files", async (c: any) => {
    const files = await listDir(promptsDir).catch((error) => {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
      throw error;
    });
    return c.json({ files });
  });

  // GET /file?path=... — read a prompt file
  app.get("/file", async (c: any) => {
    const filePath = c.req.query("path");
    if (!filePath) return c.json({ error: "path is required" }, 400);

    let relative: string;
    try {
      relative = validateRelativePath(filePath, promptsDir);
    } catch (e) {
      return c.json({ error: (e as Error).message }, 400);
    }

    const absolutePath = path.join(promptsDir, relative);
    try {
      const content = await readFile(absolutePath, "utf8");
      return c.json({ path: relative, content });
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === "ENOENT") {
        return c.json({ error: "File not found" }, 404);
      }
      throw e;
    }
  });

  // POST /file — save a prompt file
  app.post("/file", async (c: any) => {
    const body = (await c.req.json()) as {
      path?: string;
      content?: string;
    };

    const filePath = (body.path ?? "").trim();
    if (!filePath) return c.json({ error: "path is required" }, 400);
    if (typeof body.content !== "string")
      return c.json({ error: "content is required" }, 400);

    let relative: string;
    try {
      relative = validateRelativePath(filePath, promptsDir);
    } catch (e) {
      return c.json({ error: (e as Error).message }, 400);
    }

    const absolutePath = path.join(promptsDir, relative);
    await mkdir(path.dirname(absolutePath), { recursive: true });
    await writeFile(absolutePath, body.content, "utf8");

    return c.json({
      path: relative,
      bytes: Buffer.byteLength(body.content, "utf8"),
    });
  });
}
