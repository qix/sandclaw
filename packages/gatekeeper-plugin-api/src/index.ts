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

/** Event emitted by the muteworker to report agent execution status. */
export interface AgentStatusEvent {
  jobId: number;
  event: "started" | "step" | "completed" | "failed";
  prompt?: string;
  systemPrompt?: string;
  toolNames?: string[];
  data?: Record<string, unknown>;
  createdAt: number;
}

/** Hooks that plugins can register to react to gatekeeper lifecycle events. */
export interface GatekeeperHooks {
  register(hooks: {
    "gatekeeper:start"?: () => void | Promise<void>;
    "gatekeeper:stop"?: () => void | Promise<void>;
    "muteworker:agent-status"?: (event: AgentStatusEvent) => void | Promise<void>;
  }): void;
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
  onMessage(
    prefix: string,
    handler: (ws: any, data: any) => void,
  ): void;
  /** Send a JSON message to all connected WS clients. */
  broadcast(data: Record<string, unknown>): void;
  /** Register a callback invoked when a new WS client connects. */
  onConnect(handler: (ws: any) => void): void;
}

export interface NotifyService {
  notifyCountChange(): void;
}

/** Core service refs available to all plugins. */
export const gatekeeperDeps = {
  db: createServiceRef<Knex>({ id: "core.db" }),
  hooks: createServiceRef<GatekeeperHooks>({ id: "core.hooks" }),
  components: createServiceRef<ComponentsService>({ id: "core.components" }),
  routes: createServiceRef<RoutesService>({ id: "core.routes" }),
  ws: createServiceRef<WebSocketService>({ id: "core.ws" }),
  notify: createServiceRef<NotifyService>({ id: "core.notify" }),
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
