import {
  sendEmail,
  queryUnseenEmails,
  queryInboxEmails,
  searchEmails,
  getEmails,
  markAsRead,
  type EmailPluginConfig,
} from "./jmapClient";

export function registerRoutes(app: any, db: any, config: EmailPluginConfig) {
  // POST /send — create a verification request for an email send
  app.post("/send", async (c: any) => {
    const body = await (c.req.json() as {
      to?: string;
      subject?: string;
      text?: string;
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

    // Queue as a muteworker job
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
      }),
      context: JSON.stringify({ channel: "email", from: body.from }),
      status: "pending",
      created_at: now,
      updated_at: now,
    });

    return c.json({ success: true, jobId });
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

  // Start email polling if configured
  startEmailPolling(config, db, config.pollIntervalMs ?? 30000).catch(() => {
    // Polling failed to start — likely missing credentials
  });
}

async function startEmailPolling(
  config: EmailPluginConfig,
  db: any,
  intervalMs: number,
): Promise<void> {
  if (!config.apiToken) return;

  // Track processed IDs within this session to avoid duplicates
  const processedIds = new Set<string>();

  const poll = async () => {
    try {
      const unseenIds = await queryUnseenEmails(config);
      const newIds = unseenIds.filter((id) => !processedIds.has(id));
      if (newIds.length === 0) return;

      const emails = await getEmails(config, newIds);

      for (const email of emails) {
        processedIds.add(email.id);

        const now = Date.now();
        await db("conversation_message").insert({
          conversation_id: 0,
          plugin: "email",
          channel: email.from,
          message_id: email.id,
          thread_id: email.threadId ?? null,
          from: email.from,
          to: email.to,
          timestamp: Math.floor(
            new Date(email.receivedAt).getTime() / 1000,
          ),
          direction: "received",
          text: email.textBody,
          created_at: now,
        });

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
          }),
          context: JSON.stringify({ channel: "email", from: email.from }),
          status: "pending",
          created_at: now,
          updated_at: now,
        });
      }

      // Mark all as read
      await markAsRead(config, newIds);
    } catch {
      // Polling error — will retry on next interval
    }
  };

  setInterval(poll, intervalMs);
}
