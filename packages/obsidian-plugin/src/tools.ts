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

      const response = await fetch(`${ctx.apiBaseUrl}/api/obsidian/search`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ query, limit }),
      });

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

      const response = await fetch(`${ctx.apiBaseUrl}/api/obsidian/read`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });

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
        content: [{ type: "text", text: `${data.content}${suffix}` }],
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
      "Create a verification request to write text to an Obsidian note. A human must approve the diff before the file is changed.",
    parameters: {
      type: "object",
      properties: {
        path: { type: "string" },
        content: { type: "string" },
        append: { type: "boolean" },
      },
      required: ["path", "content"],
      additionalProperties: false,
    } as any,
    execute: async (_toolCallId: string, params: any) => {
      const notePath = String(params.path ?? "").trim();
      if (!notePath) throw new Error("path is required");
      if (typeof params.content !== "string")
        throw new Error("content must be a string");

      const response = await fetch(`${ctx.apiBaseUrl}/api/obsidian/write`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          path: notePath,
          content: params.content,
          append: params.append === true,
        }),
      });

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
        value: `${data.path} (${data.mode})`,
      });

      return {
        content: [
          {
            type: "text",
            text: [
              `Queued Obsidian write verification #${data.verificationRequestId}.`,
              "No file has been changed yet.",
              `Path: ${data.path}`,
              `Mode: ${data.mode}`,
              `Diff: +${data.diff.added} -${data.diff.removed} =${data.diff.unchanged}`,
              `Open ${ctx.verificationUiUrl} to review and approve this change.`,
            ].join("\n"),
          },
        ],
        details: data,
      };
    },
  };
}
