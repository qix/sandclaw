import type { Hono } from "hono";
import type { Knex } from "knex";

export function registerCoreRoutes(
  app: Hono,
  db: Knex,
  onVerificationChange?: () => void,
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
