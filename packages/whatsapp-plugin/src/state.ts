import type { ConversationSummary } from "@sandclaw/ui";

export type ConnectionStatus =
  | "disconnected"
  | "qr_pending"
  | "connecting"
  | "connected";

export interface WhatsAppState {
  waSocket: any;
  connectionStatus: ConnectionStatus;
  qrDataUrl: string | null;
  phoneNumber: string | null;
  recentConversations: ConversationSummary[];
}

const STATE_KEY = "__sandclaw_whatsapp_state__";

const _g = globalThis as any;
if (!_g[STATE_KEY]) {
  _g[STATE_KEY] = {
    waSocket: null,
    connectionStatus: "disconnected" as ConnectionStatus,
    qrDataUrl: null,
    phoneNumber: null,
    recentConversations: [],
  };
}

export const waState: WhatsAppState = _g[STATE_KEY];
