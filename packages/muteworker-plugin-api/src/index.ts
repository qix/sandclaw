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
  gatekeeperInternalUrl: string;
  /** URL shown to users inside verification prompts. */
  gatekeeperExternalUrl: string;
  logger: MuteworkerPluginLogger;
  job: MuteworkerPluginJob;
  artifacts: MuteworkerPluginArtifact[];
}

export interface RunAgentResult {
  /** The assistant's final text reply, or null if no text was produced. */
  reply: string | null;
}

export interface RunAgentOptions {
  /** Additional system prompt prepended to the base system prompt for this run. */
  systemPrompt?: string;
  /** Override the model ID for this run (e.g. 'claude-sonnet-4-6'). */
  modelId?: string;
}

/**
 * Runs the Pi agent with the given prompt and the assembled tool set.
 * Returns the agent's final reply text (or null).
 */
export type RunAgentFn = (
  prompt: string,
  options?: RunAgentOptions,
) => Promise<RunAgentResult>;

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

/**
 * A structured map of system prompt sources.
 * Keys are filenames or identifiers, values are the prompt content.
 */
export type SystemPromptSources = Record<string, string>;

/** Hooks that plugins can register to react to muteworker lifecycle events. */
export interface MuteworkerHooks {
  register(hooks: {
    "muteworker:start"?: () => void | Promise<void>;
    "muteworker:stop"?: () => void | Promise<void>;
    "muteworker:build-system-prompt"?: (
      prev: SystemPromptSources,
    ) => SystemPromptSources | Promise<SystemPromptSources>;
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

// ---------------------------------------------------------------------------
// Plugin context factory
// ---------------------------------------------------------------------------

/** A simple console logger for contexts without a dedicated logger (e.g. tool listing). */
export const consoleLogger: MuteworkerPluginLogger = {
  debug(message, data) {
    console.debug(message, ...(data ? [data] : []));
  },
  info(message, data) {
    console.info(message, ...(data ? [data] : []));
  },
  warn(message, data) {
    console.warn(message, ...(data ? [data] : []));
  },
  error(message, data) {
    console.error(message, ...(data ? [data] : []));
  },
};

/** Create a {@link MuteworkerPluginContext}. `logger` is required to prevent accidental omission. */
export function createMuteworkerPluginContext(opts: {
  gatekeeperInternalUrl: string;
  gatekeeperExternalUrl: string;
  logger?: MuteworkerPluginLogger;
  job: MuteworkerPluginJob;
  artifacts?: MuteworkerPluginArtifact[];
}): MuteworkerPluginContext {
  return {
    gatekeeperInternalUrl: opts.gatekeeperInternalUrl,
    gatekeeperExternalUrl: opts.gatekeeperExternalUrl,
    logger: opts.logger ?? consoleLogger,
    job: opts.job,
    artifacts: opts.artifacts ?? [],
  };
}
