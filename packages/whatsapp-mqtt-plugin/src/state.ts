import type { MqttClient } from "mqtt";
import type { ConversationSummary } from "@sandclaw/ui";

export type ConnectionStatus = "disconnected" | "connecting" | "connected";

export interface WhatsAppMqttState {
  mqttClient: MqttClient | null;
  connectionStatus: ConnectionStatus;
  recentConversations: ConversationSummary[];
}

const STATE_KEY = "__sandclaw_whatsapp_mqtt_state__";

const _g = globalThis as any;
if (!_g[STATE_KEY]) {
  _g[STATE_KEY] = {
    mqttClient: null,
    connectionStatus: "disconnected" as ConnectionStatus,
    recentConversations: [],
  };
}

export const wamState: WhatsAppMqttState = _g[STATE_KEY];
