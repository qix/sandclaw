import type { MuteworkerPluginContext } from "@sandclaw/muteworker-plugin-api";
import { DEFAULT_BROWSER_RESULT_JOB_TYPE } from "./constants";

export function createRequestBrowserTool(ctx: MuteworkerPluginContext) {
  return {
    name: "request_browser",
    label: "Request Browser Research",
    description:
      "Create a browser research request that must be human-approved before the Confidante agent executes it. Use this for web lookups, news, and online research.",
    parameters: {
      type: "object",
      properties: {
        query: { type: "string" },
      },
      required: ["query"],
      additionalProperties: false,
    } as any,
    execute: async (_toolCallId: string, params: any) => {
      const query = String(params.query ?? "").trim();
      if (!query) throw new Error("query is required");

      const response = await fetch(`${ctx.apiBaseUrl}/api/browser/request`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          prompt: query,
          responseJobType: DEFAULT_BROWSER_RESULT_JOB_TYPE,
        }),
      });

      if (!response.ok) {
        const body = await response.text().catch(() => "");
        throw new Error(
          `Browser request failed (${response.status}): ${body.slice(0, 200)}`,
        );
      }

      const data = (await response.json()) as {
        verificationRequestId: number;
        requestId: string;
        status: string;
      };

      ctx.artifacts.push({
        type: "text",
        label: "Browser Request",
        value: query,
      });

      return {
        content: [
          {
            type: "text",
            text: [
              "Browser research request queued and pending verification.",
              `Open ${ctx.verificationUiUrl} to approve the request.`,
              "The system will handle the result asynchronously after approval.",
            ].join("\n"),
          },
        ],
        details: data,
      };
    },
  };
}
