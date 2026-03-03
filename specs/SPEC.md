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

## Built-in plugins

Each of the built-in plugins should be fully self-contained within a `packages/{name}` directory. The primary functionality is defined by a `SPEC.md` file inside that directory.

The set of built-in plugins is:

- **whatsapp**: Connects to WhatsApp and allows sending/receiving messages
- **obsidian**: Allows searching, reading and writing of any Obsidian markdown notes
- **gmail**: Connection to GMail accounts, provides GMail specific features and webhooks.
- **github**: Enables the creation of pull requests, as well as merging them and downloading code.
- **browser**: Performs browser actions on the confidante app.
