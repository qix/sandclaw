import {
  createGmailClient,
  sendEmail,
  type GmailPluginConfig,
} from "./gmailClient";

export function registerRoutes(app: any, db: any, config: GmailPluginConfig) {
  // POST /send — create a verification request for an email send
  app.post("/send", async (c: any) => {
    const body = await (c.req.json() as {
      to?: string;
      subject?: string;
      text?: string;
      jobContext?: { worker: string; jobId: number };
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
      plugin: "gmail",
      action: "send_email",
      data: JSON.stringify(verificationData),
      status: "pending",
      ...(body.jobContext
        ? { job_context: JSON.stringify(body.jobContext) }
        : {}),
      created_at: now,
      updated_at: now,
    });

    return c.json({
      verificationRequestId: id,
      verificationStatus: "pending",
    });
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
      plugin: "gmail",
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
      .where("plugin", "gmail")
      .where("channel", body.from)
      .orderBy("timestamp", "asc")
      .limit(20);

    const historyEntries = history.map((h: any) => ({
      role: h.direction === "sent" ? ("assistant" as const) : ("user" as const),
      text: h.text ?? "",
      timestamp: h.timestamp,
    }));

    // Queue as a muteworker job
    const [jobId] = await db("job_queue").insert({
      executor: "muteworker",
      job_type: "gmail:incoming_email",
      data: JSON.stringify({
        messageId: body.messageId,
        from: body.from,
        to: body.to ?? config.userEmail,
        subject: body.subject ?? "",
        text: body.text ?? "",
        threadId: body.threadId ?? null,
        history: historyEntries,
      }),
      context: JSON.stringify({ channel: "gmail", from: body.from }),
      status: "pending",
      created_at: now,
      updated_at: now,
    });

    return c.json({ success: true, jobId });
  });

  // Start email polling if configured
  startEmailPolling(config, db, config.pollIntervalMs ?? 30000).catch((err) => {
    console.error("[gmail] Polling failed to start:", err);
  });
}

async function startEmailPolling(
  config: GmailPluginConfig,
  db: any,
  intervalMs: number,
): Promise<void> {
  if (!config.clientId || !config.clientSecret || !config.refreshToken) return;

  let lastChecked = Date.now();

  const poll = async () => {
    try {
      const gmail = await createGmailClient(config);
      const response = await gmail.users.messages.list({
        userId: "me",
        q: `is:unread after:${Math.floor(lastChecked / 1000)}`,
        maxResults: 10,
      });

      const messages = response.data.messages ?? [];
      for (const msg of messages) {
        if (!msg.id) continue;

        const detail = await gmail.users.messages.get({
          userId: "me",
          id: msg.id,
          format: "full",
        });

        const headers = detail.data.payload?.headers ?? [];
        const from =
          headers.find((h: any) => h.name?.toLowerCase() === "from")?.value ??
          "";
        const to =
          headers.find((h: any) => h.name?.toLowerCase() === "to")?.value ?? "";
        const subject =
          headers.find((h: any) => h.name?.toLowerCase() === "subject")
            ?.value ?? "";

        // Extract plain text body
        let text = "";
        const parts = detail.data.payload?.parts ?? [];
        const textPart = parts.find((p: any) => p.mimeType === "text/plain");
        if (textPart?.body?.data) {
          text = Buffer.from(textPart.body.data, "base64url").toString("utf8");
        } else if (detail.data.payload?.body?.data) {
          text = Buffer.from(
            detail.data.payload.body.data,
            "base64url",
          ).toString("utf8");
        }

        const now = Date.now();
        await db("conversation_message").insert({
          conversation_id: 0,
          plugin: "gmail",
          channel: from,
          message_id: msg.id,
          thread_id: detail.data.threadId ?? null,
          from,
          to,
          timestamp: Math.floor(now / 1000),
          direction: "received",
          text,
          created_at: now,
        });

        const history = await db("conversation_message")
          .where("plugin", "gmail")
          .where("channel", from)
          .orderBy("timestamp", "asc")
          .limit(20);

        const historyEntries = history.map((h: any) => ({
          role:
            h.direction === "sent" ? ("assistant" as const) : ("user" as const),
          text: h.text ?? "",
          timestamp: h.timestamp,
        }));

        await db("job_queue").insert({
          executor: "muteworker",
          job_type: "gmail:incoming_email",
          data: JSON.stringify({
            messageId: msg.id,
            from,
            to,
            subject,
            text,
            threadId: detail.data.threadId ?? null,
            history: historyEntries,
          }),
          context: JSON.stringify({ channel: "gmail", from }),
          status: "pending",
          created_at: now,
          updated_at: now,
        });

        // Mark as read
        await gmail.users.messages.modify({
          userId: "me",
          id: msg.id,
          requestBody: { removeLabelIds: ["UNREAD"] },
        });
      }

      lastChecked = Date.now();
    } catch (err) {
      console.error("[gmail] Polling error:", err);
    }
  };

  setInterval(poll, intervalMs);
}
