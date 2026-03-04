import type { MuteworkerPluginContext } from '@sandclaw/muteworker-plugin-api';

export interface IncomingChatPayload {
  text: string;
  history?: Array<{ role: 'user' | 'assistant'; text: string; timestamp: number }>;
}

export function buildChatPrompt(payload: IncomingChatPayload): string {
  const body = payload.text?.trim() || '[No text content]';
  const historyLines = payload.history?.length
    ? [
        '--- Conversation History ---',
        ...payload.history.map(
          (h) =>
            `[${new Date(h.timestamp * 1000).toISOString()}] ${h.role === 'assistant' ? 'Assistant' : 'User'}: ${h.text}`,
        ),
        '----------------------------',
      ]
    : [];

  return [
    '--- Message received from Chat UI ---',
    'Sender: Operator (trusted, direct browser chat)',
    'NOTE: This is the operator chatting directly. Respond with your message text directly.',
    ...historyLines,
    'Latest message:',
    body,
    '----------------------------',
  ].join('\n');
}

export function clampReply(reply: string): string {
  const normalized = reply.trim();
  return normalized.length <= 2000 ? normalized : `${normalized.slice(0, 1997)}...`;
}

export function createSendChatTool(ctx: MuteworkerPluginContext) {
  return {
    name: 'send_chat_message',
    label: 'Send Chat Message',
    description:
      'Send a message back to the operator in the browser chat interface. Messages are delivered immediately without verification.',
    parameters: {
      type: 'object',
      properties: {
        text: { type: 'string', description: 'The message text to send' },
      },
      required: ['text'],
      additionalProperties: false,
    } as any,
    execute: async (_toolCallId: string, params: any) => {
      const { text } = params;
      const response = await fetch(`${ctx.apiBaseUrl}/api/chat/send`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ text }),
      });

      if (!response.ok) {
        const body = await response.text().catch(() => '');
        throw new Error(`Chat send failed (${response.status}): ${body.slice(0, 200)}`);
      }

      ctx.artifacts.push({ type: 'text', label: 'Chat reply', value: text });

      return {
        content: [{ type: 'text', text: 'Chat message sent to operator.' }],
      };
    },
  };
}
