import React from 'react';
import type { MuteworkerPluginContext, RunAgentFn } from '@sandclaw/muteworker-plugin-api';
import TelegramBot from 'node-telegram-bot-api';

// ---------------------------------------------------------------------------
// Module-level state (shared between SSR component and route handlers)
// Uses globalThis so state survives module re-evaluation on refresh.
// ---------------------------------------------------------------------------

type ConnectionStatus = 'disconnected' | 'waiting_for_token' | 'connecting' | 'connected';

interface TelegramState {
  bot: TelegramBot | null;
  connectionStatus: ConnectionStatus;
  botUsername: string | null;
  botToken: string | null;
}

const STATE_KEY = '__sandclaw_telegram_state__';

const _g = globalThis as any;
if (!_g[STATE_KEY]) {
  _g[STATE_KEY] = {
    bot: null,
    connectionStatus: 'disconnected' as ConnectionStatus,
    botUsername: null,
    botToken: null,
  };
}

const tgState: TelegramState = _g[STATE_KEY];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Look up or create a conversation row for the given chat ID, returning its auto-increment ID. */
async function getOrCreateConversationId(db: any, chatId: string): Promise<number> {
  const existing = await db('conversations')
    .where({ plugin: 'telegram', channel: 'telegram', external_id: chatId })
    .first();
  if (existing) return existing.id;
  const [id] = await db('conversations').insert({
    plugin: 'telegram',
    channel: 'telegram',
    external_id: chatId,
    created_at: Date.now(),
  });
  return id;
}

/** Upsert the single telegram_sessions row. */
async function upsertSession(db: any, data: Record<string, any>) {
  const existing = await db('telegram_sessions').first();
  if (existing) {
    await db('telegram_sessions').where('id', existing.id).update(data);
  } else {
    await db('telegram_sessions').insert(data);
  }
}

/** Send a message via the bot and record it in conversation_message. Throws if bot is not connected. */
async function deliverMessage(db: any, chatId: string, text: string) {
  if (!tgState.bot) throw new Error('Telegram bot not connected');
  await tgState.bot.sendMessage(chatId, text);
  const conversationId = await getOrCreateConversationId(db, chatId);
  await db('conversation_message').insert({
    conversation_id: conversationId,
    plugin: 'telegram',
    channel: 'telegram',
    message_id: `sent-${Date.now()}`,
    thread_id: chatId,
    from: tgState.botUsername,
    to: chatId,
    timestamp: Math.floor(Date.now() / 1000),
    direction: 'outbound',
    text,
    created_at: Date.now(),
  });
}

// ---------------------------------------------------------------------------
// Telegram Bot connection
// ---------------------------------------------------------------------------

async function connectTelegram(db: any, token: string) {
  tgState.connectionStatus = 'connecting';
  tgState.botToken = token;

  const bot = new TelegramBot(token, { polling: true });

  // Verify the token by calling getMe
  const me = await bot.getMe();
  tgState.bot = bot;
  tgState.botUsername = me.username ?? null;
  tgState.connectionStatus = 'connected';

  await upsertSession(db, {
    status: 'connected',
    bot_username: tgState.botUsername,
    bot_token: token,
    last_heartbeat: Date.now(),
    updated_at: Date.now(),
  });

  console.log(`[telegram] Connected as @${tgState.botUsername}`);

  // Handle incoming messages
  bot.on('message', async (msg) => {
    // Ignore non-text messages
    if (!msg.text) return;

    const chatId = String(msg.chat.id);
    const text = msg.text;
    const messageId = String(msg.message_id);
    const timestamp = msg.date;
    const firstName = msg.from?.first_name ?? null;
    const lastName = msg.from?.last_name ?? null;
    const username = msg.from?.username ?? null;
    const isGroup = msg.chat.type === 'group' || msg.chat.type === 'supergroup';
    const groupTitle = isGroup ? msg.chat.title ?? null : null;

    const replyToText =
      msg.reply_to_message?.text ?? null;

    const conversationId = await getOrCreateConversationId(db, chatId);

    // Store in conversation_message
    await db('conversation_message').insert({
      conversation_id: conversationId,
      plugin: 'telegram',
      channel: 'telegram',
      message_id: messageId,
      thread_id: chatId,
      from: chatId,
      to: tgState.botUsername,
      timestamp,
      direction: 'inbound',
      text,
      created_at: Date.now(),
    });

    // Fetch recent history for context
    const recentMessages = await db('conversation_message')
      .where({ plugin: 'telegram', thread_id: chatId })
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
    const payload: IncomingTelegramPayload = {
      messageId,
      chatId,
      firstName,
      lastName,
      username,
      timestamp,
      text,
      isGroup,
      groupTitle,
      replyToText,
      history,
    };

    const now = Date.now();
    await db('safe_queue').insert({
      job_type: 'telegram:incoming_message',
      data: JSON.stringify(payload),
      context: JSON.stringify({ channel: 'telegram', chatId }),
      status: 'pending',
      created_at: now,
      updated_at: now,
    });

    const displayName = [firstName, lastName].filter(Boolean).join(' ') || username || chatId;
    console.log(`[telegram] Queued incoming message from ${displayName}`);
  });

  // Handle polling errors gracefully
  bot.on('polling_error', (err) => {
    console.error('[telegram] Polling error:', err.message);
  });
}

async function disconnectTelegram(db: any) {
  if (tgState.bot) {
    await tgState.bot.stopPolling();
    tgState.bot = null;
  }
  tgState.connectionStatus = 'disconnected';
  tgState.botUsername = null;
  tgState.botToken = null;

  await db('telegram_sessions').del();
  console.log('[telegram] Disconnected and session cleared.');
}

// ---------------------------------------------------------------------------
// SSR React component
// ---------------------------------------------------------------------------

function TelegramPanel() {
  let statusBlock: React.ReactNode;

  switch (tgState.connectionStatus) {
    case 'disconnected':
    case 'waiting_for_token':
      statusBlock = (
        <div>
          <p style={{ color: '#ef4444' }}>
            <strong>Status:</strong> Disconnected
          </p>
          <div
            style={{
              background: '#f8fafc',
              border: '1px solid #e2e8f0',
              borderRadius: 8,
              padding: '1rem',
              marginBottom: '1rem',
            }}
          >
            <h4 style={{ marginTop: 0 }}>Setup Instructions</h4>
            <ol style={{ paddingLeft: '1.25rem' }}>
              <li>Open Telegram and search for <strong>@BotFather</strong></li>
              <li>
                Send <code>/newbot</code> and follow the prompts to choose a name and username
              </li>
              <li>
                BotFather will reply with a <strong>bot token</strong> (looks like{' '}
                <code>123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11</code>)
              </li>
              <li>Paste the token into the form below</li>
            </ol>
          </div>
          <form method="POST" action="/api/telegram/connect">
            <label>
              <strong>Bot Token:</strong>
              <br />
              <input
                type="text"
                name="token"
                placeholder="123456:ABC-DEF..."
                style={{
                  width: '100%',
                  maxWidth: 480,
                  padding: '0.5rem',
                  marginTop: '0.25rem',
                  border: '1px solid #d1d5db',
                  borderRadius: 4,
                  fontFamily: 'monospace',
                }}
              />
            </label>
            <br />
            <button
              type="submit"
              style={{
                marginTop: '0.5rem',
                padding: '0.5rem 1.25rem',
                background: '#2563eb',
                color: '#fff',
                border: 'none',
                borderRadius: 4,
                cursor: 'pointer',
              }}
            >
              Connect
            </button>
          </form>
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
        <div>
          <p style={{ color: '#22c55e' }}>
            <strong>Status:</strong> Connected as @{tgState.botUsername ?? 'unknown'}
          </p>
          <form method="POST" action="/api/telegram/disconnect">
            <button
              type="submit"
              style={{
                marginTop: '0.5rem',
                padding: '0.5rem 1.25rem',
                background: '#ef4444',
                color: '#fff',
                border: 'none',
                borderRadius: 4,
                cursor: 'pointer',
              }}
            >
              Disconnect
            </button>
          </form>
        </div>
      );
      break;
  }

  const needsRefresh =
    tgState.connectionStatus !== 'connected' &&
    tgState.connectionStatus !== 'disconnected' &&
    tgState.connectionStatus !== 'waiting_for_token';

  return (
    <div style={{ padding: '1.5rem' }}>
      <h2 style={{ marginTop: 0 }}>Telegram</h2>
      <p style={{ color: '#6b7280' }}>
        Connects to Telegram via the Bot API. Incoming messages are queued for the muteworker;
        outbound messages require human approval unless the recipient is on the auto-approve list.
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

function registerRoutes(app: any, db: any, operatorChatIds: ReadonlySet<string>) {
  // GET /status — current connection state
  app.get('/status', (_c: any) => {
    return _c.json({
      status: tgState.connectionStatus,
      botUsername: tgState.botUsername,
    });
  });

  // POST /connect — accepts { token }, validates via getMe, starts polling
  app.post('/connect', async (c: any) => {
    let token: string;

    const contentType = c.req.header('content-type') || '';
    if (contentType.includes('application/json')) {
      const body = await c.req.json();
      token = body.token;
    } else {
      // Handle form submission
      const body = await c.req.parseBody();
      token = body.token as string;
    }

    if (!token || typeof token !== 'string' || !token.trim()) {
      return c.json({ error: 'token is required' }, 400);
    }

    token = token.trim();

    try {
      await connectTelegram(db, token);
      // If this was a form submission, redirect back to the plugin page
      if (!contentType.includes('application/json')) {
        return c.redirect('/?plugin=telegram');
      }
      return c.json({ status: 'connected', botUsername: tgState.botUsername });
    } catch (err: any) {
      tgState.connectionStatus = 'disconnected';
      tgState.bot = null;
      tgState.botToken = null;
      const message = err?.message || 'Failed to connect';
      if (!contentType.includes('application/json')) {
        return c.redirect('/?plugin=telegram');
      }
      return c.json({ error: message }, 400);
    }
  });

  // POST /disconnect — stops bot, clears session
  app.post('/disconnect', async (c: any) => {
    await disconnectTelegram(db);
    const contentType = c.req.header('content-type') || '';
    if (!contentType.includes('application/json')) {
      return c.redirect('/?plugin=telegram');
    }
    return c.json({ status: 'disconnected' });
  });

  // POST /typing — send a "typing" chat action to a chat
  app.post('/typing', async (c: any) => {
    const body = await c.req.json();
    const { chatId } = body;

    if (!chatId || typeof chatId !== 'string') {
      return c.json({ error: 'chatId is required' }, 400);
    }

    if (!tgState.bot) {
      return c.json({ error: 'Telegram bot not connected' }, 503);
    }

    try {
      await tgState.bot.sendChatAction(chatId, 'typing');
      return c.json({ success: true });
    } catch (err: any) {
      return c.json({ error: err?.message || 'Failed to send typing action' }, 500);
    }
  });

  // POST /send — create a verification request for sending a message
  app.post('/send', async (c: any) => {
    const body = await c.req.json();
    const { chatId, text } = body;

    if (!chatId || !text) {
      return c.json({ error: 'chatId and text are required' }, 400);
    }

    const autoApprove = operatorChatIds.has(chatId);
    const now = Date.now();
    const [id] = await db('verification_requests').insert({
      plugin: 'telegram',
      action: 'send_message',
      data: JSON.stringify({ chatId, text }),
      status: autoApprove ? 'approved' : 'pending',
      created_at: now,
      updated_at: now,
    });

    if (autoApprove) {
      try {
        await deliverMessage(db, chatId, text);
      } catch {
        return c.json({ error: 'Telegram bot not connected' }, 503);
      }
    }

    return c.json({
      verificationRequestId: id,
      verificationStatus: autoApprove ? 'approved' : 'pending',
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
    if (request.plugin !== 'telegram' || request.action !== 'send_message') {
      return c.json({ error: 'Not a Telegram send request' }, 400);
    }

    const { chatId, text } = JSON.parse(request.data);

    try {
      await deliverMessage(db, chatId, text);
    } catch {
      return c.json({ error: 'Telegram bot not connected' }, 503);
    }

    await db('verification_requests')
      .where('id', id)
      .update({ status: 'approved', updated_at: Date.now() });

    return c.json({ success: true, verificationStatus: 'approved' });
  });

  // Auto-reconnect: check DB for existing session with a token
  (async () => {
    try {
      const session = await db('telegram_sessions')
        .where('status', 'connected')
        .first();
      if (session?.bot_token) {
        console.log('[telegram] Found existing session, auto-reconnecting...');
        await connectTelegram(db, session.bot_token);
      }
    } catch (err: any) {
      console.error('[telegram] Auto-reconnect failed:', err.message);
    }
  })();
}

// ---------------------------------------------------------------------------
// Migrations
// ---------------------------------------------------------------------------

async function migrations(knex: any): Promise<void> {
  if (!(await knex.schema.hasTable('telegram_sessions'))) {
    await knex.schema.createTable('telegram_sessions', (t: any) => {
      t.increments('id');
      t.text('status').notNullable().defaultTo('disconnected');
      t.text('bot_username');
      t.text('bot_token');
      t.integer('last_heartbeat');
      t.integer('updated_at');
    });
  }
}

// ---------------------------------------------------------------------------
// Gatekeeper plugin export
// ---------------------------------------------------------------------------

export interface TelegramGatekeeperPluginOptions {
  /** Chat IDs that are trusted operators. Sends to operator chat IDs are
   *  auto-approved without human verification. */
  operatorChatIds?: string[];
}

export function buildTelegramPlugin(options: TelegramGatekeeperPluginOptions = {}) {
  const operatorChatIds: ReadonlySet<string> = new Set(options.operatorChatIds ?? []);

  return {
    id: 'telegram' as const,
    title: 'Telegram',
    component: TelegramPanel,
    routes: (app: any, db: any) => registerRoutes(app, db, operatorChatIds),
    migrations,

    tools(ctx: MuteworkerPluginContext) {
      return [createSendTelegramTool(ctx)];
    },

    jobHandlers: {
      async 'telegram:incoming_message'(ctx: MuteworkerPluginContext, runAgent: RunAgentFn) {
        let payload: IncomingTelegramPayload;
        try {
          payload = JSON.parse(ctx.job.data) as IncomingTelegramPayload;
        } catch {
          throw new Error(`Job ${ctx.job.id} has invalid JSON in data`);
        }

        if (!payload.chatId) throw new Error(`Job ${ctx.job.id} payload missing chatId`);

        // Send typing indicator while the agent works
        const sendTyping = () =>
          fetch(`${ctx.apiBaseUrl}/api/telegram/typing`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ chatId: payload.chatId }),
          }).catch(() => {});
        await sendTyping();
        const typingInterval = setInterval(sendTyping, 4000);

        const prompt = buildTelegramPrompt(payload);
        let result: Awaited<ReturnType<RunAgentFn>>;
        try {
          result = await runAgent(prompt);
        } finally {
          clearInterval(typingInterval);
        }

        if (result.reply && ctx.job.context) {
          try {
            const jobCtx = JSON.parse(ctx.job.context) as Record<string, unknown>;
            if (jobCtx.channel === 'telegram' && typeof jobCtx.chatId === 'string') {
              const reply = clampReply(result.reply);
              await fetch(`${ctx.apiBaseUrl}/api/telegram/send`, {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({ chatId: jobCtx.chatId, text: reply }),
              });
              ctx.artifacts.push({ type: 'text', label: 'Auto-Reply', value: reply });
              ctx.logger.info('telegram.auto_reply', { jobId: ctx.job.id, chatId: jobCtx.chatId });
            }
          } catch {
            ctx.logger.warn('telegram.auto_reply.failed', { jobId: ctx.job.id });
          }
        }
      },
    },
  };
}

export const telegramPlugin = buildTelegramPlugin();

// ---------------------------------------------------------------------------
// Muteworker internals
// ---------------------------------------------------------------------------

interface IncomingTelegramPayload {
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
  history?: Array<{ role: 'user' | 'assistant'; text: string; timestamp: number }>;
}

function buildTelegramPrompt(payload: IncomingTelegramPayload): string {
  const displayName =
    [payload.firstName, payload.lastName].filter(Boolean).join(' ') ||
    payload.username ||
    '(unknown)';
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
    '--- Message received from Telegram ---',
    `Sender: ${displayName}`,
    payload.username ? `Username: @${payload.username}` : 'Username: (none)',
    `Chat ID: ${payload.chatId}`,
    `Is group message: ${Boolean(payload.isGroup)}`,
    payload.groupTitle ? `Group: ${payload.groupTitle}` : 'Direct message.',
    replyContext,
    ...historyLines,
    'Latest Telegram message:',
    body,
    '----------------------------',
  ].join('\n');
}

function clampReply(reply: string): string {
  const normalized = reply.trim();
  return normalized.length <= 4096 ? normalized : `${normalized.slice(0, 4093)}...`;
}

function createSendTelegramTool(ctx: MuteworkerPluginContext) {
  return {
    name: 'send_telegram_message',
    label: 'Send Telegram Message',
    description:
      'Request a Telegram message send to a specific chat ID. May require human verification before delivery.',
    parameters: {
      type: 'object',
      properties: {
        chatId: { type: 'string' },
        text: { type: 'string' },
      },
      required: ['chatId', 'text'],
      additionalProperties: false,
    } as any,
    execute: async (_toolCallId: string, params: any) => {
      const { chatId, text } = params;
      const response = await fetch(`${ctx.apiBaseUrl}/api/telegram/send`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ chatId, text }),
      });

      if (!response.ok) {
        const body = await response.text().catch(() => '');
        throw new Error(`Telegram send failed (${response.status}): ${body.slice(0, 200)}`);
      }

      const result = (await response.json()) as {
        verificationRequestId?: number;
        verificationStatus?: 'pending' | 'approved' | 'rejected';
      };

      ctx.artifacts.push({ type: 'text', label: `Sent to ${chatId}`, value: text });

      const needsVerification = result.verificationStatus === 'pending';
      const replyText = needsVerification
        ? [
            `Telegram send request queued for chat ${chatId} and pending verification.`,
            `Open ${ctx.verificationUiUrl} to approve request #${result.verificationRequestId}.`,
          ].join('\n')
        : `Telegram message sent to chat ${chatId}.`;

      return {
        content: [{ type: 'text', text: replyText }],
        details: result,
      };
    },
  };
}
