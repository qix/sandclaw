import type { MuteworkerPluginContext } from "@sandclaw/muteworker-plugin-api";

export interface FileToolConfig {
  /** Tool name, e.g. "obsidian_edit" or "edit_prompt_file". */
  name: string;
  /** Human-readable label, e.g. "Edit Obsidian Note". */
  label: string;
  /** Tool description shown to the model. */
  description: string;
  /** Artifact label, e.g. "Obsidian Edit Request". */
  artifactLabel: string;
  /** API route base path, e.g. "/api/obsidian". */
  apiBase: string;
}

export function createFileEditTool(
  ctx: MuteworkerPluginContext,
  config: FileToolConfig,
) {
  return {
    name: config.name,
    label: config.label,
    description: config.description,
    parameters: {
      type: "object",
      properties: {
        path: {
          type: "string",
          description: "Relative path to the file.",
        },
        old_string: {
          type: "string",
          description: "The exact text to find and replace.",
        },
        new_string: {
          type: "string",
          description:
            "The text to replace it with (must differ from old_string).",
        },
        replace_all: {
          type: "boolean",
          description:
            "Replace all occurrences of old_string. Default false (requires old_string to be unique).",
        },
      },
      required: ["path", "old_string", "new_string"],
      additionalProperties: false,
    } as any,
    execute: async (_toolCallId: string, params: any) => {
      const notePath = String(params.path ?? "").trim();
      if (!notePath) throw new Error("path is required");
      const oldString = params.old_string;
      if (typeof oldString !== "string" || !oldString)
        throw new Error("old_string is required");
      const newString = params.new_string;
      if (typeof newString !== "string")
        throw new Error("new_string must be a string");
      if (oldString === newString)
        throw new Error("old_string and new_string must differ");

      const response = await fetch(
        `${ctx.gatekeeperInternalUrl}${config.apiBase}/edit`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            path: notePath,
            old_string: oldString,
            new_string: newString,
            replace_all: params.replace_all === true,
            jobContext: { worker: "muteworker", jobId: ctx.job.id },
          }),
        },
      );

      if (!response.ok) {
        const body = await response.text().catch(() => "");
        throw new Error(
          `${config.label} failed (${response.status}): ${body.slice(0, 200)}`,
        );
      }

      const data = (await response.json()) as any;
      ctx.artifacts.push({
        type: "text",
        label: config.artifactLabel,
        value: data.path,
      });

      return {
        content: [
          {
            type: "text",
            text: [
              `Queued edit verification #${data.verificationRequestId}.`,
              "No file has been changed yet.",
              `Path: ${data.path}`,
              `Mode: edit`,
              `Diff: +${data.diff.added} -${data.diff.removed} =${data.diff.unchanged}`,
              `Open ${ctx.gatekeeperExternalUrl} to review and approve this change.`,
            ].join("\n"),
          },
        ],
        details: data,
      };
    },
  };
}

export function createFileWriteTool(
  ctx: MuteworkerPluginContext,
  config: FileToolConfig,
) {
  return {
    name: config.name,
    label: config.label,
    description: config.description,
    parameters: {
      type: "object",
      properties: {
        path: { type: "string" },
        content: { type: "string" },
      },
      required: ["path", "content"],
      additionalProperties: false,
    } as any,
    execute: async (_toolCallId: string, params: any) => {
      const notePath = String(params.path ?? "").trim();
      if (!notePath) throw new Error("path is required");
      if (typeof params.content !== "string")
        throw new Error("content must be a string");

      const response = await fetch(
        `${ctx.gatekeeperInternalUrl}${config.apiBase}/write`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            path: notePath,
            content: params.content,
            jobContext: { worker: "muteworker", jobId: ctx.job.id },
          }),
        },
      );

      if (!response.ok) {
        const body = await response.text().catch(() => "");
        throw new Error(
          `${config.label} failed (${response.status}): ${body.slice(0, 200)}`,
        );
      }

      const data = (await response.json()) as any;
      ctx.artifacts.push({
        type: "text",
        label: config.artifactLabel,
        value: data.path,
      });

      return {
        content: [
          {
            type: "text",
            text: [
              `Queued write verification #${data.verificationRequestId}.`,
              "No file has been changed yet.",
              `Path: ${data.path}`,
              `Mode: overwrite`,
              `Diff: +${data.diff.added} -${data.diff.removed} =${data.diff.unchanged}`,
              `Open ${ctx.gatekeeperExternalUrl} to review and approve this change.`,
            ].join("\n"),
          },
        ],
        details: data,
      };
    },
  };
}
