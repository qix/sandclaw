export interface MuteworkerConfig {
  /** Gatekeeper base URL. */
  apiBaseUrl: string;
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
  /** Brave Search API key. Empty string disables the tool. */
  braveApiKey: string;
  /** Max Brave search results returned per query. */
  braveMaxResults: number;
  /** Human-facing URL included in verification prompts. */
  verificationUiUrl: string;
  /** Minimum log level to emit. */
  logLevel: 'debug' | 'info' | 'warn' | 'error';
}

export const DEFAULT_CONFIG: MuteworkerConfig = {
  apiBaseUrl: 'http://localhost:3000',
  modelProvider: 'anthropic',
  modelId: 'claude-sonnet-4-6',
  pollIntervalMs: 3000,
  longPollTimeoutMs: 25000,
  jobTimeoutMs: 120000,
  maxSteps: 8,
  braveApiKey: '',
  braveMaxResults: 5,
  verificationUiUrl: 'http://localhost:3000',
  logLevel: 'info',
};
