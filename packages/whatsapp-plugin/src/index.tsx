import React from 'react';
import { createGatekeeperPlugin } from '@sandclaw/gatekeeper-plugin-api';
import {
  createMuteworkerPlugin,
  type MuteworkerPluginContext,
  type RunAgentFn,
} from '@sandclaw/muteworker-plugin-api';
import makeWASocket, {
  BufferJSON,
  DisconnectReason,
  fetchLatestBaileysVersion,
  initAuthCreds,
  proto,
} from '@whiskeysockets/baileys';
import * as QRCode from 'qrcode';
import pino from 'pino';

// ---------------------------------------------------------------------------
// Module-level state (shared between SSR component and route handlers)
// ---------------------------------------------------------------------------

type ConnectionStatus = 'disconnected' | 'qr_pending' | 'connecting' | 'connected';

let waSocket: any = null;
let connectionStatus: ConnectionStatus = 'disconnected';
let qrDataUrl: string | null = null;
let phoneNumber: string | null = null;

// ---------------------------------------------------------------------------
// DB-backed auth state for Baileys
// ---------------------------------------------------------------------------

async function useDBAuthState(db: any) {
  const writeData = async (id: string, data: any) => {
    const serialized = JSON.stringify(data, BufferJSON.replacer);
    await db('whatsapp_auth_state')
      .insert({ id, data: serialized })
      .onConflict('id')
      .merge();
  };

  const readData = async (id: string) => {
    const row = await db('whatsapp_auth_state').where('id', id).first();
    if (!row) return null;
    return JSON.parse(row.data, BufferJSON.reviver);
  };

  const removeData = async (id: string) => {
    await db('whatsapp_auth_state').where('id', id).del();
  };

  const credsData = await readData('creds');
  const creds = credsData || initAuthCreds();
  if (!credsData) {
    await writeData('creds', creds);
  }

  return {
    state: {
      creds,
      keys: {
        get: async (type: string, ids: string[]) => {
          const result: Record<string, any> = {};
          for (const id of ids) {
            const value = await readData(`${type}-${id}`);
            if (value) {
              if (type === 'app-state-sync-key') {
                result[id] = proto.Message.AppStateSyncKeyData.fromObject(value);
              } else {
                result[id] = value;
              }
            }
          }
          return result;
        },
        set: async (data: any) => {
          for (const [type, entries] of Object.entries(data) as [string, Record<string, any>][]) {
            for (const [id, value] of Object.entries(entries)) {
              if (value) {
                await writeData(`${type}-${id}`, value);
              } else {
                await removeData(`${type}-${id}`);
              }
            }
          }
        },
      },
    },
    saveCreds: async () => {
      await writeData('creds', creds);
    },
  };
}

// ---------------------------------------------------------------------------
// Baileys WhatsApp connection
// ---------------------------------------------------------------------------

/** Look up or create a conversation row for the given JID, returning its auto-increment ID. */
async function getOrCreateConversationId(db: any, jid: string): Promise<number> {
  const existing = await db('conversations')
    .where({ plugin: 'whatsapp', channel: 'whatsapp', external_id: jid })
    .first();
  if (existing) return existing.id;
  const [id] = await db('conversations').insert({
    plugin: 'whatsapp',
    channel: 'whatsapp',
    external_id: jid,
    created_at: Date.now(),
  });
  return id;
}

/** Upsert the single whatsapp_sessions row. */
async function upsertSession(db: any, data: Record<string, any>) {
  const existing = await db('whatsapp_sessions').first();
  if (existing) {
    await db('whatsapp_sessions').where('id', existing.id).update(data);
  } else {
    await db('whatsapp_sessions').insert(data);
  }
}

async function connectWhatsApp(db: any) {
  const logger = pino({ level: 'silent' });
  const { version } = await fetchLatestBaileysVersion();
  const { state, saveCreds } = await useDBAuthState(db);

  const sock = makeWASocket({
    auth: state,
    logger,
    version,
  });

  waSocket = sock;

  sock.ev.on('connection.update', async (update: any) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      qrDataUrl = await QRCode.toDataURL(qr);
      connectionStatus = 'qr_pending';
      await upsertSession(db, {
        status: 'qr_pending',
        qr_data_url: qrDataUrl,
        updated_at: Date.now(),
      });
    }

    if (connection === 'close') {
      connectionStatus = 'disconnected';
      qrDataUrl = null;
      waSocket = null;

      const statusCode = (lastDisconnect?.error as any)?.output?.statusCode;
      const loggedOut = statusCode === DisconnectReason.loggedOut;

      if (loggedOut) {
        await db('whatsapp_auth_state').del();
        await db('whatsapp_sessions').del();
        console.log('[whatsapp] Logged out — auth state cleared. Restart to reconnect.');
      } else {
        console.log(`[whatsapp] Disconnected (status=${statusCode}). Reconnecting in 3s...`);
        setTimeout(() => connectWhatsApp(db), 3000);
      }
    }

    if (connection === 'connecting') {
      connectionStatus = 'connecting';
    }

    if (connection === 'open') {
      connectionStatus = 'connected';
      qrDataUrl = null;
      phoneNumber = sock.user?.id?.split(':')[0] ?? sock.user?.id ?? null;

      await upsertSession(db, {
        status: 'connected',
        qr_data_url: null,
        phone_number: phoneNumber,
        last_heartbeat: Date.now(),
        updated_at: Date.now(),
      });

      console.log(`[whatsapp] Connected as ${phoneNumber}`);
    }
  });

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('messages.upsert', async ({ messages, type }: any) => {
    if (type !== 'notify') return;

    for (const msg of messages) {
      if (msg.key.fromMe) continue;
      if (!msg.message) continue;

      const jid = msg.key.remoteJid;
      if (!jid) continue;

      const text =
        msg.message.conversation ||
        msg.message.extendedTextMessage?.text ||
        null;

      if (!text) continue;

      const pushName = msg.pushName ?? null;
      const timestamp =
        typeof msg.messageTimestamp === 'number'
          ? msg.messageTimestamp
          : Number(msg.messageTimestamp) || Math.floor(Date.now() / 1000);
      const messageId = msg.key.id || `${Date.now()}`;
      const isGroup = jid.endsWith('@g.us');
      const conversationId = await getOrCreateConversationId(db, jid);

      // Store in conversation_message
      await db('conversation_message').insert({
        conversation_id: conversationId,
        plugin: 'whatsapp',
        channel: 'whatsapp',
        message_id: messageId,
        thread_id: jid,
        from: jid,
        to: phoneNumber,
        timestamp,
        direction: 'inbound',
        text,
        created_at: Date.now(),
      });

      // Fetch recent history for context
      const recentMessages = await db('conversation_message')
        .where({ plugin: 'whatsapp', thread_id: jid })
        .orderBy('timestamp', 'desc')
        .limit(10);

      const history = recentMessages
        .reverse()
        .filter((m: any) => m.message_id !== messageId)
        .map((m: any) => ({
          role: m.direction === 'inbound' ? ('user' as const) : ('assistant' as const),
          text: m.text || '',
          timestamp: m.timestamp,
        }));

      // Build payload and enqueue
      const payload: IncomingWhatsappPayload = {
        messageId,
        jid,
        pushName,
        timestamp,
        text,
        isGroup,
        groupJid: isGroup ? jid : null,
        replyToText:
          msg.message.extendedTextMessage?.contextInfo?.quotedMessage?.conversation ?? null,
        history,
      };

      const now = Date.now();
      await db('safe_queue').insert({
        job_type: 'whatsapp:incoming_message',
        data: JSON.stringify(payload),
        context: JSON.stringify({ channel: 'whatsapp', jid }),
        status: 'pending',
        created_at: now,
        updated_at: now,
      });

      console.log(`[whatsapp] Queued incoming message from ${pushName ?? jid}`);
    }
  });
}

// ---------------------------------------------------------------------------
// SSR React component
// ---------------------------------------------------------------------------

function WhatsAppPanel() {
  let statusBlock: React.ReactNode;

  switch (connectionStatus) {
    case 'disconnected':
      statusBlock = (
        <p style={{ color: '#ef4444' }}>
          <strong>Status:</strong> Disconnected
        </p>
      );
      break;
    case 'qr_pending':
      statusBlock = (
        <div>
          <p style={{ color: '#f59e0b' }}>
            <strong>Status:</strong> Waiting for QR scan
          </p>
          {qrDataUrl && (
            <div>
              <img
                src={qrDataUrl}
                alt="WhatsApp QR Code"
                style={{ width: 264, height: 264, imageRendering: 'pixelated' }}
              />
              <p style={{ color: '#6b7280', fontSize: '0.875rem' }}>
                Open WhatsApp on your phone &rarr; Linked Devices &rarr; Link a Device &rarr; Scan
                this code
              </p>
            </div>
          )}
        </div>
      );
      break;
    case 'connecting':
      statusBlock = (
        <p style={{ color: '#f59e0b' }}>
          <strong>Status:</strong> Connecting&hellip;
        </p>
      );
      break;
    case 'connected':
      statusBlock = (
        <p style={{ color: '#22c55e' }}>
          <strong>Status:</strong> Connected as {phoneNumber ?? 'unknown'}
        </p>
      );
      break;
  }

  const needsRefresh = connectionStatus !== 'connected';

  return (
    <div style={{ padding: '1.5rem' }}>
      <h2 style={{ marginTop: 0 }}>WhatsApp</h2>
      <p style={{ color: '#6b7280' }}>
        Connects to WhatsApp via the Baileys multi-device library. Incoming messages are queued for
        the muteworker; outbound messages require human approval unless the recipient is on the
        auto-approve list.
      </p>
      <section>
        <h3>Connection</h3>
        {statusBlock}
      </section>
      {needsRefresh && (
        <script
          dangerouslySetInnerHTML={{ __html: 'setTimeout(function(){location.reload()},3000)' }}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Route registration
// ---------------------------------------------------------------------------

function registerRoutes(app: any, db: any) {
  // GET /status — current connection state
  app.get('/status', (_c: any) => {
    return _c.json({
      status: connectionStatus,
      phoneNumber,
      hasQr: !!qrDataUrl,
    });
  });

  // POST /send — create a verification request for sending a message
  app.post('/send', async (c: any) => {
    const body = await c.req.json();
    const { jid, text } = body;

    if (!jid || !text) {
      return c.json({ error: 'jid and text are required' }, 400);
    }

    const now = Date.now();
    const [id] = await db('verification_requests').insert({
      plugin: 'whatsapp',
      action: 'send_message',
      data: JSON.stringify({ jid, text }),
      status: 'pending',
      created_at: now,
      updated_at: now,
    });

    return c.json({
      verificationRequestId: id,
      verificationStatus: 'pending',
    });
  });

  // POST /approve/:id — approve a pending send request and deliver the message
  app.post('/approve/:id', async (c: any) => {
    const id = parseInt(c.req.param('id'), 10);
    if (!id || isNaN(id)) return c.json({ error: 'Invalid id' }, 400);

    const request = await db('verification_requests').where('id', id).first();
    if (!request || request.status !== 'pending') {
      return c.json({ error: 'Not found or already resolved' }, 404);
    }
    if (request.plugin !== 'whatsapp' || request.action !== 'send_message') {
      return c.json({ error: 'Not a WhatsApp send request' }, 400);
    }

    const { jid, text } = JSON.parse(request.data);

    if (!waSocket) {
      return c.json({ error: 'WhatsApp not connected' }, 503);
    }

    await waSocket.sendMessage(jid, { text });

    await db('verification_requests')
      .where('id', id)
      .update({ status: 'approved', updated_at: Date.now() });

    const conversationId = await getOrCreateConversationId(db, jid);
    await db('conversation_message').insert({
      conversation_id: conversationId,
      plugin: 'whatsapp',
      channel: 'whatsapp',
      message_id: `sent-${Date.now()}`,
      thread_id: jid,
      from: phoneNumber,
      to: jid,
      timestamp: Math.floor(Date.now() / 1000),
      direction: 'outbound',
      text,
      created_at: Date.now(),
    });

    return c.json({ success: true, verificationStatus: 'approved' });
  });

  // Fire-and-forget: start WhatsApp connection
  connectWhatsApp(db).catch((err: any) => {
    console.error('[whatsapp] Failed to connect:', err);
  });
}

// ---------------------------------------------------------------------------
// Migrations
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Gatekeeper plugin export
// ---------------------------------------------------------------------------

export const whatsappPlugin = createGatekeeperPlugin({
  id: 'whatsapp',
  title: 'WhatsApp',
  component: WhatsAppPanel,
  routes: registerRoutes,
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
