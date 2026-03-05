export interface ConfidanteConfig {
  /** Gatekeeper base URL. */
  apiBaseUrl: string;
  /** Poll interval in ms when long polling is disabled. */
  pollIntervalMs: number;
  /** Long-poll timeout in ms sent to the Gatekeeper. */
  longPollTimeoutMs: number;
  /** Max job execution wall-clock time in ms. */
  jobTimeoutMs: number;
  /** Default Docker image for container jobs. */
  dockerImage: string;
  /** Minimum log level to emit. */
  logLevel: "debug" | "info" | "warn" | "error";
}

export const DEFAULT_CONFIG: ConfidanteConfig = {
  apiBaseUrl: "http://localhost:3000",
  pollIntervalMs: 3000,
  longPollTimeoutMs: 25000,
  jobTimeoutMs: 120000,
  dockerImage: "node:22-alpine",
  logLevel: "info",
};
