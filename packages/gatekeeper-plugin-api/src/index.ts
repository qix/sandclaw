import type { ComponentType } from 'react';

// Lazy-import types to avoid pulling in heavy runtime dependencies at the
// definition layer.  Concrete types are used by the gatekeeper at runtime.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Hono = any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Knex = any;

/**
 * A fully-resolved Gatekeeper plugin.  Returned by `createGatekeeperPlugin`.
 */
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
   * Registers Hono route handlers for this plugin.  Called once during
   * `startGatekeeper` before the server begins accepting connections.
   */
  readonly routes?: (app: Hono) => void;
  /**
   * Runs any database migrations needed by this plugin.  Called once during
   * `startGatekeeper` before routes are registered.
   */
  readonly migrations?: (knex: Knex) => Promise<void>;
}

export interface CreateGatekeeperPluginOptions {
  /** Unique identifier, e.g. `"whatsapp"`. */
  id: string;
  /** Human-readable label shown in the sidebar. */
  title: string;
  /** React component for the plugin UI panel. */
  component: ComponentType;
  /** Optional Hono route registration callback. */
  routes?: (app: Hono) => void;
  /** Optional DB migration callback. */
  migrations?: (knex: Knex) => Promise<void>;
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
  const { id, title, component, routes, migrations } = options;
  if (!id) throw new Error('GatekeeperPlugin: id is required');
  if (!title) throw new Error('GatekeeperPlugin: title is required');
  if (!component) throw new Error('GatekeeperPlugin: component is required');
  return { id, title, component, routes, migrations };
}
