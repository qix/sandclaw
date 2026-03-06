/** Logger surface exposed to plugins. */
export interface ConfidantePluginLogger {
  debug(message: string, data?: Record<string, unknown>): void;
  info(message: string, data?: Record<string, unknown>): void;
  warn(message: string, data?: Record<string, unknown>): void;
  error(message: string, data?: Record<string, unknown>): void;
}

export interface ConfidantePluginJob {
  id: number;
  jobType: string;
  /** JSON-encoded payload. Parse before use. */
  data: string;
}

/** Result of running a command inside a Docker container. */
export interface DockerRunResult {
  /** Process exit code. */
  exitCode: number;
  /** Combined stdout output. */
  stdout: string;
  /** Combined stderr output. */
  stderr: string;
}

/** Built-in Docker interface provided by the Confidante. */
export interface DockerService {
  /**
   * Run a command inside a Docker container and return the result.
   *
   * @param image  Docker image to use (e.g. `"node:22-alpine"`).
   * @param command  Command to execute inside the container.
   * @param options  Optional settings (timeout, env vars, etc.).
   */
  run(
    image: string,
    command: string[],
    options?: { timeoutMs?: number; env?: Record<string, string> },
  ): Promise<DockerRunResult>;
}

/**
 * Context object passed to every confidante handler.
 */
export interface ConfidantePluginContext {
  /** Gatekeeper base URL (e.g. "http://localhost:3000"). */
  gatekeeperInternalUrl: string;
  logger: ConfidantePluginLogger;
  job: ConfidantePluginJob;
  /** Built-in Docker service for running work inside containers. */
  docker: DockerService;
}

// ---------------------------------------------------------------------------
// Dependency Injection (Backstage-style, parallel to muteworker-plugin-api)
// ---------------------------------------------------------------------------

/** Typed DI token. */
export interface ServiceRef<T> {
  readonly id: string;
  /** @internal */ readonly __type?: T;
}

export function createServiceRef<T>(config: { id: string }): ServiceRef<T> {
  return { id: config.id } as ServiceRef<T>;
}

/** Hooks that plugins can register to react to confidante lifecycle events. */
export interface ConfidanteHooks {
  register(hooks: {
    "confidante:start"?: () => void | Promise<void>;
    "confidante:stop"?: () => void | Promise<void>;
  }): void;
}

// ---------------------------------------------------------------------------
// Service interfaces for DI
// ---------------------------------------------------------------------------

/** Core service refs available to all confidante plugins. */
export const confidanteDeps = {
  hooks: createServiceRef<ConfidanteHooks>({ id: "core.hooks" }),
  docker: createServiceRef<DockerService>({ id: "core.docker" }),
};

type ResolveDeps<T extends Record<string, ServiceRef<any>>> = {
  [K in keyof T]: T[K] extends ServiceRef<infer U> ? U : never;
};

/** Passed to a plugin's `registerConfidante` callback so it can declare initialisation work. */
export interface ConfidanteEnvironment {
  registerInit<TDeps extends Record<string, ServiceRef<any>>>(config: {
    deps: TDeps;
    init: (resolved: ResolveDeps<TDeps>) => void | Promise<void>;
  }): void;
}

// ---------------------------------------------------------------------------
// Plugin interface
// ---------------------------------------------------------------------------

/**
 * A confidante plugin.  Plugins can contribute:
 *
 * - **confidanteHandlers** — handlers keyed by `jobType` that execute
 *   confidante jobs.  The handler receives a context with a Docker service
 *   for running work inside containers.
 */
export interface ConfidantePlugin {
  readonly id: string;
  /**
   * Job type handlers.  Key is the `jobType` string
   * (e.g. `"browser:research_request"`).
   */
  readonly confidanteHandlers?: {
    readonly [jobType: string]: (
      ctx: ConfidantePluginContext,
    ) => Promise<string | void>;
  };
  /** Backstage-style registration hook for declaring deps and confidante lifecycle hooks. */
  readonly registerConfidante?: (env: ConfidanteEnvironment) => void;
}

export function createConfidantePlugin(
  options: ConfidantePlugin,
): ConfidantePlugin {
  if (!options.id) throw new Error("ConfidantePlugin: id is required");
  return options;
}
