import type { ComponentType } from "react";

export { NavigationContext, TabVariantContext, TabLink } from "./components";
export type { TabLinkProps } from "./components";

// Lazy-import types to avoid pulling in heavy runtime dependencies at the
// definition layer.  Concrete types are used by the gatekeeper at runtime.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Hono = any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Knex = any;

// ---------------------------------------------------------------------------
// Dependency Injection (Backstage-style)
// ---------------------------------------------------------------------------

/** Typed DI token. */
export interface ServiceRef<T> {
  readonly id: string;
  /** @internal */ readonly __type?: T;
}

export function createServiceRef<T>(config: { id: string }): ServiceRef<T> {
  return { id: config.id } as ServiceRef<T>;
}

/** Identifies the originating worker job for a verification request. */
export interface JobContext {
  worker: "muteworker" | "confidante";
  jobId: number;
}

/** Event emitted by the muteworker to report agent execution status. */
export interface AgentStatusEvent {
  jobId: number;
  event:
    | "queued"
    | "started"
    | "step"
    | "tool_result"
    | "completed"
    | "failed";
  prompt?: string;
  systemPrompt?: string;
  /** Structured map of system prompt sources: { PromptFilename: Source }. */
  systemPromptSources?: Record<string, string>;
  toolNames?: string[];
  data?: Record<string, unknown>;
  createdAt: string;
}

/** Generic listener for a named hook. */
export type HookListener<TArgs = unknown, TResult = unknown> = (
  args: TArgs,
) => TResult | Promise<TResult>;

/** Options when running a named hook via {@link GatekeeperHooks.runHook}. */
export interface RunHookOptions {
  /** If true, do not throw when no listeners are registered. Default: false. */
  allowEmpty?: boolean;
}

/** Aggregated result of running a named hook. */
export interface RunHookResult<TResult = unknown> {
  /** Results from each registered listener, in registration order. */
  results: TResult[];
  /** Number of listeners that ran. */
  listenerCount: number;
}

/** Hooks that plugins can register to react to gatekeeper lifecycle events. */
export interface GatekeeperHooks {
  register(hooks: {
    "gatekeeper:start"?: () => void | Promise<void>;
    "gatekeeper:stop"?: () => void | Promise<void>;
    "muteworker:agent-status"?: (
      event: AgentStatusEvent,
    ) => void | Promise<void>;
  }): void;
  /** Fire an agent status event to all registered hooks. Fire-and-forget. */
  fireAgentStatus(event: AgentStatusEvent): void;

  /**
   * Register a listener for a named hook (e.g. `"reply:all"`). Multiple plugins
   * may register listeners for the same name; all run when {@link runHook} is called.
   */
  registerHook<TArgs = unknown, TResult = unknown>(
    name: string,
    listener: HookListener<TArgs, TResult>,
  ): void;

  /**
   * Run every listener registered for `name` in parallel, returning their results
   * and the count. Throws when no listeners exist unless `options.allowEmpty` is set.
   */
  runHook<TArgs = unknown, TResult = unknown>(
    name: string,
    args: TArgs,
    options?: RunHookOptions,
  ): Promise<RunHookResult<TResult>>;
}

// ---------------------------------------------------------------------------
// Service interfaces for DI
// ---------------------------------------------------------------------------

export type StatusColorValue = "green" | "yellow" | "red" | "gray";

export interface ComponentsService {
  register(name: string, component: ComponentType<any>): void;
}

export interface RoutesService {
  registerRoutes(handler: (app: Hono) => void): void;
}

export interface WebSocketService {
  /** Register a handler for incoming WS messages whose `type` starts with `prefix:`. */
  onMessage(prefix: string, handler: (ws: any, data: any) => void): void;
  /** Send a JSON message to all connected WS clients. */
  broadcast(data: Record<string, unknown>): void;
  /** Register a callback invoked when a new WS client connects. */
  onConnect(handler: (ws: any) => void): void;
}

export interface NotifyService {
  notifyCountChange(): void;
}

/** Helper functions passed to a verification callback when a request is approved. */
export interface VerificationHelpers {
  /** Insert a job into the queue and log a "queued" agent status event. */
  queueJob(
    executor: "muteworker" | "confidante",
    jobType: string,
    data: any,
  ): Promise<{ jobId: number }>;
}

/** Callback invoked when a verification request belonging to this plugin is approved. */
export type VerificationCallback = (
  request: { id: number; action: string; data: any; jobContext?: JobContext },
  helpers: VerificationHelpers,
) => Promise<void>;

export interface VerificationsService {
  /** Register a callback that runs when a verification for this plugin is approved. */
  registerVerificationCallback(callback: VerificationCallback): void;

  /**
   * Create a verification request for this plugin.
   *
   * When `autoApprove` is true the registered verification callback is invoked
   * immediately and the request is stored as "approved".  If the callback
   * throws, the request is marked as "error" with the exception details stored
   * for the operator to review in the browser UI.
   */
  requestVerification(options: {
    action: string;
    data: any;
    jobContext?: JobContext;
    autoApprove?: boolean;
  }): Promise<{ id: number; status: "pending" | "approved" | "error" }>;
}

/** Data payload for a job. Serialized to JSON before storage. */
export type JobData = Record<string, unknown>;

/** Context metadata attached to a job. Serialized to JSON before storage. */
export interface JobContextData {
  channel: string;
  [key: string]: unknown;
}

/** Description of a job to be created. */
export interface JobSpec {
  executor: "muteworker" | "confidante";
  jobType: string;
  data: JobData;
  context?: JobContextData;
}

/**
 * Execution context for job operations. Carries optional ambient state
 * (currently a knex transaction) so interceptors and queue writes can
 * participate in the caller's transaction.
 *
 * Always create via {@link createContext}; never construct an object literal.
 */
export interface Context {
  /** When set, all DB writes performed for this operation should use this knex transaction. */
  trx?: Knex;
}

/** Construct a {@link Context}. The only sanctioned way to create one. */
export function createContext(opts: { trx?: Knex } = {}): Context {
  return { trx: opts.trx };
}

/**
 * Result returned by a job interceptor.
 * - `undefined` / `null` → continue to next interceptor / create normally
 * - `{ handled: true }` → the interceptor consumed the job (e.g. grouped it)
 */
export interface JobInterceptResult {
  handled: boolean;
}

/** Callback that can intercept job creation before it hits the queue. */
export type JobInterceptor = (
  ctx: Context,
  job: JobSpec,
) => Promise<JobInterceptResult | null | undefined | void>;

/** Service for creating jobs and intercepting job creation. */
export interface JobService {
  /** Create a job. Interceptors run first; if none handles it the job is queued normally. */
  createJob(
    ctx: Context,
    spec: JobSpec,
  ): Promise<{ jobId: number } | { handled: true }>;
  /** Register an interceptor that runs before every job is created. */
  onBeforeCreateJob(interceptor: JobInterceptor): void;
}

/** Core service refs available to all plugins. */
export const gatekeeperDeps = {
  db: createServiceRef<Knex>({ id: "core.db" }),
  hooks: createServiceRef<GatekeeperHooks>({ id: "core.hooks" }),
  components: createServiceRef<ComponentsService>({ id: "core.components" }),
  routes: createServiceRef<RoutesService>({ id: "core.routes" }),
  ws: createServiceRef<WebSocketService>({ id: "core.ws" }),
  notify: createServiceRef<NotifyService>({ id: "core.notify" }),
  verifications: createServiceRef<VerificationsService>({
    id: "core.verifications",
  }),
  jobs: createServiceRef<JobService>({ id: "core.jobs" }),
};

type ResolveDeps<T extends Record<string, ServiceRef<any>>> = {
  [K in keyof T]: T[K] extends ServiceRef<infer U> ? U : never;
};

/** Passed to a plugin's `registerGateway` callback so it can declare initialisation work. */
export interface PluginEnvironment {
  registerInit<TDeps extends Record<string, ServiceRef<any>>>(config: {
    deps: TDeps;
    init: (resolved: ResolveDeps<TDeps>) => void | Promise<void>;
  }): void;
}

// ---------------------------------------------------------------------------
// Plugin interfaces
// ---------------------------------------------------------------------------

/** Props passed to a plugin's verification renderer component. */
export interface VerificationRendererProps {
  /** The action string from the verification request (e.g. "send_message"). */
  action: string;
  /** The parsed JSON payload from the verification request's `data` column. */
  data: any;
}

export interface GatekeeperPlugin {
  /** Unique identifier, e.g. `"whatsapp"`. */
  readonly id: string;
  /**
   * Optional React component that renders a rich detail view for verification
   * requests belonging to this plugin.  When provided, the Verifications page
   * will use this component instead of displaying raw JSON.
   */
  readonly verificationRenderer?: ComponentType<VerificationRendererProps>;
  /**
   * Runs any database migrations needed by this plugin.  Called once during
   * `startGatekeeper` before routes are registered.
   */
  readonly migrations?: (knex: Knex) => Promise<void>;
  /** Backstage-style registration hook for declaring deps and gatekeeper lifecycle hooks. */
  readonly registerGateway: (env: PluginEnvironment) => void;
}

export interface CreateGatekeeperPluginOptions {
  /** Unique identifier, e.g. `"whatsapp"`. */
  id: string;
  /** Optional component that renders rich verification request detail views. */
  verificationRenderer?: ComponentType<VerificationRendererProps>;
  /** Optional DB migration callback. */
  migrations?: (knex: Knex) => Promise<void>;
  /** Backstage-style registration hook for declaring deps and gatekeeper lifecycle hooks. */
  registerGateway: (env: PluginEnvironment) => void;
}

/**
 * Creates a Gatekeeper plugin.
 *
 * @example
 * ```ts
 * export const whatsappPlugin = createGatekeeperPlugin({
 *   id: 'whatsapp',
 *   registerGateway(env) { ... },
 * });
 * ```
 */
export function createGatekeeperPlugin(
  options: CreateGatekeeperPluginOptions,
): GatekeeperPlugin {
  const { id, verificationRenderer, migrations, registerGateway } = options;
  if (!id) throw new Error("GatekeeperPlugin: id is required");
  return { id, verificationRenderer, migrations, registerGateway };
}
