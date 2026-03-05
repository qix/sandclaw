import TelegramBot from "node-telegram-bot-api";
import type { ConversationSummary } from "@sandclaw/ui";

export type ConnectionStatus =
  | "disconnected"
  | "waiting_for_token"
  | "connecting"
  | "connected";

export interface TelegramState {
  bot: TelegramBot | null;
  connectionStatus: ConnectionStatus;
  botUsername: string | null;
  botToken: string | null;
  recentConversations: ConversationSummary[];
}

const STATE_KEY = "__sandclaw_telegram_state__";

const _g = globalThis as any;
if (!_g[STATE_KEY]) {
  _g[STATE_KEY] = {
    bot: null,
    connectionStatus: "disconnected" as ConnectionStatus,
    botUsername: null,
    botToken: null,
    recentConversations: [],
  };
}

export const tgState: TelegramState = _g[STATE_KEY];
