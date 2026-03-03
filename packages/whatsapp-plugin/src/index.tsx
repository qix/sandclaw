import React from 'react';
import { createGatekeeperPlugin } from '@sandclaw/gatekeeper-plugin-api';
import {
  createMuteworkerPlugin,
  type MuteworkerPluginContext,
  type RunAgentFn,
} from '@sandclaw/muteworker-plugin-api';

/**
 * Minimal UI panel rendered inside the Gatekeeper for the WhatsApp plugin.
 *
 * Full implementation will show:
 *  - Connection status / QR code for initial pairing
 *  - Recent conversation list
 *  - Pending send-message verification requests
 */
function WhatsAppPanel() {
  return (
    <div style={{ padding: '1.5rem' }}>
      <h2 style={{ marginTop: 0 }}>WhatsApp</h2>
      <p style={{ color: '#6b7280' }}>
        Connects to WhatsApp via the Baileys multi-device library. Incoming
        messages are queued for the muteworker; outbound messages require human
        approval unless the recipient is on the auto-approve list.
      </p>
      <section>
        <h3>Status</h3>
        <p>
          <strong>Connection:</strong> <em>not yet configured</em>
        </p>
      </section>
      <section>
        <h3>Pending actions</h3>
        <p>No pending verification requests.</p>
      </section>
    </div>
  );
}

async function migrations(knex: any): Promise<void> {
  if (!(await knex.schema.hasTable('whatsapp_sessions'))) {
    await knex.schema.createTable('whatsapp_sessions', (t: any) => {
      t.increments('id');
      t.text('status').notNullable().defaultTo('disconnected');
      t.text('qr_data_url');
      t.text('phone_number');
      t.integer('last_heartbeat');
      t.integer('updated_at');
    });
  }

  if (!(await knex.schema.hasTable('whatsapp_auth_state'))) {
    await knex.schema.createTable('whatsapp_auth_state', (t: any) => {
      t.text('id').primary();
      t.text('data').notNullable();
    });
  }
}

export const whatsappPlugin = createGatekeeperPlugin({
  id: 'whatsapp',
  title: 'WhatsApp',
  component: WhatsAppPanel,
  migrations,
});

// ---------------------------------------------------------------------------
// Muteworker plugin
// ---------------------------------------------------------------------------

interface IncomingWhatsappPayload {
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

function buildWhatsappPrompt(payload: IncomingWhatsappPayload): string {
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
    ...historyLines,
    'Latest WhatsApp message:',
    body,
    '----------------------------',
  ].join('\n');
}

function clampReply(reply: string): string {
  const normalized = reply.trim();
  return normalized.length <= 1200 ? normalized : `${normalized.slice(0, 1197)}...`;
}

function createSendWhatsappTool(ctx: MuteworkerPluginContext) {
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

export const whatsappMuteworkerPlugin = createMuteworkerPlugin({
  id: 'whatsapp',

  tools(ctx: MuteworkerPluginContext) {
    return [createSendWhatsappTool(ctx)];
  },

  jobHandlers: {
    async 'whatsapp:incoming_message'(ctx: MuteworkerPluginContext, runAgent: RunAgentFn) {
      let payload: IncomingWhatsappPayload;
      try {
        payload = JSON.parse(ctx.job.data) as IncomingWhatsappPayload;
      } catch {
        throw new Error(`Job ${ctx.job.id} has invalid JSON in data`);
      }

      if (!payload.jid) throw new Error(`Job ${ctx.job.id} payload missing jid`);

      const prompt = buildWhatsappPrompt(payload);
      const result = await runAgent(prompt);

      // If the job context requests an auto-reply, send it
      if (result.reply && ctx.job.context) {
        try {
          const jobCtx = JSON.parse(ctx.job.context) as Record<string, unknown>;
          if (jobCtx.channel === 'whatsapp' && typeof jobCtx.jid === 'string') {
            const reply = clampReply(result.reply);
            await fetch(`${ctx.apiBaseUrl}/api/whatsapp/send`, {
              method: 'POST',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify({ jid: jobCtx.jid, text: reply }),
            });
            ctx.artifacts.push({ type: 'text', label: 'Auto-Reply', value: reply });
            ctx.logger.info('whatsapp.auto_reply', { jobId: ctx.job.id, jid: jobCtx.jid });
          }
        } catch {
          ctx.logger.warn('whatsapp.auto_reply.failed', { jobId: ctx.job.id });
        }
      }
    },
  },
});
