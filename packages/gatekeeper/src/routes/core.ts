import type { Hono } from "hono";
import type { Knex } from "knex";
import type { AgentStatusEvent } from "@sandclaw/gatekeeper-plugin-api";
import { localTimestamp } from "@sandclaw/util";

export function registerCoreRoutes(
  app: Hono,
  db: Knex,
  onVerificationChange?: () => void,
  agentStatusHooks?: Array<(event: AgentStatusEvent) => Promise<void>>,
): void {
  // --- Job Queue ---

  // GET /api/job/next — long-poll for the next pending job for a given executor
  app.get("/api/job/next", async (c) => {
    const executor = c.req.query("executor");
    if (!executor) return c.json({ error: "executor is required" }, 400);

    const timeoutParam = c.req.query("timeout");
    const timeoutSec = Math.min(
      600,
      Math.max(1, parseInt(timeoutParam || "25", 10) || 25),
    );
    const deadline = Date.now() + timeoutSec * 1000;
    const pollMs = 500;

    while (Date.now() < deadline) {
      const now = localTimestamp();
      const job = await db("job_queue")
        .where("executor", executor)
        .where("status", "pending")
        .orderBy("id", "asc")
        .first();

      if (job) {
        await db("job_queue")
          .where("id", job.id)
          .update({ status: "in_progress", updated_at: now });
        return c.json({
          job: {
            id: job.id,
            jobType: job.job_type,
            data: job.data,
            context: job.context ?? null,
            executor: job.executor,
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

  // GET /api/job/:id — fetch a specific job by ID
  app.get("/api/job/:id", async (c) => {
    const id = parseInt(c.req.param("id"), 10);
    if (!id || isNaN(id)) return c.json({ error: "Invalid id" }, 400);

    const job = await db("job_queue").where("id", id).first();
    if (!job) return c.json({ error: "Job not found" }, 404);

    return c.json({
      job: {
        id: job.id,
        jobType: job.job_type,
        data: job.data,
        context: job.context ?? null,
        executor: job.executor,
        status: job.status,
      },
    });
  });

  // POST /api/job/complete — mark a job as complete
  app.post("/api/job/complete", async (c) => {
    const body = await c.req.json<{ id: number; result?: string }>();
    if (!body.id) return c.json({ error: "id is required" }, 400);

    const updated = await db("job_queue")
      .where("id", body.id)
      .update({
        status: "complete",
        result: body.result ?? null,
        updated_at: localTimestamp(),
      });

    if (updated === 0) return c.json({ error: "Job not found" }, 404);
    return c.json({ success: true });
  });

  // POST /api/job/add — add a new job to the queue
  app.post("/api/job/add", async (c) => {
    const body = await c.req.json<{
      executor: string;
      jobType: string;
      data: string;
      context?: string;
    }>();
    if (!body.executor) return c.json({ error: "executor is required" }, 400);
    if (!body.jobType) return c.json({ error: "jobType is required" }, 400);
    if (body.data === undefined)
      return c.json({ error: "data is required" }, 400);

    const now = localTimestamp();
    const [id] = await db("job_queue").insert({
      executor: body.executor,
      job_type: body.jobType,
      data:
        typeof body.data === "string" ? body.data : JSON.stringify(body.data),
      context: body.context ?? null,
      status: "pending",
      created_at: now,
      updated_at: now,
    });

    const job = await db("job_queue").where("id", id).first();

    // Fire "queued" agent status event
    if (agentStatusHooks) {
      let parsedContext: Record<string, unknown> | undefined;
      if (job.context) {
        try {
          parsedContext = JSON.parse(job.context);
        } catch {}
      }
      const queuedEvent: AgentStatusEvent = {
        jobId: job.id,
        event: "queued",
        data: {
          jobType: body.jobType,
          executor: body.executor,
          ...(parsedContext ? { context: parsedContext } : {}),
        },
        createdAt: now,
      };
      for (const hook of agentStatusHooks) {
        hook(queuedEvent).catch((err) =>
          console.error("[agent-status] hook error:", err),
        );
      }
    }

    return c.json({
      id: job.id,
      jobType: job.job_type,
      data: job.data,
      context: job.context ?? null,
      executor: job.executor,
      status: job.status,
    });
  });

  // POST /api/job/status — receive job status event and fire hooks
  app.post("/api/job/status", async (c) => {
    const body = await c.req.json<{
      jobId?: number;
      event?: string;
      prompt?: string;
      systemPrompt?: string;
      toolNames?: string[];
      data?: Record<string, unknown>;
      createdAt?: string;
    }>();

    if (!body.jobId || !body.event) {
      return c.json({ error: "jobId and event are required" }, 400);
    }

    const validEvents = ["queued", "started", "step", "completed", "failed"];
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
      createdAt: body.createdAt ?? localTimestamp(),
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
      .update({ status: "rejected", updated_at: localTimestamp() });

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

  // POST /api/confidante/result — receive a confidante exec result, build context, enqueue to job_queue
  app.post("/api/confidante/result", async (c) => {
    const body = await c.req.json<{
      requestId?: string;
      result?: string;
      jobContext?: { worker: string; jobId: number };
    }>();

    if (!body.requestId) return c.json({ error: "requestId is required" }, 400);
    if (!body.result) return c.json({ error: "result is required" }, 400);

    // Fetch context from the originating job by reference
    let sqCtx: Record<string, unknown> = {};
    let userMessage: string | undefined;

    if (body.jobContext?.worker === "muteworker" && body.jobContext.jobId) {
      const originJob = await db("job_queue")
        .where("id", body.jobContext.jobId)
        .first();
      if (originJob) {
        if (originJob.context) {
          try {
            sqCtx = JSON.parse(originJob.context);
          } catch (err) {
            console.error(
              "[confidante/result] Failed to parse job context:",
              err,
            );
          }
        }
        if (originJob.data) {
          try {
            const jobData = JSON.parse(originJob.data);
            if (typeof jobData.text === "string") userMessage = jobData.text;
          } catch (err) {
            console.error("[confidante/result] Failed to parse job data:", err);
          }
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
          const ts = m.timestamp;
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
    const now = localTimestamp();

    const [jobId] = await db("job_queue").insert({
      executor: "muteworker",
      job_type: "confidante:result",
      data: prompt,
      ...(context ? { context } : {}),
      status: "pending",
      created_at: now,
      updated_at: now,
    });

    // Fire "queued" agent status event
    if (agentStatusHooks) {
      const queuedEvent: AgentStatusEvent = {
        jobId,
        event: "queued",
        data: {
          jobType: "confidante:result",
          executor: "muteworker",
          ...(Object.keys(sqCtx).length > 0 ? { context: sqCtx } : {}),
        },
        createdAt: now,
      };
      for (const hook of agentStatusHooks) {
        hook(queuedEvent).catch((err) =>
          console.error("[agent-status] hook error:", err),
        );
      }
    }

    return c.json({ success: true, jobId });
  });
}
