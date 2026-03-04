import React from 'react';
import type { MuteworkerPluginContext, RunAgentFn, MuteworkerEnvironment } from '@sandclaw/muteworker-plugin-api';
import type { PluginEnvironment, VerificationRendererProps } from '@sandclaw/gatekeeper-plugin-api';

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

export interface GmailPluginConfig {
  /** Google OAuth2 client ID. */
  clientId: string;
  /** Google OAuth2 client secret. */
  clientSecret: string;
  /** OAuth2 refresh token. */
  refreshToken: string;
  /** User's email address (the "from" for outbound). */
  userEmail: string;
  /** Polling interval for new messages in ms. Defaults to 30000. */
  pollIntervalMs?: number;
}

// ---------------------------------------------------------------------------
// Gmail API helpers (using googleapis)
// ---------------------------------------------------------------------------

async function createGmailClient(config: GmailPluginConfig) {
  // Dynamic import to avoid hard failures if googleapis isn't installed
  const { google } = await import('googleapis');
  const oauth2Client = new google.auth.OAuth2(
    config.clientId,
    config.clientSecret,
  );
  oauth2Client.setCredentials({ refresh_token: config.refreshToken });
  return google.gmail({ version: 'v1', auth: oauth2Client });
}

async function sendEmail(
  config: GmailPluginConfig,
  to: string,
  subject: string,
  text: string,
): Promise<{ messageId: string }> {
  const gmail = await createGmailClient(config);

  const messageParts = [
    `From: ${config.userEmail}`,
    `To: ${to}`,
    `Subject: ${subject}`,
    'Content-Type: text/plain; charset=utf-8',
    '',
    text,
  ];
  const raw = Buffer.from(messageParts.join('\r\n'))
    .toString('base64url');

  const result = await gmail.users.messages.send({
    userId: 'me',
    requestBody: { raw },
  });

  return { messageId: result.data.id ?? '' };
}

// ---------------------------------------------------------------------------
// Gatekeeper Plugin (UI + Routes)
// ---------------------------------------------------------------------------

function GmailPanel() {
  return (
    <div style={{ padding: '1.5rem' }}>
      <h2 style={{ marginTop: 0 }}>Gmail</h2>
      <p style={{ color: '#6b7280' }}>
        Connects to Gmail via the Google Gmail API with OAuth2. Incoming emails
        are queued for the muteworker; outbound emails require human approval
        before dispatch.
      </p>
      <section>
        <h3>Capabilities</h3>
        <ul style={{ lineHeight: '1.8' }}>
          <li><strong>Receive:</strong> Polls for new emails and queues as jobs</li>
          <li><strong>Send:</strong> Compose and send emails (requires approval)</li>
        </ul>
      </section>
      <section>
        <h3>Pending actions</h3>
        <p>Check the verification panel for pending send requests.</p>
      </section>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Verification renderer
// ---------------------------------------------------------------------------

function GmailVerificationRenderer({ data }: VerificationRendererProps) {
  const to = data?.to ?? '';
  const from = data?.from ?? '';
  const subject = data?.subject ?? '(no subject)';
  const text = data?.text ?? '';

  return (
    <div>
      <table style={{ fontSize: '0.85rem', marginBottom: '0.75rem', borderCollapse: 'collapse' }}>
        <tbody>
          <tr>
            <td style={{ padding: '0.2rem 0.75rem 0.2rem 0', color: '#6b7280', fontWeight: 600, whiteSpace: 'nowrap', verticalAlign: 'top' }}>From</td>
            <td style={{ padding: '0.2rem 0', fontFamily: 'monospace' }}>{from}</td>
          </tr>
          <tr>
            <td style={{ padding: '0.2rem 0.75rem 0.2rem 0', color: '#6b7280', fontWeight: 600, whiteSpace: 'nowrap', verticalAlign: 'top' }}>To</td>
            <td style={{ padding: '0.2rem 0', fontFamily: 'monospace' }}>{to}</td>
          </tr>
          <tr>
            <td style={{ padding: '0.2rem 0.75rem 0.2rem 0', color: '#6b7280', fontWeight: 600, whiteSpace: 'nowrap', verticalAlign: 'top' }}>Subject</td>
            <td style={{ padding: '0.2rem 0', fontWeight: 600 }}>{subject}</td>
          </tr>
        </tbody>
      </table>
      <div
        style={{
          background: '#fefce8',
          border: '1px solid #fef08a',
          borderRadius: '0.75rem',
          padding: '1rem 1.25rem',
          fontSize: '0.95rem',
          lineHeight: 1.6,
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-word',
        }}
      >
        {text}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Builder
// ---------------------------------------------------------------------------

export function createGmailPlugin(config: GmailPluginConfig) {
  const pollIntervalMs = config.pollIntervalMs ?? 30000;
  let pollTimer: ReturnType<typeof setInterval> | null = null;
  let lastHistoryId: string | null = null;

  return {
    id: 'gmail' as const,
    title: 'Gmail',
    component: GmailPanel,
    verificationRenderer: GmailVerificationRenderer,

    registerGateway(_env: PluginEnvironment) {},
    registerMuteworker(_env: MuteworkerEnvironment) {},

    tools(ctx: MuteworkerPluginContext) {
      return [createSendEmailTool(ctx)];
    },

    jobHandlers: {
      async 'gmail:incoming_email'(ctx: MuteworkerPluginContext, runAgent: RunAgentFn) {
        let payload: IncomingEmailPayload;
        try {
          payload = JSON.parse(ctx.job.data) as IncomingEmailPayload;
        } catch {
          throw new Error(`Job ${ctx.job.id} has invalid JSON in data`);
        }

        if (!payload.from) throw new Error(`Job ${ctx.job.id} payload missing from`);

        const prompt = buildEmailPrompt(payload);
        await runAgent(prompt);
      },
    },

    routes(app: any, db: any) {
      // POST /send — create a verification request for an email send
      app.post('/send', async (c) => {
        const body = await (c.req.json() as { to?: string; subject?: string; text?: string });
        if (!body.to) return c.json({ error: 'to is required' }, 400);
        if (!body.subject) return c.json({ error: 'subject is required' }, 400);
        if (!body.text) return c.json({ error: 'text is required' }, 400);

        const now = Date.now();
        const verificationData = {
          to: body.to,
          subject: body.subject,
          text: body.text,
          from: config.userEmail,
        };

        const [id] = await db('verification_requests').insert({
          plugin: 'gmail',
          action: 'send_email',
          data: JSON.stringify(verificationData),
          status: 'pending',
          created_at: now,
          updated_at: now,
        });

        return c.json({
          verificationRequestId: id,
          verificationStatus: 'pending',
        });
      });

      // POST /approve/:id — approve and send an email
      app.post('/approve/:id', async (c) => {
        const id = parseInt(c.req.param('id'), 10);
        if (!id || isNaN(id)) return c.json({ error: 'Invalid id' }, 400);

        const request = await db('verification_requests').where('id', id).first();
        if (!request || request.status !== 'pending' || request.plugin !== 'gmail') {
          return c.json({ error: 'Not found or already resolved' }, 404);
        }

        const data = JSON.parse(request.data);

        try {
          const result = await sendEmail(config, data.to, data.subject, data.text);

          await db('verification_requests')
            .where('id', id)
            .update({ status: 'approved', updated_at: Date.now() });

          // Store sent message in conversation history
          const now = Date.now();
          await db('conversation_message').insert({
            conversation_id: 0, // Resolved later
            plugin: 'gmail',
            channel: data.to,
            message_id: result.messageId,
            from: config.userEmail,
            to: data.to,
            timestamp: Math.floor(now / 1000),
            direction: 'sent',
            text: data.text,
            created_at: now,
          });

          return c.json({ success: true, messageId: result.messageId });
        } catch (e) {
          return c.json({ error: `Failed to send email: ${(e as Error).message}` }, 500);
        }
      });

      // POST /receive — webhook/manual trigger to queue an incoming email as a job
      app.post('/receive', async (c) => {
        const body = await c.req.json() as {
          messageId: string;
          from: string;
          to: string;
          subject: string;
          text: string;
          threadId?: string;
        };

        if (!body.messageId || !body.from) {
          return c.json({ error: 'messageId and from are required' }, 400);
        }

        const now = Date.now();

        // Store incoming message
        await db('conversation_message').insert({
          conversation_id: 0,
          plugin: 'gmail',
          channel: body.from,
          message_id: body.messageId,
          thread_id: body.threadId ?? null,
          from: body.from,
          to: body.to ?? config.userEmail,
          timestamp: Math.floor(now / 1000),
          direction: 'received',
          text: body.text ?? '',
          created_at: now,
        });

        // Load conversation history for context
        const history = await db('conversation_message')
          .where('plugin', 'gmail')
          .where('channel', body.from)
          .orderBy('timestamp', 'asc')
          .limit(20);

        const historyEntries = history.map((h: any) => ({
          role: h.direction === 'sent' ? 'assistant' as const : 'user' as const,
          text: h.text ?? '',
          timestamp: h.timestamp,
        }));

        // Queue as a muteworker job
        const [jobId] = await db('safe_queue').insert({
          job_type: 'gmail:incoming_email',
          data: JSON.stringify({
            messageId: body.messageId,
            from: body.from,
            to: body.to ?? config.userEmail,
            subject: body.subject ?? '',
            text: body.text ?? '',
            threadId: body.threadId ?? null,
            history: historyEntries,
          }),
          context: JSON.stringify({ channel: 'gmail', from: body.from }),
          status: 'pending',
          created_at: now,
          updated_at: now,
        });

        return c.json({ success: true, jobId });
      });

      // Start email polling if configured
      startEmailPolling(config, db, pollIntervalMs).catch(() => {
        // Polling failed to start — likely missing credentials
      });
    },
  };
}

async function startEmailPolling(
  config: GmailPluginConfig,
  db: any,
  intervalMs: number,
): Promise<void> {
  if (!config.clientId || !config.clientSecret || !config.refreshToken) return;

  let lastChecked = Date.now();

  const poll = async () => {
    try {
      const gmail = await createGmailClient(config);
      const response = await gmail.users.messages.list({
        userId: 'me',
        q: `is:unread after:${Math.floor(lastChecked / 1000)}`,
        maxResults: 10,
      });

      const messages = response.data.messages ?? [];
      for (const msg of messages) {
        if (!msg.id) continue;

        const detail = await gmail.users.messages.get({
          userId: 'me',
          id: msg.id,
          format: 'full',
        });

        const headers = detail.data.payload?.headers ?? [];
        const from = headers.find((h: any) => h.name?.toLowerCase() === 'from')?.value ?? '';
        const to = headers.find((h: any) => h.name?.toLowerCase() === 'to')?.value ?? '';
        const subject = headers.find((h: any) => h.name?.toLowerCase() === 'subject')?.value ?? '';

        // Extract plain text body
        let text = '';
        const parts = detail.data.payload?.parts ?? [];
        const textPart = parts.find((p: any) => p.mimeType === 'text/plain');
        if (textPart?.body?.data) {
          text = Buffer.from(textPart.body.data, 'base64url').toString('utf8');
        } else if (detail.data.payload?.body?.data) {
          text = Buffer.from(detail.data.payload.body.data, 'base64url').toString('utf8');
        }

        const now = Date.now();
        await db('conversation_message').insert({
          conversation_id: 0,
          plugin: 'gmail',
          channel: from,
          message_id: msg.id,
          thread_id: detail.data.threadId ?? null,
          from,
          to,
          timestamp: Math.floor(now / 1000),
          direction: 'received',
          text,
          created_at: now,
        });

        const history = await db('conversation_message')
          .where('plugin', 'gmail')
          .where('channel', from)
          .orderBy('timestamp', 'asc')
          .limit(20);

        const historyEntries = history.map((h: any) => ({
          role: h.direction === 'sent' ? 'assistant' as const : 'user' as const,
          text: h.text ?? '',
          timestamp: h.timestamp,
        }));

        await db('safe_queue').insert({
          job_type: 'gmail:incoming_email',
          data: JSON.stringify({
            messageId: msg.id,
            from,
            to,
            subject,
            text,
            threadId: detail.data.threadId ?? null,
            history: historyEntries,
          }),
          context: JSON.stringify({ channel: 'gmail', from }),
          status: 'pending',
          created_at: now,
          updated_at: now,
        });

        // Mark as read
        await gmail.users.messages.modify({
          userId: 'me',
          id: msg.id,
          requestBody: { removeLabelIds: ['UNREAD'] },
        });
      }

      lastChecked = Date.now();
    } catch {
      // Polling error — will retry on next interval
    }
  };

  setInterval(poll, intervalMs);
}

// ---------------------------------------------------------------------------
// Muteworker Plugin (Tools + Job Handlers)
// ---------------------------------------------------------------------------

interface IncomingEmailPayload {
  messageId: string;
  from: string;
  to: string;
  subject: string;
  text: string;
  threadId?: string | null;
  history?: Array<{ role: 'user' | 'assistant'; text: string; timestamp: number }>;
}

function buildEmailPrompt(payload: IncomingEmailPayload): string {
  const historyLines = payload.history?.length
    ? [
        '--- Email Conversation History ---',
        ...payload.history.map(
          (h) =>
            `[${new Date(h.timestamp * 1000).toISOString()}] ${h.role === 'assistant' ? 'Assistant' : 'User'}: ${h.text}`,
        ),
        '---------------------------------',
      ]
    : [];

  return [
    '--- Email received via Gmail ---',
    `From: ${payload.from}`,
    `To: ${payload.to}`,
    `Subject: ${payload.subject}`,
    payload.threadId ? `Thread ID: ${payload.threadId}` : '',
    ...historyLines,
    'Latest email body:',
    payload.text || '[No text content]',
    '---------------------------------',
  ]
    .filter(Boolean)
    .join('\n');
}

function createSendEmailTool(ctx: MuteworkerPluginContext) {
  return {
    name: 'send_email',
    label: 'Send Email',
    description:
      'Request sending an email via Gmail. The send requires human verification before delivery.',
    parameters: {
      type: 'object',
      properties: {
        to: { type: 'string' },
        subject: { type: 'string' },
        text: { type: 'string' },
      },
      required: ['to', 'subject', 'text'],
      additionalProperties: false,
    } as any,
    execute: async (_toolCallId: string, params: any) => {
      const { to, subject, text } = params;

      const response = await fetch(`${ctx.apiBaseUrl}/api/gmail/send`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ to, subject, text }),
      });

      if (!response.ok) {
        const body = await response.text().catch(() => '');
        throw new Error(`Gmail send failed (${response.status}): ${body.slice(0, 200)}`);
      }

      const result = (await response.json()) as {
        verificationRequestId?: number;
        verificationStatus?: string;
      };

      ctx.artifacts.push({ type: 'text', label: `Email to ${to}`, value: subject });

      const needsVerification = result.verificationStatus === 'pending';
      const replyText = needsVerification
        ? [
            `Email send request queued for ${to} (subject: "${subject}") and pending verification.`,
            `Open ${ctx.verificationUiUrl} to approve request #${result.verificationRequestId}.`,
          ].join('\n')
        : `Email sent to ${to}.`;

      return {
        content: [{ type: 'text', text: replyText }],
        details: result,
      };
    },
  };
}
