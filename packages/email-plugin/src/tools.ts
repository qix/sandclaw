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
    timestamp: number;
  }>;
  /** Markdown prompt from a matched email queue file. Added to the system prompt. */
  emailQueuePrompt?: string;
}

export function buildEmailPrompt(payload: IncomingEmailPayload): string {
  const historyLines = payload.history?.length
    ? [
        "--- Email Conversation History ---",
        ...payload.history.map(
          (h) =>
            `[${new Date(h.timestamp * 1000).toISOString()}] ${h.role === "assistant" ? "Assistant" : "User"}: ${h.text}`,
        ),
        "---------------------------------",
      ]
    : [];

  return [
    "--- Email received via JMAP ---",
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

export function createListInboxTool(ctx: MuteworkerPluginContext) {
  return {
    name: "list_jmap_inbox",
    label: "List Inbox Emails (JMAP)",
    description:
      "List recent emails in the inbox. Returns email subjects, senders, and IDs. Use read_jmap_email to get the full content of a specific email.",
    parameters: {
      type: "object",
      properties: {
        limit: {
          type: "number",
          description:
            "Maximum number of emails to return (default 25, max 100)",
        },
      },
      required: [],
      additionalProperties: false,
    } as any,
    execute: async (_toolCallId: string, params: any) => {
      const limit = Math.min(params.limit ?? 25, 100);

      const response = await fetch(
        `${ctx.gatekeeperInternalUrl}/api/email/inbox?limit=${limit}`,
      );

      if (!response.ok) {
        const body = await response.text().catch(() => "");
        throw new Error(
          `Inbox fetch failed (${response.status}): ${body.slice(0, 200)}`,
        );
      }

      const result = (await response.json()) as {
        emails: Array<{
          id: string;
          subject: string;
          from: string;
          receivedAt: string;
        }>;
      };

      if (result.emails.length === 0) {
        return {
          content: [{ type: "text", text: "Inbox is empty." }],
        };
      }

      const lines = result.emails.map(
        (e) =>
          `[${e.id}] From: ${e.from} | Subject: ${e.subject} | ${e.receivedAt}`,
      );

      return {
        content: [
          {
            type: "text",
            text: `${result.emails.length} email(s) in inbox:\n\n${lines.join("\n")}`,
          },
        ],
      };
    },
  };
}

export function createSearchEmailsTool(ctx: MuteworkerPluginContext) {
  return {
    name: "search_jmap_emails",
    label: "Search Emails (JMAP)",
    description:
      "Search emails by text query. Returns matching email subjects, senders, and IDs. Use read_jmap_email to get the full content of a specific email.",
    parameters: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "Text to search for across email subjects and bodies",
        },
        limit: {
          type: "number",
          description:
            "Maximum number of results to return (default 25, max 100)",
        },
      },
      required: ["query"],
      additionalProperties: false,
    } as any,
    execute: async (_toolCallId: string, params: any) => {
      const { query } = params;
      const limit = Math.min(params.limit ?? 25, 100);

      const response = await fetch(
        `${ctx.gatekeeperInternalUrl}/api/email/search?q=${encodeURIComponent(query)}&limit=${limit}`,
      );

      if (!response.ok) {
        const body = await response.text().catch(() => "");
        throw new Error(
          `Email search failed (${response.status}): ${body.slice(0, 200)}`,
        );
      }

      const result = (await response.json()) as {
        emails: Array<{
          id: string;
          subject: string;
          from: string;
          receivedAt: string;
        }>;
      };

      if (result.emails.length === 0) {
        return {
          content: [
            {
              type: "text",
              text: `No emails found matching "${query}".`,
            },
          ],
        };
      }

      const lines = result.emails.map(
        (e) =>
          `[${e.id}] From: ${e.from} | Subject: ${e.subject} | ${e.receivedAt}`,
      );

      return {
        content: [
          {
            type: "text",
            text: `${result.emails.length} email(s) matching "${query}":\n\n${lines.join("\n")}`,
          },
        ],
      };
    },
  };
}

export function createReadEmailTool(ctx: MuteworkerPluginContext) {
  return {
    name: "read_jmap_email",
    label: "Read Email (JMAP)",
    description:
      "Read the full content of a specific email by its ID. Use list_jmap_inbox or search_jmap_emails first to find email IDs.",
    parameters: {
      type: "object",
      properties: {
        email_id: {
          type: "string",
          description: "The JMAP email ID to read",
        },
      },
      required: ["email_id"],
      additionalProperties: false,
    } as any,
    execute: async (_toolCallId: string, params: any) => {
      const { email_id } = params;

      const response = await fetch(
        `${ctx.gatekeeperInternalUrl}/api/email/read/${encodeURIComponent(email_id)}`,
      );

      if (!response.ok) {
        const body = await response.text().catch(() => "");
        throw new Error(
          `Email read failed (${response.status}): ${body.slice(0, 200)}`,
        );
      }

      const result = (await response.json()) as {
        email: {
          id: string;
          threadId: string;
          from: string;
          to: string;
          subject: string;
          receivedAt: string;
          textBody: string;
        };
      };

      const e = result.email;
      const text = [
        `From: ${e.from}`,
        `To: ${e.to}`,
        `Subject: ${e.subject}`,
        `Date: ${e.receivedAt}`,
        `Thread ID: ${e.threadId}`,
        `Email ID: ${e.id}`,
        "",
        e.textBody || "[No text content]",
      ].join("\n");

      return {
        content: [{ type: "text", text }],
      };
    },
  };
}

export function createSendEmailTool(ctx: MuteworkerPluginContext) {
  return {
    name: "send_jmap_email",
    label: "Send Email (JMAP)",
    description:
      "Request sending an email via JMAP. The send requires human verification before delivery.",
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
        `${ctx.gatekeeperInternalUrl}/api/email/send`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ to, subject, text }),
        },
      );

      if (!response.ok) {
        const body = await response.text().catch(() => "");
        throw new Error(
          `Email send failed (${response.status}): ${body.slice(0, 200)}`,
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
