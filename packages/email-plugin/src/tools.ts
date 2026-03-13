import type { MuteworkerPluginContext } from "@sandclaw/muteworker-plugin-api";
import type { JmapCalendarEvent } from "./calendarClient";

export interface CalendarInvitePayload {
  eventId: string;
  title: string;
  organizer: string;
  start: string;
  timeZone: string;
  duration: string;
  location: string;
  description: string;
  participants: string;
  /** Path to a system prompt file to prepend to the agent's system prompt. */
  systemPromptFile?: string;
}

export function buildCalendarInvitePrompt(
  payload: CalendarInvitePayload,
): string {
  return [
    "--- Calendar Invite Received ---",
    `Title: ${payload.title}`,
    `Organizer: ${payload.organizer}`,
    `When: ${payload.start}${payload.timeZone ? ` (${payload.timeZone})` : ""}`,
    payload.duration ? `Duration: ${payload.duration}` : "",
    payload.location ? `Location: ${payload.location}` : "",
    payload.participants ? `Participants: ${payload.participants}` : "",
    payload.description ? `\nDescription:\n${payload.description}` : "",
    `Event ID: ${payload.eventId}`,
    "---------------------------------",
    "",
    "A calendar invitation needs your attention. You can use respond_calendar_invite to accept, decline, or tentatively accept it.",
  ]
    .filter(Boolean)
    .join("\n");
}

export function formatCalendarEventText(e: JmapCalendarEvent): string {
  const organizer = e.organizer
    ? e.organizer.name
      ? `${e.organizer.name} <${e.organizer.email}>`
      : e.organizer.email
    : "Unknown";

  const attendees = e.participants
    .filter((p) => !p.roles.includes("owner"))
    .map(
      (p) =>
        `${p.name || p.email} (${p.participationStatus}${p.isSelf ? ", you" : ""})`,
    )
    .join(", ");

  return [
    `Title: ${e.title}`,
    `Organizer: ${organizer}`,
    `Start: ${e.start}${e.timeZone ? ` (${e.timeZone})` : ""}`,
    e.duration ? `Duration: ${e.duration}` : "",
    e.location ? `Location: ${e.location}` : "",
    `Status: ${e.status}`,
    attendees ? `Attendees: ${attendees}` : "",
    `Event ID: ${e.id}`,
    e.description ? `\nDescription:\n${e.description}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

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
  /** Path to a system prompt file to prepend to the agent's system prompt. */
  systemPromptFile?: string;
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

// ---------------------------------------------------------------------------
// Calendar tools
// ---------------------------------------------------------------------------

export function createListCalendarInvitesTool(ctx: MuteworkerPluginContext) {
  return {
    name: "list_calendar_invites",
    label: "List Calendar Invites (JMAP)",
    description:
      "List pending calendar invitations that need a response (accept/decline/tentative). Returns event titles, organizers, times, and IDs. Use read_calendar_event for full details or respond_calendar_invite to respond.",
    parameters: {
      type: "object",
      properties: {},
      required: [],
      additionalProperties: false,
    } as any,
    execute: async (_toolCallId: string, _params: any) => {
      const response = await fetch(
        `${ctx.gatekeeperInternalUrl}/api/email/calendar/invites`,
      );

      if (!response.ok) {
        const body = await response.text().catch(() => "");
        throw new Error(
          `Calendar invites fetch failed (${response.status}): ${body.slice(0, 200)}`,
        );
      }

      const result = (await response.json()) as {
        invites: JmapCalendarEvent[];
      };

      if (result.invites.length === 0) {
        return {
          content: [{ type: "text", text: "No pending calendar invitations." }],
        };
      }

      const lines = result.invites.map((e) => {
        const organizer = e.organizer
          ? e.organizer.name || e.organizer.email
          : "Unknown";
        return `[${e.id}] "${e.title}" from ${organizer} | ${e.start}${e.timeZone ? ` (${e.timeZone})` : ""}${e.location ? ` | ${e.location}` : ""}`;
      });

      return {
        content: [
          {
            type: "text",
            text: `${result.invites.length} pending calendar invitation(s):\n\n${lines.join("\n")}`,
          },
        ],
      };
    },
  };
}

export function createReadCalendarEventTool(ctx: MuteworkerPluginContext) {
  return {
    name: "read_calendar_event",
    label: "Read Calendar Event (JMAP)",
    description:
      "Read the full details of a calendar event by its ID, including participants and their response status.",
    parameters: {
      type: "object",
      properties: {
        event_id: {
          type: "string",
          description: "The calendar event ID to read",
        },
      },
      required: ["event_id"],
      additionalProperties: false,
    } as any,
    execute: async (_toolCallId: string, params: any) => {
      const { event_id } = params;

      const response = await fetch(
        `${ctx.gatekeeperInternalUrl}/api/email/calendar/event/${encodeURIComponent(event_id)}`,
      );

      if (!response.ok) {
        const body = await response.text().catch(() => "");
        throw new Error(
          `Calendar event read failed (${response.status}): ${body.slice(0, 200)}`,
        );
      }

      const result = (await response.json()) as { event: JmapCalendarEvent };
      const text = formatCalendarEventText(result.event);

      return {
        content: [{ type: "text", text }],
      };
    },
  };
}

export function createRespondCalendarInviteTool(ctx: MuteworkerPluginContext) {
  return {
    name: "respond_calendar_invite",
    label: "Respond to Calendar Invite (JMAP)",
    description:
      'Accept, decline, or tentatively accept a calendar invitation. The response requires human verification before being sent. Use "accepted", "declined", or "tentative".',
    parameters: {
      type: "object",
      properties: {
        event_id: {
          type: "string",
          description: "The calendar event ID to respond to",
        },
        response: {
          type: "string",
          enum: ["accepted", "declined", "tentative"],
          description: 'Your response: "accepted", "declined", or "tentative"',
        },
      },
      required: ["event_id", "response"],
      additionalProperties: false,
    } as any,
    execute: async (_toolCallId: string, params: any) => {
      const { event_id, response: inviteResponse } = params;

      const res = await fetch(
        `${ctx.gatekeeperInternalUrl}/api/email/calendar/respond`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            eventId: event_id,
            response: inviteResponse,
            jobContext: { worker: "muteworker", jobId: ctx.job.id },
          }),
        },
      );

      if (!res.ok) {
        const body = await res.text().catch(() => "");
        throw new Error(
          `Calendar respond failed (${res.status}): ${body.slice(0, 200)}`,
        );
      }

      const result = (await res.json()) as {
        verificationRequestId?: number;
        verificationStatus?: string;
      };

      ctx.artifacts.push({
        type: "text",
        label: `Calendar: ${inviteResponse}`,
        value: event_id,
      });

      const needsVerification = result.verificationStatus === "pending";
      const replyText = needsVerification
        ? [
            `Calendar invite response "${inviteResponse}" queued and pending verification.`,
            `Open ${ctx.gatekeeperExternalUrl} to approve request #${result.verificationRequestId}.`,
          ].join("\n")
        : `Calendar invite response "${inviteResponse}" sent.`;

      return {
        content: [{ type: "text", text: replyText }],
        details: result,
      };
    },
  };
}
