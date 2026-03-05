import { readFile, writeFile, mkdir, stat } from "node:fs/promises";
import path from "node:path";
import { resolveVaultPath, tryReadFile } from "./pathUtils";
import { computeDiff } from "./diff";
import type { ObsidianVaultIndex } from "./vaultIndex";

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

  // POST /read — read a file from the vault
  app.post("/read", async (c: any) => {
    const body = (await c.req.json()) as { path?: string; maxChars?: number };
    const notePath = (body.path ?? "").trim();
    if (!notePath) return c.json({ error: "path is required" }, 400);

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
      append?: boolean;
    };
    const notePath = (body.path ?? "").trim();
    if (!notePath) return c.json({ error: "path is required" }, 400);
    if (typeof body.content !== "string")
      return c.json({ error: "content is required" }, 400);

    const absPath = resolveVaultPath(vaultRoot, notePath);
    if (!absPath) return c.json({ error: "path escapes vault" }, 400);

    const relPath = path.relative(vaultRoot, absPath).replace(/\\/g, "/");
    const append = body.append === true;
    const previousContent = (await tryReadFile(absPath)) ?? "";
    const nextContent = append ? previousContent + body.content : body.content;
    const mode = append ? "append" : "overwrite";
    const diff = computeDiff(previousContent, nextContent);
    const now = Date.now();

    const verificationData = {
      path: relPath,
      mode,
      previousContent,
      nextContent,
      previousBytes: Buffer.byteLength(previousContent, "utf8"),
      nextBytes: Buffer.byteLength(nextContent, "utf8"),
      diff,
      createdAt: new Date(now).toISOString(),
    };

    const [id] = await db("verification_requests").insert({
      plugin: "obsidian",
      action: "write_file",
      data: JSON.stringify(verificationData),
      status: "pending",
      created_at: now,
      updated_at: now,
    });

    return c.json(
      {
        verificationRequestId: id,
        path: relPath,
        mode,
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

  // POST /approve/:id — approve and execute a vault write
  app.post("/approve/:id", async (c: any) => {
    const id = parseInt(c.req.param("id"), 10);
    if (!id || isNaN(id)) return c.json({ error: "Invalid id" }, 400);

    const request = await db("verification_requests").where("id", id).first();
    if (
      !request ||
      request.status !== "pending" ||
      request.plugin !== "obsidian"
    ) {
      return c.json({ error: "Not found or already resolved" }, 404);
    }

    const verificationData = JSON.parse(request.data);
    const absPath = resolveVaultPath(vaultRoot, verificationData.path);
    if (!absPath)
      return c.json({ error: "Invalid path in verification data" }, 500);

    // Re-read the file and verify it hasn't changed
    const currentContent = (await tryReadFile(absPath)) ?? "";
    if (currentContent !== verificationData.previousContent) {
      return c.json(
        {
          error:
            "File changed since verification was created. Please re-request the write.",
        },
        409,
      );
    }

    // Write the file
    try {
      await mkdir(path.dirname(absPath), { recursive: true });
      await writeFile(absPath, verificationData.nextContent, "utf8");
    } catch (e) {
      return c.json(
        { error: `File system error: ${(e as Error).message}` },
        500,
      );
    }

    vaultIndex.markStale();

    await db("verification_requests")
      .where("id", id)
      .update({ status: "approved", updated_at: Date.now() });

    return c.json({
      success: true,
      path: verificationData.path,
      bytes: Buffer.byteLength(verificationData.nextContent, "utf8"),
    });
  });
}
