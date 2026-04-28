import { readFile, writeFile, mkdir, readdir } from "node:fs/promises";
import path from "node:path";
import { generateFileEditorScript } from "./fileEditorScript";

/**
 * Recursively list all files under `dirPath`, returning paths relative to it.
 * Returns an empty array if the directory does not exist.
 */
export async function listDir(dirPath: string): Promise<string[]> {
  let entries;
  try {
    entries = await readdir(dirPath, { withFileTypes: true });
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw err;
  }
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

function validateRelativePath(
  inputPath: string,
  rootDir: string,
  dirLabel: string,
): string {
  const normalized = inputPath.trim().replaceAll("\\", "/");
  if (!normalized) throw new Error("file path cannot be empty");
  if (path.isAbsolute(normalized))
    throw new Error("file path must be relative");
  const absolute = path.resolve(rootDir, normalized);
  const relative = path.relative(rootDir, absolute);
  if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error(`path escapes ${dirLabel} directory`);
  }
  return relative.replaceAll("\\", "/");
}

export interface FileEditorRoutesOptions {
  /**
   * ID prefix used in HTML element IDs by the panel and the client script.
   * Must match the `prefix` passed to `<FileEditorPanel>` on the React side.
   */
  prefix: string;
  /** Absolute path to the directory whose contents the editor manages. */
  dir: string;
  /**
   * Public URL base the browser uses to call the routes
   * (e.g. `/api/prompts` or `/api/email/queue`). Used inside the generated client script.
   */
  apiBase: string;
  /**
   * Mount path inside the sub-app passed to this function. Defaults to `""`,
   * which mounts at the sub-app's root. Used for plugins that nest the editor
   * under a sub-route (e.g. the email plugin uses `"/queue"`).
   */
  basePath?: string;
  /** Dialog text shown by the "new file" button. */
  newFilePrompt: string;
  /** Empty-state message shown when the directory has no files. */
  emptyMessage: string;
  /** Human-readable directory label used in path-escape error messages. Defaults to `prefix`. */
  dirLabel?: string;
}

/**
 * Register the four routes that back a `<FileEditorPanel>`:
 *   GET  {basePath}/client.js   — the client script bound to `prefix` and `apiBase`
 *   GET  {basePath}/files       — list files (recursive) under `dir`
 *   GET  {basePath}/file?path=  — read a file
 *   POST {basePath}/file        — write a file (creates parent dirs)
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function registerFileEditorRoutes(
  app: any,
  opts: FileEditorRoutesOptions,
): void {
  const {
    prefix,
    dir,
    apiBase,
    basePath = "",
    newFilePrompt,
    emptyMessage,
    dirLabel = prefix,
  } = opts;

  const clientJs = generateFileEditorScript({
    prefix,
    apiBase,
    newFilePrompt,
    emptyMessage,
  });

  app.get(`${basePath}/client.js`, (c: any) => {
    return c.body(clientJs, 200, {
      "Content-Type": "application/javascript",
      "Cache-Control": "no-cache",
    });
  });

  app.get(`${basePath}/files`, async (c: any) => {
    const files = await listDir(dir);
    return c.json({ files });
  });

  app.get(`${basePath}/file`, async (c: any) => {
    const filePath = c.req.query("path");
    if (!filePath) return c.json({ error: "path is required" }, 400);

    let relative: string;
    try {
      relative = validateRelativePath(filePath, dir, dirLabel);
    } catch (e) {
      return c.json({ error: (e as Error).message }, 400);
    }

    const absolutePath = path.join(dir, relative);
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

  app.post(`${basePath}/file`, async (c: any) => {
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
      relative = validateRelativePath(filePath, dir, dirLabel);
    } catch (e) {
      return c.json({ error: (e as Error).message }, 400);
    }

    const absolutePath = path.join(dir, relative);
    await mkdir(path.dirname(absolutePath), { recursive: true });
    await writeFile(absolutePath, body.content, "utf8");

    return c.json({
      path: relative,
      bytes: Buffer.byteLength(body.content, "utf8"),
    });
  });
}
