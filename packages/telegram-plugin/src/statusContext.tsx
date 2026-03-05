import React, { createContext, useContext } from "react";
import type { StatusColorValue } from "@sandclaw/gatekeeper-plugin-api";

export interface TelegramStatus {
  statusColor: StatusColorValue;
}

export const TelegramStatusContext = createContext<TelegramStatus>({
  statusColor: "red",
});

export function useTelegramStatus() {
  return useContext(TelegramStatusContext);
}
