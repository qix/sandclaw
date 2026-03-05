import type { WebSocket } from "ws";

export interface ChatState {
  clients: Set<WebSocket>;
}

const STATE_KEY = "__sandclaw_chat_state__";

const _g = globalThis as any;
if (!_g[STATE_KEY]) {
  _g[STATE_KEY] = {
    clients: new Set<WebSocket>(),
  };
}

export const chatState: ChatState = _g[STATE_KEY];

/** Send a JSON message to all connected WebSocket clients. */
export function broadcast(data: Record<string, unknown>) {
  const msg = JSON.stringify(data);
  for (const ws of chatState.clients) {
    if (ws.readyState === ws.OPEN) {
      ws.send(msg);
    }
  }
}
