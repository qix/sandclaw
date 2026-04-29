import type { MuteworkerPluginContext } from "@sandclaw/muteworker-plugin-api";
import { GWS_RESULT_JOB_TYPE } from "./constants";

export function createReadTool(ctx: MuteworkerPluginContext) {
  return {
    name: "google_workspace_read",
    label: "Google Workspace Read",
    description: [
      "Execute a read-only Google Workspace command via the gws CLI.",
      "Pass the command as an array of argument strings (after `gws`).",
      "",
      "Examples:",
      '  ["drive", "files", "list", "--params", "{\\"q\\": \\"trashed=false\\", \\"pageSize\\": 5}"]',
      '  ["sheets", "spreadsheets", "values", "get", "--params", "{\\"spreadsheetId\\": \\"...\\", \\"range\\": \\"Sheet1!A1:C10\\"}"]',
      '  ["gmail", "users", "messages", "list", "--params", "{\\"userId\\": \\"me\\", \\"maxResults\\": 10}"]',
      '  ["calendar", "events", "list", "--params", "{\\"calendarId\\": \\"primary\\", \\"maxResults\\": 5}"]',
      "",
      "Only read methods are allowed (get, list, search, query, download, export, etc.).",
      "--format json is added automatically if not present.",
    ].join("\n"),
    parameters: {
      type: "object",
      properties: {
        command: {
          type: "array",
          items: { type: "string" },
          description:
            'The gws command arguments after `gws` (e.g. ["drive", "files", "list", "--params", "..."]).',
        },
      },
      required: ["command"],
      additionalProperties: false,
    } as any,
    execute: async (_toolCallId: string, params: any) => {
      const command: string[] = params.command;
      if (!Array.isArray(command) || !command.length)
        throw new Error("command is required and must be a non-empty array");

      const response = await fetch(
        `${ctx.gatekeeperInternalUrl}/api/google-workspace/read`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ command }),
        },
      );

      if (!response.ok) {
        const body = await response.text().catch(() => "");
        let errorText = body.slice(0, 2000);
        try {
          const parsed = JSON.parse(body) as { error?: string };
          if (parsed.error) errorText = parsed.error;
        } catch {
          // body wasn't JSON; use the raw text
        }
        return {
          content: [
            {
              type: "text",
              text: `gws read failed (${response.status}): ${errorText}`,
            },
          ],
        };
      }

      const result = (await response.json()) as {
        stdout: string;
        stderr: string;
        exitCode: number;
      };

      ctx.artifacts.push({
        type: "text",
        label: "GWS Read",
        value: command.join(" ").slice(0, 200),
      });

      if (result.exitCode !== 0) {
        const output = (result.stderr || result.stdout).slice(0, 2000);
        return {
          content: [
            {
              type: "text",
              text: `gws exited with code ${result.exitCode}:\n${output}`,
            },
          ],
        };
      }

      return {
        content: [{ type: "text", text: result.stdout.slice(0, 50000) }],
      };
    },
  };
}

export function createExecTool(ctx: MuteworkerPluginContext) {
  return {
    name: "google_workspace_exec",
    label: "Google Workspace Exec",
    description: [
      "Execute a write/mutating Google Workspace command via the gws CLI.",
      "Creates a verification request that must be human-approved before the command runs.",
      "",
      "Non-destructive edit commands (ie. append row instead of update cell) are recommended to minimize risk.",
      "",
      "Examples:",
      '  ["sheets", "spreadsheets", "values", "update", "--params", "{\\"spreadsheetId\\": \\"...\\", \\"range\\": \\"Sheet1!A1\\", \\"valueInputOption\\": \\"USER_ENTERED\\"}", "--json", "{\\"values\\": [[\\"hello\\"]]}"]',
      '  ["gmail", "users", "messages", "send", "--params", "{\\"userId\\": \\"me\\"}", "--json", "{\\"raw\\": \\"...\\"}"]',
      '  ["drive", "files", "delete", "--params", "{\\"fileId\\": \\"...\\"}"]',
      '  ["calendar", "events", "insert", "--params", "{\\"calendarId\\": \\"primary\\"}", "--json", "{\\"summary\\": \\"Meeting\\", \\"start\\": {...}, \\"end\\": {...}}"]',
    ].join("\n"),
    parameters: {
      type: "object",
      properties: {
        command: {
          type: "array",
          items: { type: "string" },
          description:
            'The gws command arguments after `gws` (e.g. ["sheets", "spreadsheets", "values", "update", "--params", "...", "--json", "..."]).',
        },
        description: {
          type: "string",
          description:
            "A human-readable description of what this command does (shown in the approval UI).",
        },
      },
      required: ["command", "description"],
      additionalProperties: false,
    } as any,
    execute: async (_toolCallId: string, params: any) => {
      const command: string[] = params.command;
      if (!Array.isArray(command) || !command.length)
        throw new Error("command is required and must be a non-empty array");
      const description = String(params.description ?? "").trim();
      if (!description) throw new Error("description is required");

      const response = await fetch(
        `${ctx.gatekeeperInternalUrl}/api/google-workspace/request`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            command,
            description,
            responseJobType: GWS_RESULT_JOB_TYPE,
            jobContext: { worker: "muteworker", jobId: ctx.job.id },
          }),
        },
      );

      if (!response.ok) {
        const body = await response.text().catch(() => "");
        throw new Error(
          `Google Workspace exec request failed (${response.status}): ${body.slice(0, 200)}`,
        );
      }

      const data = (await response.json()) as {
        verificationRequestId: number;
        requestId: string;
        status: string;
      };

      ctx.artifacts.push({
        type: "text",
        label: "GWS Exec Request",
        value: description.slice(0, 200),
      });

      return {
        content: [
          {
            type: "text",
            text: [
              "Google Workspace command queued and pending verification.",
              `Description: ${description}`,
              `Open ${ctx.gatekeeperExternalUrl} to approve the request.`,
              "The system will handle the result asynchronously after approval.",
            ].join("\n"),
          },
        ],
        details: data,
      };
    },
  };
}
