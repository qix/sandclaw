import { randomUUID } from "node:crypto";
import { localTimestamp } from "@sandclaw/util";
import {
  GWS_PLUGIN_ID,
  GWS_VERIFICATION_ACTION,
  GWS_RESULT_JOB_TYPE,
  READ_METHODS,
} from "./constants";
import { gwsExec, type GoogleWorkspacePluginConfig } from "./gwsClient";

/**
 * The last positional argument before any `--flag` is treated as the gws
 * "method" (e.g. `list`, `get`). Used to enforce the read-only allowlist.
 */
function extractMethod(args: string[]): string | null {
  let lastPositional: string | null = null;
  for (const arg of args) {
    if (typeof arg !== "string") continue;
    if (arg.startsWith("--")) break;
    lastPositional = arg;
  }
  return lastPositional;
}

export function registerRoutes(
  app: any,
  db: any,
  config: GoogleWorkspacePluginConfig,
) {
  // POST /read — execute a read-only gws command directly on the gatekeeper
  app.post("/read", async (c: any) => {
    const body = (await c.req.json()) as { command?: unknown };
    const command = body.command;
    if (!Array.isArray(command) || command.length === 0) {
      return c.json(
        { error: "command is required and must be a non-empty array" },
        400,
      );
    }

    const args = command.filter((a): a is string => typeof a === "string");
    if (args.length === 0) {
      return c.json({ error: "No valid string arguments provided" }, 400);
    }

    const method = extractMethod(args);
    if (!method || !READ_METHODS.has(method)) {
      return c.json(
        {
          error: `Method "${method ?? "(none)"}" is not in the read-only whitelist. Use the exec tool for write operations.`,
        },
        400,
      );
    }

    if (!args.includes("--format")) {
      args.push("--format", "json");
    }

    const result = await gwsExec(config, args);
    return c.json(result);
  });

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
    const now = localTimestamp();

    const verificationData = {
      requestId,
      command: body.command,
      description: body.description,
      responseJobType,
      createdAt: now,
    };

    const [{ id }] = await db("verification_requests")
      .insert({
        plugin: GWS_PLUGIN_ID,
        action: GWS_VERIFICATION_ACTION,
        data: JSON.stringify(verificationData),
        status: "pending",
        ...(body.jobContext
          ? { job_context: JSON.stringify(body.jobContext) }
          : {}),
        created_at: now,
        updated_at: now,
      })
      .returning("id");

    return c.json({
      verificationRequestId: id,
      requestId,
      status: "pending",
    });
  });
}
