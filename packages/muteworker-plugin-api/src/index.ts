/** Logger surface exposed to plugins. */
export interface MuteworkerPluginLogger {
  debug(message: string, data?: Record<string, unknown>): void;
  info(message: string, data?: Record<string, unknown>): void;
  warn(message: string, data?: Record<string, unknown>): void;
  error(message: string, data?: Record<string, unknown>): void;
}

export interface MuteworkerPluginArtifact {
  type: "text";
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

// ---------------------------------------------------------------------------
// Dependency Injection (Backstage-style, parallel to gatekeeper-plugin-api)
// ---------------------------------------------------------------------------

/** Typed DI token. */
export interface ServiceRef<T> {
  readonly id: string;
  /** @internal */ readonly __type?: T;
}

export function createServiceRef<T>(config: { id: string }): ServiceRef<T> {
  return { id: config.id } as ServiceRef<T>;
}

/** Hooks that plugins can register to react to muteworker lifecycle events. */
export interface MuteworkerHooks {
  register(hooks: {
    "muteworker:start"?: () => void | Promise<void>;
    "muteworker:stop"?: () => void | Promise<void>;
    "muteworker:build-system-prompt"?: (
      prev: string,
    ) => string | Promise<string>;
  }): void;
}

// ---------------------------------------------------------------------------
// Service interfaces for DI
// ---------------------------------------------------------------------------

export interface ToolsService {
  registerTools(factory: (ctx: MuteworkerPluginContext) => any[]): void;
}

/** Core service refs available to all muteworker plugins. */
export const muteworkerDeps = {
  hooks: createServiceRef<MuteworkerHooks>({ id: "core.hooks" }),
  tools: createServiceRef<ToolsService>({ id: "core.tools" }),
};

type ResolveDeps<T extends Record<string, ServiceRef<any>>> = {
  [K in keyof T]: T[K] extends ServiceRef<infer U> ? U : never;
};

/** Passed to a plugin's `registerMuteworker` callback so it can declare initialisation work. */
export interface MuteworkerEnvironment {
  registerInit<TDeps extends Record<string, ServiceRef<any>>>(config: {
    deps: TDeps;
    init: (resolved: ResolveDeps<TDeps>) => void | Promise<void>;
  }): void;
}

// ---------------------------------------------------------------------------
// Plugin interface
// ---------------------------------------------------------------------------

/**
 * A muteworker plugin.  Plugins can contribute:
 *
 * - **tools** — registered via `ToolsService` in `registerMuteworker`.
 * - **jobHandlers** — handlers keyed by `jobType` that take over job
 *   execution for specific job types.  The handler receives a `runAgent`
 *   function it can call to execute the Pi agent.
 */
export interface MuteworkerPlugin {
  readonly id: string;
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
  /** Backstage-style registration hook for declaring deps and muteworker lifecycle hooks. */
  readonly registerMuteworker: (env: MuteworkerEnvironment) => void;
}

export function createMuteworkerPlugin(
  options: MuteworkerPlugin,
): MuteworkerPlugin {
  if (!options.id) throw new Error("MuteworkerPlugin: id is required");
  return options;
}
