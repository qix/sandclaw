import { readFile } from "node:fs/promises";
import path from "node:path";
import { localTimestamp } from "@sandclaw/util";
import { resolveSecurePath, tryReadFile } from "./pathUtils";
import { computeDiff } from "./diff";

export interface FileRouteConfig {
  /** Plugin name stored in the verification_requests table. */
  plugin: string;
  /** Absolute path to the root directory that files are resolved against. */
  rootDir: string;
  /** Knex database instance. */
  db: any;
}

/**
 * Register a `POST /edit` route that creates a verification request for a
 * targeted find/replace edit on a file.
 */
export function registerFileEditRoute(app: any, config: FileRouteConfig): void {
  const { plugin, rootDir, db } = config;

  app.post("/edit", async (c: any) => {
    const body = (await c.req.json()) as {
      path?: string;
      old_string?: string;
      new_string?: string;
      replace_all?: boolean;
      jobContext?: { worker: string; jobId: number };
    };
    const notePath = (body.path ?? "").trim();
    if (!notePath) return c.json({ error: "path is required" }, 400);
    if (typeof body.old_string !== "string" || !body.old_string)
      return c.json({ error: "old_string is required" }, 400);
    if (typeof body.new_string !== "string")
      return c.json({ error: "new_string must be a string" }, 400);
    if (body.old_string === body.new_string)
      return c.json({ error: "old_string and new_string must differ" }, 400);

    const absPath = resolveSecurePath(rootDir, notePath);
    if (!absPath) return c.json({ error: "path escapes root directory" }, 400);

    let content: string;
    try {
      content = await readFile(absPath, "utf8");
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === "ENOENT") {
        return c.json({ error: "File not found" }, 404);
      }
      throw e;
    }

    const oldString = body.old_string;
    const newString = body.new_string;
    const replaceAll = body.replace_all === true;

    const firstIndex = content.indexOf(oldString);
    if (firstIndex < 0) {
      return c.json({ error: "old_string not found in file" }, 400);
    }

    if (!replaceAll) {
      const secondIndex = content.indexOf(oldString, firstIndex + 1);
      if (secondIndex >= 0) {
        return c.json(
          {
            error:
              "old_string is not unique in the file. Provide more context to make it unique, or set replace_all to true.",
          },
          400,
        );
      }
    }

    let nextContent: string;
    if (replaceAll) {
      nextContent = content.split(oldString).join(newString);
    } else {
      nextContent =
        content.slice(0, firstIndex) +
        newString +
        content.slice(firstIndex + oldString.length);
    }

    const relPath = path.relative(rootDir, absPath).replace(/\\/g, "/");
    const diff = computeDiff(content, nextContent);
    const now = localTimestamp();

    const verificationData = {
      path: relPath,
      oldString,
      newString,
      replaceAll,
      previousContent: content,
      nextContent,
      previousBytes: Buffer.byteLength(content, "utf8"),
      nextBytes: Buffer.byteLength(nextContent, "utf8"),
      diff,
      createdAt: now,
    };

    const [id] = await db("verification_requests").insert({
      plugin,
      action: "edit_file",
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

/**
 * Register a `POST /write` route that creates a verification request to
 * overwrite a file with new content.
 */
export function registerFileWriteRoute(
  app: any,
  config: FileRouteConfig,
): void {
  const { plugin, rootDir, db } = config;

  app.post("/write", async (c: any) => {
    const body = (await c.req.json()) as {
      path?: string;
      content?: string;
      jobContext?: { worker: string; jobId: number };
    };
    const notePath = (body.path ?? "").trim();
    if (!notePath) return c.json({ error: "path is required" }, 400);
    if (typeof body.content !== "string")
      return c.json({ error: "content is required" }, 400);

    const absPath = resolveSecurePath(rootDir, notePath);
    if (!absPath) return c.json({ error: "path escapes root directory" }, 400);

    const relPath = path.relative(rootDir, absPath).replace(/\\/g, "/");
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
      plugin,
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
