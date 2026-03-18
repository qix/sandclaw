import type { MuteworkerPluginContext } from "@sandclaw/muteworker-plugin-api";

export function createSearchTool(ctx: MuteworkerPluginContext) {
  return {
    name: "obsidian_search",
    label: "Search Obsidian Notes",
    description:
      "Search notes in the Obsidian vault using full-text BM25 search. Use this before reading specific files.",
    parameters: {
      type: "object",
      properties: {
        query: { type: "string" },
        limit: { type: "number" },
      },
      required: ["query"],
      additionalProperties: false,
    } as any,
    execute: async (_toolCallId: string, params: any) => {
      const query = String(params.query ?? "").trim();
      if (!query) throw new Error("query is required");
      const limit =
        params.limit != null
          ? Math.max(1, Math.min(20, Math.floor(Number(params.limit))))
          : 5;

      const response = await fetch(
        `${ctx.gatekeeperInternalUrl}/api/obsidian/search`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ query, limit }),
        },
      );

      if (!response.ok) {
        const body = await response.text().catch(() => "");
        throw new Error(
          `Obsidian search failed (${response.status}): ${body.slice(0, 200)}`,
        );
      }

      const data = (await response.json()) as any;
      ctx.artifacts.push({
        type: "text",
        label: "Obsidian Search",
        value: query,
      });

      if (!data.results?.length) {
        return {
          content: [{ type: "text", text: `No notes matched "${query}".` }],
          details: data,
        };
      }

      const rendered = data.results
        .map((r: any, i: number) => {
          const score = Number.isFinite(r.score)
            ? r.score.toFixed(3)
            : String(r.score);
          return [
            `${i + 1}. ${r.path} (score ${score})`,
            r.title ? `Title: ${r.title}` : "",
            r.excerpt?.trim() ? `Excerpt: ${r.excerpt.trim()}` : "",
          ]
            .filter(Boolean)
            .join("\n");
        })
        .join("\n\n");

      return { content: [{ type: "text", text: rendered }], details: data };
    },
  };
}

export function createListTool(ctx: MuteworkerPluginContext) {
  return {
    name: "obsidian_list",
    label: "List Obsidian Directory",
    description:
      "List files and subdirectories in an Obsidian vault directory. Omit path or use '.' to list the vault root.",
    parameters: {
      type: "object",
      properties: {
        path: { type: "string" },
      },
      required: [],
      additionalProperties: false,
    } as any,
    execute: async (_toolCallId: string, params: any) => {
      const dirPath = String(params.path ?? "").trim();

      const response = await fetch(
        `${ctx.gatekeeperInternalUrl}/api/obsidian/list`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ path: dirPath || undefined }),
        },
      );

      if (!response.ok) {
        const body = await response.text().catch(() => "");
        throw new Error(
          `Obsidian list failed (${response.status}): ${body.slice(0, 200)}`,
        );
      }

      const data = (await response.json()) as any;
      ctx.artifacts.push({
        type: "text",
        label: "Obsidian List",
        value: data.path,
      });

      if (!data.items?.length) {
        return {
          content: [
            { type: "text", text: `Path: ${data.path}\n\nDirectory is empty.` },
          ],
          details: data,
        };
      }

      const lines = data.items.map((item: any) =>
        item.type === "directory" ? `${item.name}/` : item.name,
      );

      return {
        content: [
          {
            type: "text",
            text: `Path: ${data.path}\n\n${lines.join("\n")}`,
          },
        ],
        details: data,
      };
    },
  };
}

export function createReadTool(ctx: MuteworkerPluginContext) {
  return {
    name: "obsidian_read",
    label: "Read Obsidian Note",
    description:
      "Read a specific note from the Obsidian vault by relative path.",
    parameters: {
      type: "object",
      properties: {
        path: { type: "string" },
        maxChars: { type: "number" },
      },
      required: ["path"],
      additionalProperties: false,
    } as any,
    execute: async (_toolCallId: string, params: any) => {
      const notePath = String(params.path ?? "").trim();
      if (!notePath) throw new Error("path is required");

      const payload: Record<string, unknown> = { path: notePath };
      if (params.maxChars != null)
        payload.maxChars = Math.floor(Number(params.maxChars));

      const response = await fetch(
        `${ctx.gatekeeperInternalUrl}/api/obsidian/read`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(payload),
        },
      );

      if (!response.ok) {
        const body = await response.text().catch(() => "");
        throw new Error(
          `Obsidian read failed (${response.status}): ${body.slice(0, 200)}`,
        );
      }

      const data = (await response.json()) as any;
      ctx.artifacts.push({
        type: "text",
        label: "Obsidian Read",
        value: data.path,
      });

      const suffix = data.truncated ? "\n\n[Output truncated by maxChars]" : "";
      return {
        content: [
          {
            type: "text",
            text: `Path: ${data.path}\n\n${data.content}${suffix}`,
          },
        ],
        details: data,
      };
    },
  };
}

export function createAddDailyTaskTool(ctx: MuteworkerPluginContext) {
  return {
    name: "obsidian_add_daily_task",
    label: "Add Daily Task",
    description:
      "Add a new task to an Obsidian daily note. " +
      "The task is appended after the last checkbox line (- [ ] or - [x]) with an #ai tag. " +
      "This action is applied immediately without verification.",
    parameters: {
      type: "object",
      properties: {
        path: { type: "string" },
        task: { type: "string" },
      },
      required: ["path", "task"],
      additionalProperties: false,
    } as any,
    execute: async (_toolCallId: string, params: any) => {
      const notePath = String(params.path ?? "").trim();
      if (!notePath) throw new Error("path is required");
      const task = String(params.task ?? "").trim();
      if (!task) throw new Error("task is required");

      const response = await fetch(
        `${ctx.gatekeeperInternalUrl}/api/obsidian/add-daily-task`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ path: notePath, task }),
        },
      );

      if (!response.ok) {
        const body = await response.text().catch(() => "");
        throw new Error(
          `Add daily task failed (${response.status}): ${body.slice(0, 200)}`,
        );
      }

      const data = (await response.json()) as any;
      ctx.artifacts.push({
        type: "text",
        label: "Obsidian Add Daily Task",
        value: data.path,
      });

      return {
        content: [
          {
            type: "text",
            text: `Added task to ${data.path}:\n${data.task}`,
          },
        ],
        details: data,
      };
    },
  };
}

export function createModifyDailyTaskTool(ctx: MuteworkerPluginContext) {
  return {
    name: "obsidian_modify_daily_task",
    label: "Modify Daily Task",
    description:
      "Modify an existing task in an Obsidian daily note. " +
      "Only tasks tagged with #ai can be modified. " +
      "The #ai tag is preserved unless explicitly removed. " +
      "This action is applied immediately without verification.",
    parameters: {
      type: "object",
      properties: {
        path: { type: "string" },
        original: { type: "string" },
        new_content: { type: "string" },
      },
      required: ["path", "original", "new_content"],
      additionalProperties: false,
    } as any,
    execute: async (_toolCallId: string, params: any) => {
      const notePath = String(params.path ?? "").trim();
      if (!notePath) throw new Error("path is required");
      const original = String(params.original ?? "").trim();
      if (!original) throw new Error("original is required");
      if (typeof params.new_content !== "string")
        throw new Error("new_content must be a string");

      const response = await fetch(
        `${ctx.gatekeeperInternalUrl}/api/obsidian/modify-daily-task`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            path: notePath,
            original,
            new_content: params.new_content,
          }),
        },
      );

      if (!response.ok) {
        const body = await response.text().catch(() => "");
        throw new Error(
          `Modify daily task failed (${response.status}): ${body.slice(0, 200)}`,
        );
      }

      const data = (await response.json()) as any;
      ctx.artifacts.push({
        type: "text",
        label: "Obsidian Modify Daily Task",
        value: data.path,
      });

      return {
        content: [
          {
            type: "text",
            text: `Modified task in ${data.path}:\n"${data.original}" → "${data.modified}"`,
          },
        ],
        details: data,
      };
    },
  };
}

export function createWriteTool(ctx: MuteworkerPluginContext) {
  return {
    name: "obsidian_write",
    label: "Write Obsidian Note",
    description:
      "Create a verification request to write text to an Obsidian note. " +
      "The entire note will be overwritten, so be sure to read the note first if you want to preserve existing content. " +
      "No changes will be made until a human approves the verification request.",
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
        `${ctx.gatekeeperInternalUrl}/api/obsidian/write`,
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
          `Obsidian write failed (${response.status}): ${body.slice(0, 200)}`,
        );
      }

      const data = (await response.json()) as any;
      ctx.artifacts.push({
        type: "text",
        label: "Obsidian Write Request",
        value: data.path,
      });

      return {
        content: [
          {
            type: "text",
            text: [
              `Queued Obsidian write verification #${data.verificationRequestId}.`,
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
