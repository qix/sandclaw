import type { MuteworkerPluginContext } from "@sandclaw/muteworker-plugin-api";

export interface IncomingChatPayload {
  text: string;
  history?: Array<{
    role: "user" | "assistant";
    text: string;
    timestamp: string;
  }>;
}

export interface BuildChatPromptOptions {
  /** Local-FS path containing the full chat log as NDJSON. */
  conversationLogFile?: string | null;
}

export function buildChatPrompt(
  payload: IncomingChatPayload,
  options: BuildChatPromptOptions = {},
): string {
  const body = payload.text?.trim() || "[No text content]";
  const historyLines = payload.history?.length
    ? [
        "--- Conversation History (recent) ---",
        ...payload.history.map(
          (h) =>
            `[${h.timestamp}] ${h.role === "assistant" ? "Assistant" : "User"}: ${h.text}`,
        ),
        "-------------------------------------",
      ]
    : [];

  const logHint = options.conversationLogFile
    ? [
        `Full chat history is appended as NDJSON at: ${options.conversationLogFile}`,
        "If you need more context than the recent history above, use the Read tool",
        "to inspect that file, or the Bash tool with grep / jq / tail to query it",
        "(e.g. `tail -n 200 <file> | jq .`).",
      ]
    : [];

  return [
    "--- Message received from Chat UI ---",
    "Sender: Operator (trusted, direct browser chat)",
    "NOTE: This is the operator chatting directly. Respond with your message text directly.",
    ...logHint,
    ...historyLines,
    "Latest message:",
    body,
    "----------------------------",
  ].join("\n");
}

export function clampReply(reply: string): string {
  const normalized = reply.trim();
  return normalized.length <= 2000
    ? normalized
    : `${normalized.slice(0, 1997)}...`;
}

export function createSendChatTool(ctx: MuteworkerPluginContext) {
  return {
    name: "send_chat_message",
    label: "Send Chat Message",
    description:
      "Send a message back to the operator in the browser chat interface. Messages are delivered immediately without verification.",
    parameters: {
      type: "object",
      properties: {
        text: { type: "string", description: "The message text to send" },
      },
      required: ["text"],
      additionalProperties: false,
    } as any,
    execute: async (_toolCallId: string, params: any) => {
      const { text } = params;
      const response = await fetch(
        `${ctx.gatekeeperInternalUrl}/api/chat/send`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ text }),
        },
      );

      if (!response.ok) {
        const body = await response.text().catch(() => "");
        throw new Error(
          `Chat send failed (${response.status}): ${body.slice(0, 200)}`,
        );
      }

      ctx.artifacts.push({ type: "text", label: "Chat reply", value: text });

      return {
        content: [{ type: "text", text: "Chat message sent to operator." }],
      };
    },
  };
}
