import React, { createContext, useContext } from "react";
import type { StatusColorValue } from "@sandclaw/gatekeeper-plugin-api";

export interface WhatsAppMqttStatus {
  statusColor: StatusColorValue;
}

export const WhatsAppMqttStatusContext = createContext<WhatsAppMqttStatus>({
  statusColor: "red",
});

export function useWhatsAppMqttStatus() {
  return useContext(WhatsAppMqttStatusContext);
}
