<p align="center">
  <img src="assets/sandclaw-versus-robot.jpg" alt="Sandclaw" width="200" />
</p>

<h1 align="center">Sandclaw</h1>

<p align="center">A human-in-the-loop safety framework for AI agents</p>

---

Sandclaw separates **safe operations** (processing data that may contain prompt injections) from **dangerous operations** (actions that can affect the outside world or leak secrets). Every dangerous action must pass through a human approval step before it executes.

## Architecture

Sandclaw has three core components:

| Component | Role |
|-----------|------|
| **Gatekeeper** | The control center. Hosts the approval UI, manages the SQLite database, and exposes the REST API consumed by the other two components. |
| **Muteworker** | The "safe" agent. Does all the reasoning and LLM inference, but has no credentials and cannot reach the outside world directly. All real-world actions are submitted to the Gatekeeper as verification requests. |
| **Confidante** | The "dangerous" agent. Holds credentials and has direct internet/browser access. It only receives jobs that a human has already approved in the Gatekeeper UI. |

```
                    ┌─────────────────┐
  Incoming data ──► │   Muteworker    │ (no credentials, no internet)
                    │  (safe agent)   │
                    └────────┬────────┘
                             │ verification requests
                             ▼
                    ┌─────────────────┐
  Operator ◄──────► │   Gatekeeper   │ (approval UI + REST API)
                    └────────┬────────┘
                             │ approved jobs only
                             ▼
                    ┌─────────────────┐
                    │   Confidante    │ (credentials, browser access)
                    │ (danger agent)  │
                    └─────────────────┘
```

## Packages

This is a Node.js monorepo. All packages live under `packages/`.

### Core

| Package | Description |
|---------|-------------|
| `gatekeeper` | Web UI and backend (Hono + React + SQLite) |
| `muteworker` | Safe agent loop and job executor |
| `confidante` | Dangerous agent with browser automation |
| `gatekeeper-plugin-api` | Plugin contract for extending the Gatekeeper |

### Built-in Plugins

| Plugin | Description |
|--------|-------------|
| `whatsapp-plugin` | Send and receive WhatsApp messages |
| `gmail-plugin` | Gmail integration and webhooks |
| `github-plugin` | Create and merge pull requests, download code |
| `obsidian-plugin` | Search, read, and write Obsidian vault notes |
| `browser-plugin` | Browser automation via the Confidante |

## Plugin System

Sandclaw's functionality is built around plugins. Each plugin can contribute UI panels, backend routes, and database migrations to the Gatekeeper.

### Creating a plugin

```typescript
import { createGatekeeperPlugin } from '@sandclaw/gatekeeper-plugin-api';

export const myPlugin = createGatekeeperPlugin({
  id: 'my-plugin',
  title: 'My Plugin',
  component: MyPanelComponent, // React component for the sidebar
  routes: (app) => {           // Hono route registrations
    app.post('/api/my-plugin/action', handler);
  },
  migrations: async (knex) => { // DB migrations run on startup
    await knex.schema.createTable('my_table', (t) => { /* ... */ });
  },
});
```

### Starting the Gatekeeper with plugins

```typescript
import { startGatekeeper } from '@sandclaw/gatekeeper';
import { myPlugin } from '@sandclaw/my-plugin';

startGatekeeper({
  plugins: [myPlugin],
  port: 3000,
});
```

On startup, `startGatekeeper` runs each plugin's migrations, registers its routes, and renders its component as a sidebar tab in the UI.

## Tech Stack

- **Gatekeeper**: [Hono](https://hono.dev) · [React](https://react.dev) · [HeroUI](https://www.heroui.com) · [better-sqlite3](https://github.com/WiseLibs/better-sqlite3) via Knex
- **Muteworker / Confidante**: `@mariozechner/pi-agent-core` · `@mariozechner/pi-ai`

## Sample App

A working example using the built-in plugins is in `sample-app/`.

```typescript
// sample-app/gatekeeper.ts
import { startGatekeeper } from '@sandclaw/gatekeeper';
import { whatsappPlugin } from '@sandclaw/whatsapp-plugin';
// ... additional plugins

startGatekeeper({ plugins: [whatsappPlugin, /* ... */], port: 3000 });
```
