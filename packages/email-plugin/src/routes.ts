import { readFile, writeFile, mkdir, readdir } from "node:fs/promises";
import path from "node:path";
import { generateFileEditorScript } from "@sandclaw/ui";
import {
  sendEmail,
  queryUnseenEmails,
  queryInboxEmails,
  searchEmails,
  getEmails,
  markAsRead,
  type EmailPluginConfig,
} from "./jmapClient";

async function isWatchInboxEnabled(db: any): Promise<boolean> {
  const row = await db("plugin_kv")
    .where({ plugin: "email", key: "watch_inbox" })
    .first();
  return row?.value === "true";
}

export function registerRoutes(app: any, db: any, config: EmailPluginConfig) {
  // GET /settings/watch-inbox — read current toggle state
  app.get("/settings/watch-inbox", async (c: any) => {
    const enabled = await isWatchInboxEnabled(db);
    return c.json({ enabled });
  });

  // POST /settings/watch-inbox — update toggle state
  app.post("/settings/watch-inbox", async (c: any) => {
    const body = await c.req.json();
    const enabled = !!body.enabled;

    const existing = await db("plugin_kv")
      .where({ plugin: "email", key: "watch_inbox" })
      .first();

    if (existing) {
      await db("plugin_kv")
        .where({ plugin: "email", key: "watch_inbox" })
        .update({ value: String(enabled) });
    } else {
      await db("plugin_kv").insert({
        plugin: "email",
        key: "watch_inbox",
        value: String(enabled),
      });
    }

    return c.json({ enabled });
  });

  // POST /send — create a verification request for an email send
  app.post("/send", async (c: any) => {
    const body = await (c.req.json() as {
      to?: string;
      subject?: string;
      text?: string;
      job?: string;
    });
    if (!body.to) return c.json({ error: "to is required" }, 400);
    if (!body.subject) return c.json({ error: "subject is required" }, 400);
    if (!body.text) return c.json({ error: "text is required" }, 400);

    const now = Date.now();
    const verificationData = {
      to: body.to,
      subject: body.subject,
      text: body.text,
      from: config.userEmail,
    };

    const [id] = await db("verification_requests").insert({
      plugin: "email",
      action: "send_email",
      data: JSON.stringify(verificationData),
      status: "pending",
      ...(body.job ? { job: body.job } : {}),
      created_at: now,
      updated_at: now,
    });

    return c.json({
      verificationRequestId: id,
      verificationStatus: "pending",
    });
  });

  // POST /approve/:id — approve and send an email
  app.post("/approve/:id", async (c: any) => {
    const id = parseInt(c.req.param("id"), 10);
    if (!id || isNaN(id)) return c.json({ error: "Invalid id" }, 400);

    const request = await db("verification_requests").where("id", id).first();
    if (
      !request ||
      request.status !== "pending" ||
      request.plugin !== "email"
    ) {
      return c.json({ error: "Not found or already resolved" }, 404);
    }

    const data = JSON.parse(request.data);

    try {
      const result = await sendEmail(config, data.to, data.subject, data.text);

      await db("verification_requests")
        .where("id", id)
        .update({ status: "approved", updated_at: Date.now() });

      // Store sent message in conversation history
      const now = Date.now();
      await db("conversation_message").insert({
        conversation_id: 0,
        plugin: "email",
        channel: data.to,
        message_id: result.messageId,
        from: config.userEmail,
        to: data.to,
        timestamp: Math.floor(now / 1000),
        direction: "sent",
        text: data.text,
        created_at: now,
      });

      return c.json({ success: true, messageId: result.messageId });
    } catch (e) {
      return c.json(
        { error: `Failed to send email: ${(e as Error).message}` },
        500,
      );
    }
  });

  // POST /receive — webhook/manual trigger to queue an incoming email as a job
  app.post("/receive", async (c: any) => {
    const body = (await c.req.json()) as {
      messageId: string;
      from: string;
      to: string;
      subject: string;
      text: string;
      threadId?: string;
    };

    if (!body.messageId || !body.from) {
      return c.json({ error: "messageId and from are required" }, 400);
    }

    const now = Date.now();

    // Store incoming message
    await db("conversation_message").insert({
      conversation_id: 0,
      plugin: "email",
      channel: body.from,
      message_id: body.messageId,
      thread_id: body.threadId ?? null,
      from: body.from,
      to: body.to ?? config.userEmail,
      timestamp: Math.floor(now / 1000),
      direction: "received",
      text: body.text ?? "",
      created_at: now,
    });

    // Load conversation history for context
    const history = await db("conversation_message")
      .where("plugin", "email")
      .where("channel", body.from)
      .orderBy("timestamp", "asc")
      .limit(20);

    const historyEntries = history.map((h: any) => ({
      role: h.direction === "sent" ? ("assistant" as const) : ("user" as const),
      text: h.text ?? "",
      timestamp: h.timestamp,
    }));

    // Only queue if watch inbox is enabled
    const watchEnabled = await isWatchInboxEnabled(db);
    if (watchEnabled) {
      // Check if email matches a queue
      const emailQueuePrompt = config.emailQueueDir
        ? await matchEmailQueue(body.to ?? config.userEmail, config.emailQueueDir)
        : null;

      const [jobId] = await db("safe_queue").insert({
        job_type: "email:email_received",
        data: JSON.stringify({
          messageId: body.messageId,
          from: body.from,
          to: body.to ?? config.userEmail,
          subject: body.subject ?? "",
          text: body.text ?? "",
          threadId: body.threadId ?? null,
          history: historyEntries,
          ...(emailQueuePrompt ? { emailQueuePrompt } : {}),
        }),
        context: JSON.stringify({ channel: "email", from: body.from }),
        status: "pending",
        created_at: now,
        updated_at: now,
      });

      return c.json({ success: true, jobId });
    }

    return c.json({ success: true, queued: false });
  });

  // GET /inbox — list recent inbox emails (subjects + IDs)
  app.get("/inbox", async (c: any) => {
    try {
      const limit = parseInt(c.req.query("limit") ?? "25", 10);
      const emails = await queryInboxEmails(config, limit);
      return c.json({
        emails: emails.map((e) => ({
          id: e.id,
          subject: e.subject,
          from: e.from,
          receivedAt: e.receivedAt,
        })),
      });
    } catch (e) {
      return c.json(
        { error: `Failed to fetch inbox: ${(e as Error).message}` },
        500,
      );
    }
  });

  // GET /search — search emails by query (subjects + IDs)
  app.get("/search", async (c: any) => {
    const query = c.req.query("q");
    if (!query) return c.json({ error: "q parameter is required" }, 400);

    try {
      const limit = parseInt(c.req.query("limit") ?? "25", 10);
      const emails = await searchEmails(config, query, limit);
      return c.json({
        emails: emails.map((e) => ({
          id: e.id,
          subject: e.subject,
          from: e.from,
          receivedAt: e.receivedAt,
        })),
      });
    } catch (e) {
      return c.json(
        { error: `Failed to search emails: ${(e as Error).message}` },
        500,
      );
    }
  });

  // GET /read/:id — read full email content by ID
  app.get("/read/:id", async (c: any) => {
    const id = c.req.param("id");
    if (!id) return c.json({ error: "Email ID is required" }, 400);

    try {
      const emails = await getEmails(config, [id]);
      if (emails.length === 0) {
        return c.json({ error: "Email not found" }, 404);
      }
      return c.json({ email: emails[0] });
    } catch (e) {
      return c.json(
        { error: `Failed to read email: ${(e as Error).message}` },
        500,
      );
    }
  });

}

// ---------------------------------------------------------------------------
// Email Queue matching
// ---------------------------------------------------------------------------

/**
 * Given a "to" address (may include display names like "Name <email>"),
 * check if any address matches a queue file.
 * Emails to daveus.{queue}@yud.co.za match queue files where {queue} is the
 * lowercased filename without extension and without spaces.
 * Returns the file content (emailQueuePrompt) if matched, null otherwise.
 */
export async function matchEmailQueue(
  toAddress: string,
  emailQueueDir: string,
): Promise<string | null> {
  if (!emailQueueDir) return null;

  // Extract raw email addresses from potentially formatted strings like "Name <email>, other@domain"
  const emailPattern = /[\w.+-]+@[\w.-]+/g;
  const emails = toAddress.toLowerCase().match(emailPattern) ?? [];

  // Find the first email matching the queue pattern
  let queueSlug: string | null = null;
  for (const email of emails) {
    const m = email.match(/^daveus\.([^@]+)@yud\.co\.za$/);
    if (m) {
      queueSlug = m[1];
      break;
    }
  }
  if (!queueSlug) return null;

  let files: string[];
  try {
    files = await listDir(emailQueueDir);
  } catch {
    return null;
  }

  for (const file of files) {
    // Derive the queue slug from the filename: strip extension, lowercase, remove spaces
    const basename = path.basename(file, path.extname(file));
    const fileSlug = basename.toLowerCase().replace(/\s+/g, "");

    if (fileSlug === queueSlug) {
      try {
        const content = await readFile(
          path.join(emailQueueDir, file),
          "utf8",
        );
        return content;
      } catch {
        return null;
      }
    }
  }

  return null;
}

// ---------------------------------------------------------------------------
// Email Queue file editor routes
// ---------------------------------------------------------------------------

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
    throw new Error("path escapes email queue directory");
  }
  return relative.replaceAll("\\", "/");
}

export function registerEmailQueueRoutes(app: any, emailQueueDir: string) {
  const clientJs = generateFileEditorScript({
    prefix: "email-queue",
    apiBase: "/api/email/queue",
    newFilePrompt: "New queue file name (e.g. Support.md):",
    emptyMessage: "No email queue files yet",
  });

  app.get("/queue/client.js", (c: any) => {
    return c.body(clientJs, 200, {
      "Content-Type": "application/javascript",
      "Cache-Control": "no-cache",
    });
  });

  app.get("/queue/files", async (c: any) => {
    const files = await listDir(emailQueueDir).catch((error) => {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
      throw error;
    });
    return c.json({ files });
  });

  app.get("/queue/file", async (c: any) => {
    const filePath = c.req.query("path");
    if (!filePath) return c.json({ error: "path is required" }, 400);

    let relative: string;
    try {
      relative = validateRelativePath(filePath, emailQueueDir);
    } catch (e) {
      return c.json({ error: (e as Error).message }, 400);
    }

    const absolutePath = path.join(emailQueueDir, relative);
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

  app.post("/queue/file", async (c: any) => {
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
      relative = validateRelativePath(filePath, emailQueueDir);
    } catch (e) {
      return c.json({ error: (e as Error).message }, 400);
    }

    const absolutePath = path.join(emailQueueDir, relative);
    await mkdir(path.dirname(absolutePath), { recursive: true });
    await writeFile(absolutePath, body.content, "utf8");

    return c.json({
      path: relative,
      bytes: Buffer.byteLength(body.content, "utf8"),
    });
  });
}

export async function startEmailPolling(
  config: EmailPluginConfig,
  db: any,
  intervalMs: number,
): Promise<void> {
  if (!config.apiToken) return;

  const poll = async () => {
    try {
      const unseenIds = await queryUnseenEmails(config);
      if (unseenIds.length === 0) return;

      // Filter out emails already in email_received table
      const existing = await db("email_received")
        .whereIn("message_id", unseenIds)
        .select("message_id");
      const existingIds = new Set(existing.map((r: any) => r.message_id));
      const newIds = unseenIds.filter((id) => !existingIds.has(id));
      if (newIds.length === 0) return;

      const emails = await getEmails(config, newIds);

      for (const email of emails) {
        const now = Date.now();
        const receivedAt = Math.floor(
          new Date(email.receivedAt).getTime() / 1000,
        );

        // Record in email_received to prevent future duplicates
        await db("email_received").insert({
          message_id: email.id,
          from: email.from,
          to: email.to,
          subject: email.subject,
          thread_id: email.threadId ?? null,
          received_at: receivedAt,
          created_at: now,
        });

        await db("conversation_message").insert({
          conversation_id: 0,
          plugin: "email",
          channel: email.from,
          message_id: email.id,
          thread_id: email.threadId ?? null,
          from: email.from,
          to: email.to,
          timestamp: receivedAt,
          direction: "received",
          text: email.textBody,
          created_at: now,
        });

        // Only queue if watch inbox is enabled
        const watchEnabled = await isWatchInboxEnabled(db);
        if (watchEnabled) {
          const history = await db("conversation_message")
            .where("plugin", "email")
            .where("channel", email.from)
            .orderBy("timestamp", "asc")
            .limit(20);

          const historyEntries = history.map((h: any) => ({
            role:
              h.direction === "sent"
                ? ("assistant" as const)
                : ("user" as const),
            text: h.text ?? "",
            timestamp: h.timestamp,
          }));

          // Check if email matches a queue
          const emailQueuePrompt = config.emailQueueDir
            ? await matchEmailQueue(email.to, config.emailQueueDir)
            : null;

          await db("safe_queue").insert({
            job_type: "email:email_received",
            data: JSON.stringify({
              messageId: email.id,
              from: email.from,
              to: email.to,
              subject: email.subject,
              text: email.textBody,
              threadId: email.threadId ?? null,
              history: historyEntries,
              ...(emailQueuePrompt ? { emailQueuePrompt } : {}),
            }),
            context: JSON.stringify({ channel: "email", from: email.from }),
            status: "pending",
            created_at: now,
            updated_at: now,
          });
        }
      }

      // Mark all as read
      await markAsRead(config, newIds);
    } catch {
      // Polling error — will retry on next interval
    }
  };

  setInterval(poll, intervalMs);
}
