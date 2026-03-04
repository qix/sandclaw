import { tgState } from './state';
import { connectTelegram, disconnectTelegram, deliverMessage } from './connection';

export function registerRoutes(app: any, db: any, operatorChatIds: ReadonlySet<string>) {
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
        return c.redirect('/?tab=telegram');
      }
      return c.json({ status: 'connected', botUsername: tgState.botUsername });
    } catch (err: any) {
      tgState.connectionStatus = 'disconnected';
      tgState.bot = null;
      tgState.botToken = null;
      const message = err?.message || 'Failed to connect';
      if (!contentType.includes('application/json')) {
        return c.redirect('/?tab=telegram');
      }
      return c.json({ error: message }, 400);
    }
  });

  // POST /disconnect — stops bot, clears session
  app.post('/disconnect', async (c: any) => {
    await disconnectTelegram(db);
    const contentType = c.req.header('content-type') || '';
    if (!contentType.includes('application/json')) {
      return c.redirect('/?tab=telegram');
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
}
