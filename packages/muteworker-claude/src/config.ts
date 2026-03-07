export interface MuteworkerConfig {
  /** Gatekeeper base URL. */
  gatekeeperInternalUrl: string;
  /** LLM model ID (e.g. 'claude-sonnet-4-6'). Always Anthropic. */
  modelId: string;
  /** Poll interval in ms when long polling is disabled. */
  pollIntervalMs: number;
  /** Long-poll timeout in ms sent to the Gatekeeper. */
  longPollTimeoutMs: number;
  /** Max job execution wall-clock time in ms. */
  jobTimeoutMs: number;
  /** Max agentic turns (tool-use round trips) per job. */
  maxTurns: number;
  /** Human-facing URL included in verification prompts. */
  gatekeeperExternalUrl: string;
  /** Minimum log level to emit. */
  logLevel: "debug" | "info" | "warn" | "error";
  /** Tool-loop detection settings. */
  loopDetection?: import("./tool-loop-detection.js").LoopDetectionConfig;
  /**
   * Claude Agent SDK permission mode.
   * Default: "bypassPermissions" for headless use.
   */
  permissionMode:
    | "default"
    | "acceptEdits"
    | "bypassPermissions"
    | "plan"
    | "dontAsk";
  /**
   * Built-in Claude Code tools to allow.
   * Default: [] — only plugin-contributed MCP tools are available.
   */
  allowedBuiltInTools: string[];
}

export const DEFAULT_CONFIG: MuteworkerConfig = {
  gatekeeperInternalUrl: "http://localhost:3000",
  modelId: "claude-sonnet-4-6",
  pollIntervalMs: 3000,
  longPollTimeoutMs: 25000,
  jobTimeoutMs: 120000,
  maxTurns: 8,
  gatekeeperExternalUrl: "http://localhost:3000",
  logLevel: "info",
  permissionMode: "bypassPermissions",
  allowedBuiltInTools: [],
};
