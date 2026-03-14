import type { MuteworkerPluginContext } from "@sandclaw/muteworker-plugin-api";

export interface IncomingEmailPayload {
  messageId: string;
  from: string;
  to: string;
  subject: string;
  text: string;
  threadId?: string | null;
  history?: Array<{
    role: "user" | "assistant";
    text: string;
    timestamp: string;
  }>;
}

export function buildEmailPrompt(payload: IncomingEmailPayload): string {
  const historyLines = payload.history?.length
    ? [
        "--- Email Conversation History ---",
        ...payload.history.map(
          (h) =>
            `[${h.timestamp}] ${h.role === "assistant" ? "Assistant" : "User"}: ${h.text}`,
        ),
        "---------------------------------",
      ]
    : [];

  return [
    "--- Email received via Gmail ---",
    `From: ${payload.from}`,
    `To: ${payload.to}`,
    `Subject: ${payload.subject}`,
    payload.threadId ? `Thread ID: ${payload.threadId}` : "",
    ...historyLines,
    "Latest email body:",
    payload.text || "[No text content]",
    "---------------------------------",
  ]
    .filter(Boolean)
    .join("\n");
}

export function createSendEmailTool(ctx: MuteworkerPluginContext) {
  return {
    name: "send_email",
    label: "Send Email",
    description:
      "Request sending an email via Gmail. The send requires human verification before delivery.",
    parameters: {
      type: "object",
      properties: {
        to: { type: "string" },
        subject: { type: "string" },
        text: { type: "string" },
      },
      required: ["to", "subject", "text"],
      additionalProperties: false,
    } as any,
    execute: async (_toolCallId: string, params: any) => {
      const { to, subject, text } = params;

      const response = await fetch(
        `${ctx.gatekeeperInternalUrl}/api/gmail/send`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            to,
            subject,
            text,
            jobContext: { worker: "muteworker", jobId: ctx.job.id },
          }),
        },
      );

      if (!response.ok) {
        const body = await response.text().catch(() => "");
        throw new Error(
          `Gmail send failed (${response.status}): ${body.slice(0, 200)}`,
        );
      }

      const result = (await response.json()) as {
        verificationRequestId?: number;
        verificationStatus?: string;
      };

      ctx.artifacts.push({
        type: "text",
        label: `Email to ${to}`,
        value: subject,
      });

      const needsVerification = result.verificationStatus === "pending";
      const replyText = needsVerification
        ? [
            `Email send request queued for ${to} (subject: "${subject}") and pending verification.`,
            `Open ${ctx.gatekeeperExternalUrl} to approve request #${result.verificationRequestId}.`,
          ].join("\n")
        : `Email sent to ${to}.`;

      return {
        content: [{ type: "text", text: replyText }],
        details: result,
      };
    },
  };
}
