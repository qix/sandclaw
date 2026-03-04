# Confidante

The Confidante is the "dangerous" TypeScript agent in SandClaw. It holds API credentials and has direct access to the outside world (browser, file system, external services). It only receives jobs that have been approved by a human in the Gatekeeper UI, ensuring it never processes untrusted data directly from the internet or from user messages.

The Confidante deliberately avoids doing complex reasoning over untrusted content. Its job is to execute a specific, human-approved action and return the result.

## Architecture

The Confidante is a Node.js loop that:

1. Long-polls the Gatekeeper's `confidante_queue` for approved jobs
2. Dispatches each job to the matching `confidanteHandler` from a plugin
3. Provides a built-in Docker service so handlers can run work inside containers
4. Marks jobs complete on the Gatekeeper (optionally with a result string)

### Plugin system

`confidanteHandlers` are injected by plugins, following the same pattern as muteworker `jobHandlers`. Each plugin can declare handlers keyed by `jobType`:

```typescript
confidanteHandlers: {
  async 'browser:research_request'(ctx: ConfidantePluginContext) {
    const result = await ctx.docker.run('alpine:latest', ['echo', 'hello']);
    // Post result back...
  },
}
```

Plugins can also use `registerConfidante(env)` for Backstage-style DI lifecycle hooks.

### Built-in Docker interface

The Confidante provides a `DockerService` to all handlers via `ctx.docker`. This runs commands inside Docker containers:

```typescript
interface DockerService {
  run(
    image: string,
    command: string[],
    options?: { timeoutMs?: number; env?: Record<string, string> },
  ): Promise<DockerRunResult>;
}

interface DockerRunResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}
```

Under the hood this calls `docker run --rm <image> <command...>` via `child_process.execFile`.

## Queue flow

```
Human approves verification → Gatekeeper enqueues to confidante_queue
  ↓
Confidante: GET /api/confidante-queue/next (long-poll)
  ↓
Plugin handler executes (e.g. runs Docker container)
  ↓
Handler posts result back via Gatekeeper API (e.g. POST /api/browser/result)
  ↓
Gatekeeper enqueues result to safe_queue
  ↓
Muteworker picks up result job
```

## Browser plugin integration

The browser plugin's confidante handler (`browser:research_request`):

1. Parses the job payload (requestId, prompt, responseJobType)
2. Runs work inside a Docker container via `ctx.docker.run()`
3. Posts the Docker output back to `POST /api/browser/result`
4. This enqueues a `browser:result` job on the `safe_queue` for the muteworker

## Tech Stack

- `@sandclaw/confidante-plugin-api`: Plugin contract (ConfidantePlugin, DockerService, etc.)
- `pino` / `pino-pretty`: Structured logging
- `node:child_process`: Docker command execution

## Configuration

| Option             | Default                  | Description                                  |
| ------------------ | ------------------------ | -------------------------------------------- |
| `apiBaseUrl`       | `http://localhost:3000`  | Gatekeeper base URL                          |
| `pollIntervalMs`   | `3000`                   | Poll interval when long polling is disabled  |
| `longPollTimeoutMs`| `25000`                  | Long-poll timeout sent to Gatekeeper         |
| `jobTimeoutMs`     | `120000`                 | Max job execution time                       |
| `dockerImage`      | `node:22-alpine`         | Default Docker image                         |
| `logLevel`         | `info`                   | Minimum log level                            |

## Running

```bash
npx tsx sample-app/confidante.ts
```
