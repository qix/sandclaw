import type { Hono } from "hono";
import type { Knex } from "knex";
import type { AgentStatusEvent } from "@sandclaw/gatekeeper-plugin-api";

export function registerCoreRoutes(
  app: Hono,
  db: Knex,
  onVerificationChange?: () => void,
  agentStatusHooks?: Array<(event: AgentStatusEvent) => Promise<void>>,
): void {
  // --- Safe Queue (Muteworker) ---

  // GET /api/muteworker-queue/next — long-poll for the next pending job
  app.get("/api/muteworker-queue/next", async (c) => {
    const timeoutParam = c.req.query("timeout");
    const timeoutSec = Math.min(
      600,
      Math.max(1, parseInt(timeoutParam || "25", 10) || 25),
    );
    const deadline = Date.now() + timeoutSec * 1000;
    const pollMs = 500;

    while (Date.now() < deadline) {
      const now = Date.now();
      const job = await db("safe_queue")
        .where("status", "pending")
        .orderBy("id", "asc")
        .first();

      if (job) {
        await db("safe_queue")
          .where("id", job.id)
          .update({ status: "in_progress", updated_at: now });
        return c.json({
          job: {
            id: job.id,
            jobType: job.job_type,
            data: job.data,
            context: job.context ?? null,
            status: "in_progress",
          },
        });
      }

      const remaining = deadline - Date.now();
      if (remaining <= 0) break;
      await new Promise((resolve) =>
        setTimeout(resolve, Math.min(pollMs, remaining)),
      );
    }

    return c.body(null, 204);
  });

  // GET /api/muteworker-queue/:id — fetch a specific muteworker job by ID
  app.get("/api/muteworker-queue/:id", async (c) => {
    const id = parseInt(c.req.param("id"), 10);
    if (!id || isNaN(id)) return c.json({ error: "Invalid id" }, 400);

    const job = await db("safe_queue").where("id", id).first();
    if (!job) return c.json({ error: "Job not found" }, 404);

    return c.json({
      job: {
        id: job.id,
        jobType: job.job_type,
        data: job.data,
        context: job.context ?? null,
        status: job.status,
      },
    });
  });

  // POST /api/muteworker-queue/complete — mark a job as complete
  app.post("/api/muteworker-queue/complete", async (c) => {
    const body = await c.req.json<{ id: number }>();
    if (!body.id) return c.json({ error: "id is required" }, 400);

    const updated = await db("safe_queue")
      .where("id", body.id)
      .update({ status: "complete", updated_at: Date.now() });

    if (updated === 0) return c.json({ error: "Job not found" }, 404);
    return c.json({ success: true });
  });

  // POST /api/muteworker-queue/add — add a new job to the safe queue
  app.post("/api/muteworker-queue/add", async (c) => {
    const body = await c.req.json<{
      jobType: string;
      data: string;
      context?: string;
    }>();
    if (!body.jobType) return c.json({ error: "jobType is required" }, 400);
    if (body.data === undefined)
      return c.json({ error: "data is required" }, 400);

    const now = Date.now();
    const [id] = await db("safe_queue").insert({
      job_type: body.jobType,
      data:
        typeof body.data === "string" ? body.data : JSON.stringify(body.data),
      context: body.context ?? null,
      status: "pending",
      created_at: now,
      updated_at: now,
    });

    const job = await db("safe_queue").where("id", id).first();
    return c.json({
      id: job.id,
      jobType: job.job_type,
      data: job.data,
      context: job.context ?? null,
      status: job.status,
    });
  });

  // POST /api/muteworker-queue/agent-status — receive agent status event and fire hooks
  app.post("/api/muteworker-queue/agent-status", async (c) => {
    const body = await c.req.json<{
      jobId?: number;
      event?: string;
      prompt?: string;
      systemPrompt?: string;
      toolNames?: string[];
      data?: Record<string, unknown>;
      createdAt?: number;
    }>();

    if (!body.jobId || !body.event) {
      return c.json({ error: "jobId and event are required" }, 400);
    }

    const validEvents = ["started", "step", "completed", "failed"];
    if (!validEvents.includes(body.event)) {
      return c.json(
        { error: `event must be one of: ${validEvents.join(", ")}` },
        400,
      );
    }

    const statusEvent: AgentStatusEvent = {
      jobId: body.jobId,
      event: body.event as AgentStatusEvent["event"],
      prompt: body.prompt,
      systemPrompt: body.systemPrompt,
      toolNames: body.toolNames,
      data: body.data,
      createdAt: body.createdAt ?? Date.now(),
    };

    if (agentStatusHooks) {
      for (const hook of agentStatusHooks) {
        try {
          await hook(statusEvent);
        } catch (err) {
          console.error(
            `[agent-status] hook error for job ${statusEvent.jobId}:`,
            err instanceof Error ? err.message : err,
          );
        }
      }
    }

    return c.json({ success: true });
  });

  // --- Verifications ---

  // POST /api/verifications/reject/:id — reject a pending verification request
  app.post("/api/verifications/reject/:id", async (c) => {
    const id = parseInt(c.req.param("id"), 10);
    if (!id || isNaN(id)) return c.json({ error: "Invalid id" }, 400);

    const request = await db("verification_requests").where("id", id).first();
    if (!request || request.status !== "pending") {
      return c.json({ error: "Not found or already resolved" }, 404);
    }

    await db("verification_requests")
      .where("id", id)
      .update({ status: "rejected", updated_at: Date.now() });

    onVerificationChange?.();
    return c.json({ success: true });
  });

  // GET /api/verifications/pending — list all pending verification requests
  app.get("/api/verifications/pending", async (c) => {
    const requests = await db("verification_requests")
      .where("status", "pending")
      .orderBy("created_at", "desc");

    return c.json({
      requests: requests.map((r: any) => ({
        id: r.id,
        plugin: r.plugin,
        action: r.action,
        data: r.data,
        status: r.status,
        jobContext: r.job_context ? JSON.parse(r.job_context) : undefined,
        createdAt: r.created_at,
      })),
    });
  });

  // GET /api/verifications/history — list resolved verification requests with pagination
  app.get("/api/verifications/history", async (c) => {
    const page = Math.max(1, parseInt(c.req.query("page") || "1", 10) || 1);
    const limit = Math.min(
      100,
      Math.max(1, parseInt(c.req.query("limit") || "20", 10) || 20),
    );
    const offset = (page - 1) * limit;

    const [{ count: total }] = await db("verification_requests")
      .whereIn("status", ["approved", "rejected"])
      .count("* as count");

    const requests = await db("verification_requests")
      .whereIn("status", ["approved", "rejected"])
      .orderBy("updated_at", "desc")
      .limit(limit)
      .offset(offset);

    return c.json({
      requests: requests.map((r: any) => ({
        id: r.id,
        plugin: r.plugin,
        action: r.action,
        data: r.data,
        status: r.status,
        jobContext: r.job_context ? JSON.parse(r.job_context) : undefined,
        createdAt: r.created_at,
        updatedAt: r.updated_at,
      })),
      page,
      totalPages: Math.ceil(Number(total) / limit),
      total: Number(total),
    });
  });

  // --- Confidante Queue ---

  // GET /api/confidante-queue/next — long-poll for the next pending confidante job
  app.get("/api/confidante-queue/next", async (c) => {
    const timeoutParam = c.req.query("timeout");
    const timeoutSec = Math.min(
      600,
      Math.max(1, parseInt(timeoutParam || "25", 10) || 25),
    );
    const deadline = Date.now() + timeoutSec * 1000;
    const pollMs = 500;

    while (Date.now() < deadline) {
      const now = Date.now();
      const job = await db("confidante_queue")
        .where("status", "pending")
        .orderBy("id", "asc")
        .first();

      if (job) {
        await db("confidante_queue")
          .where("id", job.id)
          .update({ status: "in_progress", updated_at: now });
        return c.json({
          job: {
            id: job.id,
            jobType: job.job_type,
            data: job.data,
            status: "in_progress",
          },
        });
      }

      const remaining = deadline - Date.now();
      if (remaining <= 0) break;
      await new Promise((resolve) =>
        setTimeout(resolve, Math.min(pollMs, remaining)),
      );
    }

    return c.body(null, 204);
  });

  // GET /api/confidante-queue/:id — fetch a specific confidante job by ID
  app.get("/api/confidante-queue/:id", async (c) => {
    const id = parseInt(c.req.param("id"), 10);
    if (!id || isNaN(id)) return c.json({ error: "Invalid id" }, 400);

    const job = await db("confidante_queue").where("id", id).first();
    if (!job) return c.json({ error: "Job not found" }, 404);

    return c.json({
      job: {
        id: job.id,
        jobType: job.job_type,
        data: job.data,
        status: job.status,
      },
    });
  });

  // GET /api/conversations/:id/messages — fetch conversation history
  app.get("/api/conversations/:id/messages", async (c) => {
    const id = parseInt(c.req.param("id"), 10);
    if (!id || isNaN(id)) return c.json({ error: "Invalid id" }, 400);

    const limitParam = parseInt(c.req.query("limit") || "50", 10);
    const limit = Math.min(200, Math.max(1, limitParam || 50));

    const rows = await db("conversation_message")
      .where("conversation_id", id)
      .orderBy("timestamp", "asc")
      .limit(limit);

    return c.json({
      messages: rows.map((r: any) => ({
        id: r.id,
        from: r.from,
        to: r.to,
        direction: r.direction,
        text: r.text,
        timestamp: r.timestamp,
      })),
    });
  });

  // POST /api/confidante/result — receive a confidante exec result, build context, enqueue to safe_queue
  app.post("/api/confidante/result", async (c) => {
    const body = await c.req.json<{
      requestId?: string;
      result?: string;
      jobContext?: { worker: string; jobId: number };
    }>();

    if (!body.requestId) return c.json({ error: "requestId is required" }, 400);
    if (!body.result) return c.json({ error: "result is required" }, 400);

    // Fetch context from the originating safe_queue job by reference
    let sqCtx: Record<string, unknown> = {};
    let userMessage: string | undefined;

    if (body.jobContext?.worker === "muteworker" && body.jobContext.jobId) {
      const originJob = await db("safe_queue")
        .where("id", body.jobContext.jobId)
        .first();
      if (originJob) {
        if (originJob.context) {
          try {
            sqCtx = JSON.parse(originJob.context);
          } catch {}
        }
        if (originJob.data) {
          try {
            const jobData = JSON.parse(originJob.data);
            if (typeof jobData.text === "string") userMessage = jobData.text;
          } catch {}
        }
      }
    }

    const conversationId =
      typeof sqCtx.conversationId === "number" ? sqCtx.conversationId : null;
    const channel = typeof sqCtx.channel === "string" ? sqCtx.channel : null;

    const promptParts: string[] = [];

    // Fetch conversation history if we have a conversationId
    if (conversationId) {
      const messages = await db("conversation_message")
        .where("conversation_id", conversationId)
        .orderBy("timestamp", "asc")
        .limit(20);

      if (messages.length > 0) {
        promptParts.push("--- Conversation History ---");
        for (const m of messages as any[]) {
          const role = m.direction === "inbound" ? "User" : "Assistant";
          const ts = new Date(m.timestamp * 1000).toISOString();
          promptParts.push(`[${ts}] ${role}: ${m.text}`);
        }
        promptParts.push("--- End History ---", "");
      }
    }

    promptParts.push(
      "--- Confidante Exec Result ---",
      `Request ID: ${body.requestId}`,
    );

    if (userMessage) {
      promptParts.push("", `The user originally asked: "${userMessage}"`);
    }

    promptParts.push("", body.result, "------------------------------------");

    if (channel) {
      promptParts.push(
        "",
        `Reply to the user via the ${channel} channel with a concise summary of the result.`,
      );
    }

    const prompt = promptParts.join("\n");
    const context =
      Object.keys(sqCtx).length > 0 ? JSON.stringify(sqCtx) : null;
    const now = Date.now();

    const [jobId] = await db("safe_queue").insert({
      job_type: "confidante:result",
      data: prompt,
      ...(context ? { context } : {}),
      status: "pending",
      created_at: now,
      updated_at: now,
    });

    return c.json({ success: true, jobId });
  });

  // POST /api/confidante-queue/complete — mark a confidante job as complete
  app.post("/api/confidante-queue/complete", async (c) => {
    const body = await c.req.json<{ id: number; result?: string }>();
    if (!body.id) return c.json({ error: "id is required" }, 400);

    const updated = await db("confidante_queue")
      .where("id", body.id)
      .update({
        status: "complete",
        result: body.result ?? null,
        updated_at: Date.now(),
      });

    if (updated === 0) return c.json({ error: "Job not found" }, 404);
    return c.json({ success: true });
  });
}
