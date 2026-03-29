export interface ConfidanteConfig {
  /** Gatekeeper base URL. */
  gatekeeperInternalUrl: string;
  /** Model ID for agent work (e.g. "claude-opus-4-6"). */
  modelId?: string;
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
  gatekeeperInternalUrl: "http://localhost:3000",
  pollIntervalMs: 3000,
  longPollTimeoutMs: 25000,
  jobTimeoutMs: 15 * 60_000, // 15 minutes
  dockerImage: "node:22-alpine",
  logLevel: "info",
};
