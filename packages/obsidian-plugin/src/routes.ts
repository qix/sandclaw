import { readdir, readFile, writeFile, mkdir, stat } from "node:fs/promises";
import path from "node:path";
import { localTimestamp } from "@sandclaw/util";
import { resolveVaultPath, tryReadFile } from "./pathUtils";
import { computeDiff } from "./diff";
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
        ? resolveVaultPath(vaultRoot, dirPath)
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

    const absPath = resolveVaultPath(vaultRoot, notePath);
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

  // POST /write — create a verification request for a vault write
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

    const absPath = resolveVaultPath(vaultRoot, notePath);
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
