# Technical spec

## Monorepo structure

This is a monorepo with all the code for sandclaw, as well as some plugins.

- **`packages/`**: Collection of Node.JS packages
- **`app/`**: A sample sandclaw agent using the built-in plugins

## Core packages

- **confidante-plugin-api**: This is the package that plugins will import to interface with Confidante
- **gatekeeper-plugin-api**: This is the package that plugins will import to interface with Gatekeeper
- **muteworker-plugin-api**: This is the package that plugins will import to interface with Muteworker
- **muteworker**: The primary agent loop and source code for muteworker
- **gatekeeper**: The core web user interface and backend services
- **confidante**: The agent loop for dealing with secrets

## Technical choices

- Use `Knex.js` on the Gatekeeper to connect to a local database with `better-sqlite3`
- Gatekeeper uses `Hono` and `React` to render the front and backend
- Use HeroUI for styling

## Plugin architecture

Sandclaw is designed to have a minimal footprint, and instead rely on plugins for the bulk of its functionality. The design is informed by the Backstage project that has a similar set of goals for plugins.

### Plugin API packages

Each Sandclaw component (gatekeeper, muteworker, confidante) has a corresponding `*-plugin-api` package that defines the contract for plugins targeting that component:

- `@sandclaw/gatekeeper-plugin-api` — UI components, backend route handlers, DB migrations
- `@sandclaw/muteworker-plugin-api` — Agent tools the muteworker can call
- `@sandclaw/confidante-plugin-api` — Confidante-side capabilities

### Creating a gatekeeper plugin

Plugins call `createGatekeeperPlugin` from `@sandclaw/gatekeeper-plugin-api`:

```typescript
import { createGatekeeperPlugin } from '@sandclaw/gatekeeper-plugin-api';

export const myPlugin = createGatekeeperPlugin({
  id: 'my-plugin',
  title: 'My Plugin',
  component: MyPanelComponent,
});
```

A `GatekeeperPlugin` can contribute:
- **`component`** — A React `ComponentType` rendered in the gatekeeper UI sidebar
- **`routes`** — A function `(app: Hono) => void` that registers backend API routes
- **`migrations`** — A function `(knex: Knex) => Promise<void>` that runs DB migrations on startup

### Starting the gatekeeper with plugins

The gatekeeper exposes `startGatekeeper` which accepts a list of plugins:

```typescript
import { startGatekeeper } from '@sandclaw/gatekeeper';
import { myPlugin } from '@sandclaw/my-plugin';

startGatekeeper({
  plugins: [myPlugin],
  port: 3000,
});
```

On startup, `startGatekeeper`:
1. Runs each plugin's `migrations` against the SQLite database
2. Registers each plugin's `routes` on the Hono app
3. Serves the React SPA, which renders each plugin's `component` in a sidebar tab

### Plugin lifecycle

Plugins are pure data objects — `createGatekeeperPlugin` is a simple factory that validates and returns the options. All orchestration happens inside `startGatekeeper`.

## Built-in plugins

Each of the built-in plugins should be fully self-contained within a `packages/{name}` directory. The primary functionality is defined by a `SPEC.md` file inside that directory.

The set of built-in plugins is:

- **whatsapp**: Connects to WhatsApp and allows sending/receiving messages
- **obsidian**: Allows searching, reading and writing of any Obsidian markdown notes
- **gmail**: Connection to GMail accounts, provides GMail specific features and webhooks.
- **github**: Enables the creation of pull requests, as well as merging them and downloading code.
- **browser**: Performs browser actions on the confidante app.
