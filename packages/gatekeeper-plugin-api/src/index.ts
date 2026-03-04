import type { ComponentType } from 'react';

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

/** Hooks that plugins can register to react to gatekeeper lifecycle events. */
export interface GatekeeperHooks {
  register(hooks: {
    'gatekeeper:start'?: () => void | Promise<void>;
    'gatekeeper:stop'?: () => void | Promise<void>;
  }): void;
}

/** Core service refs available to all plugins. */
export const gatekeeperDeps = {
  db: createServiceRef<Knex>({ id: 'core.db' }),
  hooks: createServiceRef<GatekeeperHooks>({ id: 'core.hooks' }),
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

/**
 * A fully-resolved Gatekeeper plugin.  Returned by `createGatekeeperPlugin`.
 */
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
  /** Human-readable label shown in the sidebar. */
  readonly title: string;
  /**
   * React component rendered in the gatekeeper UI when this plugin's tab is
   * active.  Must be a component type (function or class), not a JSX element,
   * so it can be instantiated multiple times.
   */
  readonly component: ComponentType;
  /**
   * Optional React component that renders a rich detail view for verification
   * requests belonging to this plugin.  When provided, the Verifications page
   * will use this component instead of displaying raw JSON.
   */
  readonly verificationRenderer?: ComponentType<VerificationRendererProps>;
  /**
   * Registers Hono route handlers for this plugin.  Called once during
   * `startGatekeeper` before the server begins accepting connections.
   * The `db` parameter is the shared Knex instance for database access.
   */
  readonly routes?: (app: Hono, db: Knex) => void;
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
  /** Human-readable label shown in the sidebar. */
  title: string;
  /** React component for the plugin UI panel. */
  component: ComponentType;
  /** Optional component that renders rich verification request detail views. */
  verificationRenderer?: ComponentType<VerificationRendererProps>;
  /** Optional Hono route registration callback. */
  routes?: (app: Hono, db: Knex) => void;
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
 *   title: 'WhatsApp',
 *   component: WhatsAppPanel,
 * });
 * ```
 */
export function createGatekeeperPlugin(
  options: CreateGatekeeperPluginOptions,
): GatekeeperPlugin {
  const { id, title, component, verificationRenderer, routes, migrations, registerGateway } = options;
  if (!id) throw new Error('GatekeeperPlugin: id is required');
  if (!title) throw new Error('GatekeeperPlugin: title is required');
  if (!component) throw new Error('GatekeeperPlugin: component is required');
  return { id, title, component, verificationRenderer, routes, migrations, registerGateway };
}
