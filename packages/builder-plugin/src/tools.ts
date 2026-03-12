import type { MuteworkerPluginContext } from "@sandclaw/muteworker-plugin-api";
import { DEFAULT_BUILDER_RESULT_JOB_TYPE } from "./constants";

export function createRequestBuildTool(ctx: MuteworkerPluginContext) {
  return {
    name: "request_build",
    label: "Request Build",
    description:
      "Create a build request that must be human-approved before the Confidante agent executes it. " +
      "Use this to request code changes such as adding features, fixing bugs, or refactoring.",
    parameters: {
      type: "object",
      properties: {
        prompt: { type: "string" },
      },
      required: ["prompt"],
      additionalProperties: false,
    } as any,
    execute: async (_toolCallId: string, params: any) => {
      const prompt = String(params.prompt ?? "").trim();
      if (!prompt) throw new Error("prompt is required");

      const response = await fetch(
        `${ctx.gatekeeperInternalUrl}/api/builder/request`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            prompt,
            responseJobType: DEFAULT_BUILDER_RESULT_JOB_TYPE,
            jobContext: { worker: "muteworker", jobId: ctx.job.id },
          }),
        },
      );

      if (!response.ok) {
        const body = await response.text().catch(() => "");
        throw new Error(
          `Builder request failed (${response.status}): ${body.slice(0, 200)}`,
        );
      }

      const data = (await response.json()) as {
        verificationRequestId: number;
        requestId: string;
        status: string;
      };

      ctx.artifacts.push({
        type: "text",
        label: "Build Request",
        value: prompt,
      });

      return {
        content: [
          {
            type: "text",
            text: [
              "Build request queued and pending verification.",
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
