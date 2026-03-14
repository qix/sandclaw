import type { Hono } from "hono";
import type { Knex } from "knex";
import type {
  VerificationCallback,
  JobContext,
} from "@sandclaw/gatekeeper-plugin-api";

export function registerVerificationFormRoutes(
  app: Hono,
  db: Knex,
  onVerificationChange: (() => void) | undefined,
  verificationCallbacks: Map<string, VerificationCallback>,
  queueJob: (
    executor: "muteworker" | "confidante",
    jobType: string,
    data: any,
  ) => Promise<{ jobId: number }>,
): void {
  // POST /verifications/approve/:id — call the plugin's verification callback, then redirect
  app.post("/verifications/approve/:id", async (c) => {
    const id = parseInt(c.req.param("id"), 10);
    if (!id || isNaN(id)) return c.redirect("/?page=verifications");

    const request = await db("verification_requests").where("id", id).first();
    if (!request || request.status !== "pending") {
      return c.redirect("/?page=verifications");
    }

    const callback = verificationCallbacks.get(request.plugin);
    if (callback) {
      const parsedData = JSON.parse(request.data);
      const jobContext: JobContext | undefined = request.job_context
        ? JSON.parse(request.job_context)
        : undefined;

      await callback(
        { id, action: request.action, data: parsedData, jobContext },
        { queueJob },
      );
    }

    // If the callback exits without error, mark as approved
    await db("verification_requests")
      .where("id", id)
      .update({ status: "approved", updated_at: new Date().toISOString() });

    onVerificationChange?.();
    return c.redirect("/?page=verifications");
  });

  // POST /verifications/reject/:id — reject and redirect
  app.post("/verifications/reject/:id", async (c) => {
    const id = parseInt(c.req.param("id"), 10);
    if (!id || isNaN(id)) return c.redirect("/?page=verifications");

    await db("verification_requests")
      .where("id", id)
      .where("status", "pending")
      .update({ status: "rejected", updated_at: new Date().toISOString() });

    onVerificationChange?.();
    return c.redirect("/?page=verifications");
  });

  // POST /verifications/requeue/:id — re-add the triggering event to job_queue, then reject the verification
  app.post("/verifications/requeue/:id", async (c) => {
    const id = parseInt(c.req.param("id"), 10);
    if (!id || isNaN(id)) return c.redirect("/?page=verifications");

    const request = await db("verification_requests").where("id", id).first();
    if (!request || request.status !== "pending") {
      return c.redirect("/?page=verifications");
    }

    // Resolve the job context to find the originating job
    const jobContext: { worker: string; jobId: number } | undefined =
      request.job_context ? JSON.parse(request.job_context) : undefined;

    if (!jobContext?.jobId) {
      return c.redirect("/?page=verifications");
    }

    const originJob = await db("job_queue")
      .where("id", jobContext.jobId)
      .first();

    if (!originJob) {
      return c.redirect("/?page=verifications");
    }

    // Re-add the originating event as a new pending job
    const now = new Date().toISOString();
    await db("job_queue").insert({
      executor: originJob.executor,
      job_type: originJob.job_type,
      data: originJob.data,
      context: originJob.context ?? null,
      status: "pending",
      created_at: now,
      updated_at: now,
    });

    // Mark the verification request as rejected so it leaves the pending list
    await db("verification_requests")
      .where("id", id)
      .update({ status: "rejected", updated_at: now });

    onVerificationChange?.();
    return c.redirect("/?page=verifications");
  });
}
