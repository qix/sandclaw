import { readdir, readFile, writeFile, mkdir, stat } from "node:fs/promises";
import path from "node:path";
import { localTimestamp } from "@sandclaw/util";
import {
  resolveSecurePath,
  tryReadFile,
  computeDiff,
  registerFileEditRoute,
} from "@sandclaw/gatekeeper-util";
import type { ObsidianVaultIndex } from "./vaultIndex";

const LIST_SKIP_DIRS = new Set([".git", ".obsidian", ".trash", "node_modules"]);

export function registerRoutes(
  app: any,
  db: any,
  vaultRoot: string,
  vaultIndex: ObsidianVaultIndex,
) {
  // POST /search — BM25 search across vault
  app.post("/search", async (c: any) => {
    const body = (await c.req.json()) as { query?: string; limit?: number };
    const query = (body.query ?? "").trim();
    if (!query) return c.json({ error: "query is required" }, 400);
    const limit = Math.min(20, Math.max(1, body.limit ?? 5));

    const { totalMatches, results } = await vaultIndex.search(query, limit);

    return c.json({
      query,
      indexedAt: vaultIndex.indexedAt,
      totalMatches,
      results,
    });
  });

  // POST /list — list files and directories in a vault directory
  app.post("/list", async (c: any) => {
    const body = (await c.req.json()) as { path?: string };
    const dirPath = (body.path ?? "").trim();

    // Empty or "." means vault root
    const absDir =
      dirPath && dirPath !== "."
        ? resolveSecurePath(vaultRoot, dirPath)
        : vaultRoot;
    if (!absDir) return c.json({ error: "path escapes vault" }, 400);

    let entries;
    try {
      entries = await readdir(absDir, { withFileTypes: true });
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === "ENOENT") {
        return c.json({ error: "Directory not found" }, 404);
      }
      if ((e as NodeJS.ErrnoException).code === "ENOTDIR") {
        return c.json({ error: "Path is not a directory" }, 400);
      }
      throw e;
    }

    const relDir = path.relative(vaultRoot, absDir).replace(/\\/g, "/") || ".";

    const items: Array<{ name: string; type: "file" | "directory" }> = [];
    for (const entry of entries) {
      if (entry.name.startsWith(".") || LIST_SKIP_DIRS.has(entry.name))
        continue;
      if (entry.isDirectory()) {
        items.push({ name: entry.name, type: "directory" });
      } else if (entry.isFile()) {
        items.push({ name: entry.name, type: "file" });
      }
    }

    items.sort((a, b) =>
      a.type === b.type
        ? a.name.localeCompare(b.name)
        : a.type === "directory"
          ? -1
          : 1,
    );

    return c.json({ path: relDir, items });
  });

  // POST /read — read a file from the vault
  app.post("/read", async (c: any) => {
    const body = (await c.req.json()) as { path?: string; maxChars?: number };
    let notePath = (body.path ?? "").trim();
    if (!notePath) return c.json({ error: "path is required" }, 400);

    // If bare filename (no directory separators), search the vault tree
    if (!notePath.includes("/") && !notePath.includes("\\")) {
      const matches = await vaultIndex.findByFilename(notePath);
      if (matches.length > 1) {
        return c.json(
          {
            error: `Ambiguous filename "${notePath}" — found ${matches.length} matches: ${matches.join(", ")}`,
          },
          400,
        );
      }
      if (matches.length === 1) {
        notePath = matches[0];
      }
    }

    const absPath = resolveSecurePath(vaultRoot, notePath);
    if (!absPath) return c.json({ error: "path escapes vault" }, 400);

    let content: string;
    let fileStat;
    try {
      [content, fileStat] = await Promise.all([
        readFile(absPath, "utf8"),
        stat(absPath),
      ]);
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === "ENOENT") {
        return c.json({ error: "File not found" }, 404);
      }
      throw e;
    }

    const bytes = Buffer.byteLength(content, "utf8");
    let truncated = false;
    if (body.maxChars && body.maxChars > 0 && content.length > body.maxChars) {
      content = content.slice(0, body.maxChars);
      truncated = true;
    }

    // Normalize the relative path
    const relPath = path.relative(vaultRoot, absPath).replace(/\\/g, "/");

    return c.json({
      path: relPath,
      content,
      truncated,
      bytes,
      modifiedAt: fileStat.mtime.toISOString(),
    });
  });

  // POST /add-daily-task — append a task to a daily note's checkbox section
  app.post("/add-daily-task", async (c: any) => {
    const body = (await c.req.json()) as { path?: string; task?: string };
    const notePath = (body.path ?? "").trim();
    if (!notePath) return c.json({ error: "path is required" }, 400);
    const task = (body.task ?? "").trim();
    if (!task) return c.json({ error: "task is required" }, 400);

    const absPath = resolveSecurePath(vaultRoot, notePath);
    if (!absPath) return c.json({ error: "path escapes vault" }, 400);

    let content: string;
    try {
      content = await readFile(absPath, "utf8");
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === "ENOENT") {
        return c.json({ error: "File not found" }, 404);
      }
      throw e;
    }

    const lines = content.split("\n");
    const cleanTask = task.replace(/\s*#ai/g, "").trim();
    const newLine = `- [ ] ${cleanTask} #ai`;

    // Find the last checkbox line (- [ ] or - [x]) and insert after it
    let lastCheckboxIndex = -1;
    for (let i = 0; i < lines.length; i++) {
      if (/^- \[[ x]\] /.test(lines[i])) {
        lastCheckboxIndex = i;
      }
    }

    if (lastCheckboxIndex >= 0) {
      // Scan past any indented continuation lines (sub-items, notes, etc.)
      // that belong to the last checkbox. Stop at an empty line or a line
      // that doesn't start with whitespace.
      let insertIndex = lastCheckboxIndex + 1;
      while (insertIndex < lines.length) {
        const line = lines[insertIndex];
        if (line === "" || !/^\s/.test(line)) break;
        insertIndex++;
      }
      lines.splice(insertIndex, 0, newLine);
    } else {
      // No checkbox section found — append to end of file
      if (lines[lines.length - 1] !== "") {
        lines.push("");
      }
      lines.push(newLine);
    }

    const nextContent = lines.join("\n");
    await mkdir(path.dirname(absPath), { recursive: true });
    await writeFile(absPath, nextContent, "utf8");
    vaultIndex.markStale();

    const relPath = path.relative(vaultRoot, absPath).replace(/\\/g, "/");
    return c.json({ path: relPath, task: newLine });
  });

  // POST /modify-daily-task — modify an existing #ai task in a daily note
  app.post("/modify-daily-task", async (c: any) => {
    const body = (await c.req.json()) as {
      path?: string;
      original?: string;
      new_content?: string;
    };
    const notePath = (body.path ?? "").trim();
    if (!notePath) return c.json({ error: "path is required" }, 400);
    const original = (body.original ?? "").trim();
    if (!original) return c.json({ error: "original is required" }, 400);
    const newContent = body.new_content ?? "";
    if (typeof newContent !== "string")
      return c.json({ error: "new_content must be a string" }, 400);

    const absPath = resolveSecurePath(vaultRoot, notePath);
    if (!absPath) return c.json({ error: "path escapes vault" }, 400);

    let content: string;
    try {
      content = await readFile(absPath, "utf8");
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === "ENOENT") {
        return c.json({ error: "File not found" }, 404);
      }
      throw e;
    }

    const lines = content.split("\n");
    const matchIndex = lines.findIndex(
      (line) => line.trim() === original.trim(),
    );
    if (matchIndex < 0) {
      return c.json({ error: "Original line not found in file" }, 404);
    }

    // Only allow modifying lines tagged with #ai
    if (!lines[matchIndex].trimEnd().endsWith("#ai")) {
      return c.json({ error: "Can only modify lines that end with #ai" }, 403);
    }

    // Ensure exactly one #ai tag at the end
    const cleanLine = newContent.replace(/\s*#ai/g, "").trimEnd();
    const finalLine = `${cleanLine} #ai`;

    lines[matchIndex] = finalLine;
    const nextContent = lines.join("\n");
    await mkdir(path.dirname(absPath), { recursive: true });
    await writeFile(absPath, nextContent, "utf8");
    vaultIndex.markStale();

    const relPath = path.relative(vaultRoot, absPath).replace(/\\/g, "/");
    return c.json({ path: relPath, original, modified: finalLine });
  });

  // POST /edit — shared route from gatekeeper-util
  registerFileEditRoute(app, { plugin: "obsidian", rootDir: vaultRoot, db });

  // POST /write — custom route with vault index filename resolution
  app.post("/write", async (c: any) => {
    const body = (await c.req.json()) as {
      path?: string;
      content?: string;
      jobContext?: { worker: string; jobId: number };
    };
    let notePath = (body.path ?? "").trim();
    if (!notePath) return c.json({ error: "path is required" }, 400);
    if (typeof body.content !== "string")
      return c.json({ error: "content is required" }, 400);

    // If bare filename (no directory separators), search the vault tree
    if (!notePath.includes("/") && !notePath.includes("\\")) {
      const matches = await vaultIndex.findByFilename(notePath);
      if (matches.length > 1) {
        return c.json(
          {
            error: `Ambiguous filename "${notePath}" — found ${matches.length} matches: ${matches.join(", ")}`,
          },
          400,
        );
      }
      if (matches.length === 1) {
        notePath = matches[0];
      }
    }

    const absPath = resolveSecurePath(vaultRoot, notePath);
    if (!absPath) return c.json({ error: "path escapes vault" }, 400);

    const relPath = path.relative(vaultRoot, absPath).replace(/\\/g, "/");
    const previousContent = (await tryReadFile(absPath)) ?? "";
    const nextContent = body.content;
    const diff = computeDiff(previousContent, nextContent);
    const now = localTimestamp();

    const verificationData = {
      path: relPath,
      previousContent,
      nextContent,
      previousBytes: Buffer.byteLength(previousContent, "utf8"),
      nextBytes: Buffer.byteLength(nextContent, "utf8"),
      diff,
      createdAt: now,
    };

    const [id] = await db("verification_requests").insert({
      plugin: "obsidian",
      action: "write_file",
      data: JSON.stringify(verificationData),
      status: "pending",
      ...(body.jobContext
        ? { job_context: JSON.stringify(body.jobContext) }
        : {}),
      created_at: now,
      updated_at: now,
    });

    return c.json(
      {
        verificationRequestId: id,
        path: relPath,
        status: "pending",
        diff: {
          added: diff.added,
          removed: diff.removed,
          unchanged: diff.unchanged,
          truncated: diff.truncated,
          totalLines: diff.totalLines,
        },
      },
      202,
    );
  });
}
