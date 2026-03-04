import type { MuteworkerPluginContext } from '@sandclaw/muteworker-plugin-api';

export interface IncomingWhatsappPayload {
  messageId: string;
  jid: string;
  pushName?: string | null;
  timestamp?: number;
  text?: string | null;
  isGroup?: boolean;
  groupJid?: string | null;
  replyToText?: string | null;
  history?: Array<{ role: 'user' | 'assistant'; text: string; timestamp: number }>;
}

export function buildWhatsappPrompt(payload: IncomingWhatsappPayload, isOperator: boolean): string {
  const displayName = payload.pushName || '(unknown)';
  const body = payload.text?.trim() || '[No text content]';
  const replyContext = payload.replyToText
    ? `Quoted message: ${payload.replyToText}`
    : 'No quoted message.';
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
    '--- Message received from WhatsApp ---',
    `Sender display name: ${displayName}`,
    `Sender JID: ${payload.jid}`,
    `Is group message: ${Boolean(payload.isGroup)}`,
    payload.groupJid ? `Group JID: ${payload.groupJid}` : 'Direct message.',
    replyContext,
    ...(isOperator
      ? [
          'NOTE: This sender is a trusted operator. Do NOT use the send_whatsapp_message tool to reply — just respond with your message text directly.',
        ]
      : []),
    ...historyLines,
    'Latest WhatsApp message:',
    body,
    '----------------------------',
  ].join('\n');
}

export function clampReply(reply: string): string {
  const normalized = reply.trim();
  return normalized.length <= 1200 ? normalized : `${normalized.slice(0, 1197)}...`;
}

export function createSendWhatsappTool(ctx: MuteworkerPluginContext) {
  return {
    name: 'send_whatsapp_message',
    label: 'Send WhatsApp Message',
    description:
      'Request a WhatsApp message send to a specific JID (e.g. 27821234567@s.whatsapp.net). May require human verification before delivery.',
    parameters: {
      type: 'object',
      properties: {
        jid: { type: 'string' },
        text: { type: 'string' },
      },
      required: ['jid', 'text'],
      additionalProperties: false,
    } as any,
    execute: async (_toolCallId: string, params: any) => {
      const { jid, text } = params;
      const response = await fetch(`${ctx.apiBaseUrl}/api/whatsapp/send`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ jid, text }),
      });

      if (!response.ok) {
        const body = await response.text().catch(() => '');
        throw new Error(`WhatsApp send failed (${response.status}): ${body.slice(0, 200)}`);
      }

      const result = (await response.json()) as {
        verificationRequestId?: number;
        verificationStatus?: 'pending' | 'approved' | 'rejected';
      };

      ctx.artifacts.push({ type: 'text', label: `Sent to ${jid}`, value: text });

      const needsVerification = result.verificationStatus === 'pending';
      const replyText = needsVerification
        ? [
            `WhatsApp send request queued for ${jid} and pending verification.`,
            `Open ${ctx.verificationUiUrl} to approve request #${result.verificationRequestId}.`,
          ].join('\n')
        : `WhatsApp message sent to ${jid}.`;

      return {
        content: [{ type: 'text', text: replyText }],
        details: result,
      };
    },
  };
}
