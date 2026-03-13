import type { Hono } from "hono";
import type { Knex } from "knex";
import type {
  AgentStatusEvent,
  VerificationCallback,
  JobContext,
} from "@sandclaw/gatekeeper-plugin-api";

export function registerVerificationFormRoutes(
  app: Hono,
  db: Knex,
  onVerificationChange: (() => void) | undefined,
  verificationCallbacks: Map<string, VerificationCallback>,
  agentStatusHooks: Array<(event: AgentStatusEvent) => Promise<void>>,
): void {
  /** Insert a job into the queue and fire a "queued" agent status event. */
  async function queueJob(
    executor: "muteworker" | "confidante",
    jobType: string,
    data: any,
  ): Promise<{ jobId: number }> {
    const now = Date.now();
    const [jobId] = await db("job_queue").insert({
      executor,
      job_type: jobType,
      data: typeof data === "string" ? data : JSON.stringify(data),
      status: "pending",
      created_at: now,
      updated_at: now,
    });

    const queuedEvent: AgentStatusEvent = {
      jobId,
      event: "queued",
      data: { jobType, executor },
      createdAt: now,
    };
    for (const hook of agentStatusHooks) {
      hook(queuedEvent).catch(() => {});
    }

    return { jobId };
  }

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
      let parsedData: any;
      try {
        parsedData = JSON.parse(request.data);
      } catch {
        parsedData = request.data;
      }

      let jobContext: JobContext | undefined;
      if (request.job_context) {
        try {
          jobContext = JSON.parse(request.job_context);
        } catch {}
      }

      await callback(
        { id, action: request.action, data: parsedData, jobContext },
        { queueJob },
      );
    }

    // If the callback exits without error, mark as approved
    await db("verification_requests")
      .where("id", id)
      .update({ status: "approved", updated_at: Date.now() });

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
      .update({ status: "rejected", updated_at: Date.now() });

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
    let jobContext: { worker: string; jobId: number } | undefined;
    if (request.job_context) {
      try {
        jobContext = JSON.parse(request.job_context);
      } catch {}
    }

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
    const now = Date.now();
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
