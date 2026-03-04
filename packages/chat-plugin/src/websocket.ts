import { WebSocketServer, type WebSocket } from 'ws';
import { chatState, broadcast } from './state';

export type DbHandle = any;

let wss: WebSocketServer | null = null;

/** Get or create the WebSocketServer (noServer mode). */
function getWss(): WebSocketServer {
  if (!wss) {
    wss = new WebSocketServer({ noServer: true });
  }
  return wss;
}

/** Conversation ID for the chat thread, lazily resolved. */
let conversationId: number | null = null;

async function getOrCreateConversationId(db: DbHandle): Promise<number> {
  if (conversationId != null) return conversationId;

  const existing = await db('conversations')
    .where({ plugin: 'chat', channel: 'chat', external_id: 'operator' })
    .first();

  if (existing) {
    conversationId = existing.id;
    return conversationId!;
  }

  const [id] = await db('conversations').insert({
    plugin: 'chat',
    channel: 'chat',
    external_id: 'operator',
    created_at: Date.now(),
  });
  conversationId = id;
  return conversationId!;
}

async function getRecentHistory(db: DbHandle, limit = 50) {
  const convId = await getOrCreateConversationId(db);
  const rows = await db('conversation_message')
    .where({ conversation_id: convId })
    .orderBy('created_at', 'desc')
    .limit(limit);
  return rows.reverse().map((r: any) => ({
    id: r.id,
    from: r.from,
    text: r.text,
    direction: r.direction,
    timestamp: r.timestamp,
  }));
}

/** Store a message and return its DB row data. */
export async function storeMessage(
  db: DbHandle,
  direction: 'inbound' | 'outbound',
  from: string,
  text: string,
) {
  const convId = await getOrCreateConversationId(db);
  const now = Math.floor(Date.now() / 1000);
  const [id] = await db('conversation_message').insert({
    conversation_id: convId,
    plugin: 'chat',
    channel: 'chat',
    message_id: `chat-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    thread_id: 'operator',
    from,
    to: direction === 'inbound' ? 'agent' : 'operator',
    timestamp: now,
    direction,
    text,
    created_at: Date.now(),
  });
  return { id, from, text, direction, timestamp: now };
}

/** Enqueue a safe_queue job for muteworker processing. */
async function enqueueJob(db: DbHandle, text: string, history: any[]) {
  await db('safe_queue').insert({
    job_type: 'chat:incoming_message',
    data: JSON.stringify({ text, history }),
    context: JSON.stringify({ channel: 'chat' }),
    status: 'pending',
    created_at: Date.now(),
    updated_at: Date.now(),
  });
}

/** Handle a WebSocket upgrade request. */
export function handleUpgrade(db: DbHandle) {
  return (req: any, socket: any, head: Buffer) => {
    const server = getWss();
    server.handleUpgrade(req, socket, head, (ws) => {
      server.emit('connection', ws, req);
      onConnection(ws, db);
    });
  };
}

function onConnection(ws: WebSocket, db: DbHandle) {
  chatState.clients.add(ws);

  // Send history on connect
  getRecentHistory(db).then((messages) => {
    if (ws.readyState === ws.OPEN) {
      ws.send(JSON.stringify({ type: 'history', messages }));
    }
  }).catch(() => {});

  ws.on('message', async (raw) => {
    try {
      const data = JSON.parse(String(raw));
      if (data.type === 'message' && data.text) {
        const msg = await storeMessage(db, 'inbound', 'operator', data.text);
        broadcast({ type: 'message', ...msg });

        // Build history for the agent
        const history = await getRecentHistory(db, 20);
        const agentHistory = history.slice(0, -1).map((m: any) => ({
          role: m.direction === 'inbound' ? 'user' as const : 'assistant' as const,
          text: m.text,
          timestamp: m.timestamp,
        }));

        await enqueueJob(db, data.text, agentHistory);
      }
    } catch {
      // Ignore malformed messages
    }
  });

  ws.on('close', () => {
    chatState.clients.delete(ws);
  });
}
