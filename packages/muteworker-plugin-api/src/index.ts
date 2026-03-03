/** Logger surface exposed to plugins. */
export interface MuteworkerPluginLogger {
  debug(message: string, data?: Record<string, unknown>): void;
  info(message: string, data?: Record<string, unknown>): void;
  warn(message: string, data?: Record<string, unknown>): void;
  error(message: string, data?: Record<string, unknown>): void;
}

export interface MuteworkerPluginArtifact {
  type: 'text';
  label: string;
  value: string;
}

export interface MuteworkerPluginJob {
  id: number;
  jobType: string;
  /** JSON-encoded payload. Parse before use. */
  data: string;
  /** Optional JSON-encoded caller context. */
  context?: string | null;
}

/**
 * Context object passed to every plugin callback.
 *
 * Plugins should push to `artifacts` to record side-effects for logging.
 */
export interface MuteworkerPluginContext {
  /** Gatekeeper base URL (e.g. "http://localhost:3000"). */
  apiBaseUrl: string;
  /** URL shown to users inside verification prompts. */
  verificationUiUrl: string;
  logger: MuteworkerPluginLogger;
  job: MuteworkerPluginJob;
  artifacts: MuteworkerPluginArtifact[];
}

export interface RunAgentResult {
  /** The assistant's final text reply, or null if no text was produced. */
  reply: string | null;
}

/**
 * Runs the Pi agent with the given prompt and the assembled tool set.
 * Returns the agent's final reply text (or null).
 */
export type RunAgentFn = (prompt: string) => Promise<RunAgentResult>;

/**
 * A muteworker plugin.  Plugins can contribute:
 *
 * - **tools** — `AgentTool[]` added to every job's agent tool set.
 * - **jobHandlers** — handlers keyed by `jobType` that take over job
 *   execution for specific job types.  The handler receives a `runAgent`
 *   function it can call to execute the Pi agent.
 */
export interface MuteworkerPlugin {
  readonly id: string;
  /**
   * Returns agent tools to add to every job's tool set.
   * The return type is `any[]` to avoid forcing a dependency on
   * `@mariozechner/pi-agent-core` at the plugin definition layer.
   */
  readonly tools?: (ctx: MuteworkerPluginContext) => any[];
  /**
   * Job type handlers.  Key is the `jobType` string
   * (e.g. `"whatsapp:incoming_message"`).
   */
  readonly jobHandlers?: {
    readonly [jobType: string]: (
      ctx: MuteworkerPluginContext,
      runAgent: RunAgentFn,
    ) => Promise<void>;
  };
}

export function createMuteworkerPlugin(options: MuteworkerPlugin): MuteworkerPlugin {
  if (!options.id) throw new Error('MuteworkerPlugin: id is required');
  return options;
}
