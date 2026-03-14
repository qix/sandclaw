import { randomUUID } from "node:crypto";
import { localTimestamp } from "@sandclaw/util";
import {
  BROWSER_VERIFICATION_ACTION,
  BROWSER_CONFIDANTE_JOB_TYPE,
  DEFAULT_BROWSER_RESULT_JOB_TYPE,
} from "./constants";

export function registerRoutes(
  app: any,
  db: any,
  pluginConfig: BrowserPluginConfig,
) {
  // POST /request — create a verification request for a browse
  app.post("/request", async (c: any) => {
    const body = (await c.req.json()) as {
      prompt?: string;
      url?: string;
      responseJobType?: string;
      jobContext?: { worker: string; jobId: number };
    };

    if (!body.prompt) return c.json({ error: "prompt is required" }, 400);

    const requestId = randomUUID();
    const responseJobType =
      body.responseJobType || DEFAULT_BROWSER_RESULT_JOB_TYPE;
    const now = localTimestamp();

    const verificationData = {
      requestId,
      prompt: body.prompt,
      url: body.url,
      responseJobType,
      image: pluginConfig.image ?? "browser-plugin",
      createdAt: now,
    };

    const [id] = await db("verification_requests").insert({
      plugin: "browser",
      action: BROWSER_VERIFICATION_ACTION,
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

  // POST /result — confidante posts browse results back
  app.post("/result", async (c: any) => {
    const body = (await c.req.json()) as {
      requestId: string;
      responseJobType?: string;
      result: string;
    };

    if (!body.requestId) return c.json({ error: "requestId is required" }, 400);
    if (!body.result) return c.json({ error: "result is required" }, 400);

    const jobType = body.responseJobType || DEFAULT_BROWSER_RESULT_JOB_TYPE;
    const now = localTimestamp();

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

    return c.json({ success: true, jobId });
  });
}

export interface BrowserPluginConfig {
  image?: string;
}
