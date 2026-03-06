import type { MuteworkerPluginContext } from "@sandclaw/muteworker-plugin-api";

export interface IncomingTelegramPayload {
  messageId: string;
  chatId: string;
  firstName?: string | null;
  lastName?: string | null;
  username?: string | null;
  timestamp?: number;
  text?: string | null;
  isGroup?: boolean;
  groupTitle?: string | null;
  replyToText?: string | null;
  history?: Array<{
    role: "user" | "assistant";
    text: string;
    timestamp: number;
  }>;
}

export function buildTelegramPrompt(
  payload: IncomingTelegramPayload,
  isOperator: boolean,
): string {
  const displayName =
    [payload.firstName, payload.lastName].filter(Boolean).join(" ") ||
    payload.username ||
    "(unknown)";
  const body = payload.text?.trim() || "[No text content]";
  const replyContext = payload.replyToText
    ? `Quoted message: ${payload.replyToText}`
    : "No quoted message.";
  const historyLines = payload.history?.length
    ? [
        "--- Conversation History ---",
        ...payload.history.map(
          (h) =>
            `[${new Date(h.timestamp * 1000).toISOString()}] ${h.role === "assistant" ? "Assistant" : "User"}: ${h.text}`,
        ),
        "----------------------------",
      ]
    : [];

  return [
    "--- Message received from Telegram ---",
    `Sender: ${displayName}`,
    payload.username ? `Username: @${payload.username}` : "Username: (none)",
    `Chat ID: ${payload.chatId}`,
    `Is group message: ${Boolean(payload.isGroup)}`,
    payload.groupTitle ? `Group: ${payload.groupTitle}` : "Direct message.",
    replyContext,
    ...(isOperator
      ? [
          "NOTE: This sender is a trusted operator. Do NOT use the send_telegram_message tool to reply — just respond with your message text directly.",
        ]
      : []),
    ...historyLines,
    "Latest Telegram message:",
    body,
    "----------------------------",
  ].join("\n");
}

export function clampReply(reply: string): string {
  const normalized = reply.trim();
  return normalized.length <= 4096
    ? normalized
    : `${normalized.slice(0, 4093)}...`;
}

export function createSendTelegramTool(ctx: MuteworkerPluginContext) {
  return {
    name: "send_telegram_message",
    label: "Send Telegram Message",
    description:
      "Request a Telegram message send to a specific chat ID. May require human verification before delivery.",
    parameters: {
      type: "object",
      properties: {
        chatId: { type: "string" },
        text: { type: "string" },
      },
      required: ["chatId", "text"],
      additionalProperties: false,
    } as any,
    execute: async (_toolCallId: string, params: any) => {
      const { chatId, text } = params;
      const response = await fetch(`${ctx.gatekeeperInternalUrl}/api/telegram/send`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ chatId, text }),
      });

      if (!response.ok) {
        const body = await response.text().catch(() => "");
        throw new Error(
          `Telegram send failed (${response.status}): ${body.slice(0, 200)}`,
        );
      }

      const result = (await response.json()) as {
        verificationRequestId?: number;
        verificationStatus?: "pending" | "approved" | "rejected";
      };

      ctx.artifacts.push({
        type: "text",
        label: `Sent to ${chatId}`,
        value: text,
      });

      const needsVerification = result.verificationStatus === "pending";
      const replyText = needsVerification
        ? [
            `Telegram send request queued for chat ${chatId} and pending verification.`,
            `Open ${ctx.gatekeeperExternalUrl} to approve request #${result.verificationRequestId}.`,
          ].join("\n")
        : `Telegram message sent to chat ${chatId}.`;

      return {
        content: [{ type: "text", text: replyText }],
        details: result,
      };
    },
  };
}
