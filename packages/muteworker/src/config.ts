export interface MuteworkerConfig {
  /** Gatekeeper base URL. */
  gatekeeperInternalUrl: string;
  /** LLM model provider (e.g. 'anthropic'). */
  modelProvider: string;
  /** LLM model ID (e.g. 'claude-sonnet-4-6'). */
  modelId: string;
  /** Poll interval in ms when long polling is disabled. */
  pollIntervalMs: number;
  /** Long-poll timeout in ms sent to the Gatekeeper. */
  longPollTimeoutMs: number;
  /** Max job execution wall-clock time in ms. */
  jobTimeoutMs: number;
  /** Max Pi agent steps per job. */
  maxSteps: number;
  /**
   * After this many tool calls, steer the agent to evaluate whether it is
   * making visible progress.  If it isn't, it is told to stop using tools
   * and write a final message explaining what went wrong.  Default: 32.
   */
  maxToolCalls?: number;
  /** Human-facing URL included in verification prompts. */
  gatekeeperExternalUrl: string;
  /** Minimum log level to emit. */
  logLevel: "debug" | "info" | "warn" | "error";
  /** Tool-loop detection settings. */
  loopDetection?: import("./tool-loop-detection").LoopDetectionConfig;
}

export const DEFAULT_CONFIG: MuteworkerConfig = {
  gatekeeperInternalUrl: "http://localhost:3000",
  modelProvider: "anthropic",
  modelId: "claude-sonnet-4-6",
  pollIntervalMs: 3000,
  longPollTimeoutMs: 25000,
  jobTimeoutMs: 120000,
  maxSteps: 8,
  gatekeeperExternalUrl: "http://localhost:3000",
  logLevel: "info",
};
