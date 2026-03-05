import React, { createContext, useContext } from "react";
import type { StatusColorValue } from "@sandclaw/gatekeeper-plugin-api";

export interface WhatsAppStatus {
  statusColor: StatusColorValue;
}

export const WhatsAppStatusContext = createContext<WhatsAppStatus>({
  statusColor: "red",
});

export function useWhatsAppStatus() {
  return useContext(WhatsAppStatusContext);
}
