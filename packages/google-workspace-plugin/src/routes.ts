import { randomUUID } from "node:crypto";
import {
  GWS_PLUGIN_ID,
  GWS_VERIFICATION_ACTION,
  GWS_CONFIDANTE_JOB_TYPE,
  GWS_RESULT_JOB_TYPE,
} from "./constants";

export function registerRoutes(app: any, db: any) {
  // POST /request — create a verification request for a gws exec command
  app.post("/request", async (c: any) => {
    const body = (await c.req.json()) as {
      command?: string;
      description?: string;
      responseJobType?: string;
      jobContext?: { worker: string; jobId: number };
    };

    if (!body.command) return c.json({ error: "command is required" }, 400);
    if (!body.description)
      return c.json({ error: "description is required" }, 400);

    const requestId = randomUUID();
    const responseJobType = body.responseJobType || GWS_RESULT_JOB_TYPE;
    const now = Date.now();

    const verificationData = {
      requestId,
      command: body.command,
      description: body.description,
      responseJobType,
      createdAt: new Date(now).toISOString(),
    };

    const [id] = await db("verification_requests").insert({
      plugin: GWS_PLUGIN_ID,
      action: GWS_VERIFICATION_ACTION,
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
      requestId,
      status: "pending",
    });
  });
}
