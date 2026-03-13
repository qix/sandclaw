import { randomUUID } from "node:crypto";
import type { AgentStatusEvent } from "@sandclaw/gatekeeper-plugin-api";
import {
  BUILDER_VERIFICATION_ACTION,
  BUILDER_CONFIDANTE_JOB_TYPE,
  DEFAULT_BUILDER_RESULT_JOB_TYPE,
} from "./constants";

export function registerRoutes(
  app: any,
  db: any,
  pluginConfig: BuilderPluginConfig,
  fireAgentStatus?: (event: AgentStatusEvent) => void,
) {
  // POST /request — create a verification request for a build
  app.post("/request", async (c: any) => {
    const body = (await c.req.json()) as {
      prompt?: string;
      responseJobType?: string;
      jobContext?: { worker: string; jobId: number };
    };

    if (!body.prompt) return c.json({ error: "prompt is required" }, 400);

    const requestId = randomUUID();
    const responseJobType =
      body.responseJobType || DEFAULT_BUILDER_RESULT_JOB_TYPE;
    const now = Date.now();

    const verificationData = {
      requestId,
      prompt: body.prompt,
      responseJobType,
      // Include config values for display in the verification UI
      repo: pluginConfig.repo,
      branch: pluginConfig.branch ?? "main",
      image: pluginConfig.image ?? "builder-plugin",
      createdAt: new Date(now).toISOString(),
    };

    const [id] = await db("verification_requests").insert({
      plugin: "builder",
      action: BUILDER_VERIFICATION_ACTION,
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

  // POST /result — confidante posts build results back
  app.post("/result", async (c: any) => {
    const body = (await c.req.json()) as {
      requestId: string;
      responseJobType?: string;
      result: string;
    };

    if (!body.requestId) return c.json({ error: "requestId is required" }, 400);
    if (!body.result) return c.json({ error: "result is required" }, 400);

    const jobType = body.responseJobType || DEFAULT_BUILDER_RESULT_JOB_TYPE;
    const now = Date.now();

    const [jobId] = await db("job_queue").insert({
      executor: "muteworker",
      job_type: jobType,
      data: JSON.stringify({
        requestId: body.requestId,
        result: body.result,
      }),
      status: "pending",
      created_at: now,
      updated_at: now,
    });

    fireAgentStatus?.({
      jobId,
      event: "queued",
      data: { jobType, executor: "muteworker" },
      createdAt: now,
    });

    return c.json({ success: true, jobId });
  });
}

export interface BuilderPluginConfig {
  repo: string;
  workDir: string;
  branch?: string;
  image?: string;
}
