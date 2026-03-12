import type { MuteworkerPluginContext } from "@sandclaw/muteworker-plugin-api";
import { DEFAULT_BROWSER_RESULT_JOB_TYPE } from "./constants";

export function createRequestBrowseTool(ctx: MuteworkerPluginContext) {
  return {
    name: "request_browse",
    label: "Request Browse",
    description:
      "Create a browsing request that must be human-approved before the Confidante agent executes it. " +
      "Use this to request web browsing tasks such as researching topics, filling out forms, or extracting data from websites.",
    parameters: {
      type: "object",
      properties: {
        prompt: { type: "string" },
        url: { type: "string" },
      },
      required: ["prompt"],
      additionalProperties: false,
    } as any,
    execute: async (_toolCallId: string, params: any) => {
      const prompt = String(params.prompt ?? "").trim();
      if (!prompt) throw new Error("prompt is required");
      const url = params.url ? String(params.url).trim() : undefined;

      const response = await fetch(
        `${ctx.gatekeeperInternalUrl}/api/browser/request`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            prompt,
            url,
            responseJobType: DEFAULT_BROWSER_RESULT_JOB_TYPE,
            jobContext: { worker: "muteworker", jobId: ctx.job.id },
          }),
        },
      );

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
        label: "Browse Request",
        value: prompt,
      });

      return {
        content: [
          {
            type: "text",
            text: [
              "Browse request queued and pending verification.",
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
