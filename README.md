<p align="center">
  <img src="assets/sandclaw-versus-robot.jpg" alt="Sandclaw" width="600" />
</p>

<h1 align="center">Sandclaw</h1>

<p align="center">A human-in-the-loop safety framework for AI agents</p>

---

Every dangerous action your AI agent takes — sending a message, pushing code, making an API call — must be approved by a human before it executes.

Sandclaw enforces this by splitting work between two agents:

- **Muteworker** — does all the thinking, but has no credentials and no internet access. It submits actions as verification requests.
- **Confidante** — has credentials and internet access, but only executes jobs that a human has approved.
- **Gatekeeper** — the web UI that sits between them, where you review and approve actions.

```
                  ┌─────────────────┐
Incoming data ──► │   Muteworker    │ (no credentials, no internet)
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
                  └─────────────────┘
```

## Getting Started

```bash
npx @sandclaw/create
```

This scaffolds a new project with all three components, prompts for your model provider, and installs dependencies.

Then:

```bash
cd your-project

# Add your API keys
edit .env

# Start all three services
npm start
```

The Gatekeeper UI will be available at `http://localhost:3000`.

## Plugins

Sandclaw is built around plugins. Each plugin can add UI panels, API routes, database tables, and agent tools.

### Built-in plugins

| Plugin | Description |
|--------|-------------|
| `@sandclaw/chat-plugin` | Chat interface for talking to your agent |
| `@sandclaw/web-search-plugin` | Web search via Brave API |
| `@sandclaw/browser-plugin` | Browser automation via the Confidante |
| `@sandclaw/github-plugin` | Create PRs, download code, manage repos |
| `@sandclaw/gmail-plugin` | Read and send Gmail messages |
| `@sandclaw/whatsapp-plugin` | Send and receive WhatsApp messages |
| `@sandclaw/telegram-plugin` | Telegram bot integration |
| `@sandclaw/obsidian-plugin` | Search, read, and write Obsidian vault notes |
| `@sandclaw/google-maps-plugin` | Google Maps lookups |
| `@sandclaw/memory-plugin` | Persistent agent memory |
| `@sandclaw/prompts-plugin` | Editable system prompts |
| `@sandclaw/builder-plugin` | Code generation and deployment |

Plugins are configured in `plugins.ts`. Enable or disable them by adding or removing them from the array.

### Writing a plugin

```typescript
import { createGatekeeperPlugin, gatekeeperDeps } from '@sandclaw/gatekeeper-plugin-api';

export const myPlugin = createGatekeeperPlugin({
  id: 'my-plugin',
  registerGateway(env) {
    env.registerInit({
      deps: { routes: gatekeeperDeps.routes, db: gatekeeperDeps.db },
      init({ routes, db }) {
        routes.registerRoutes((app) => {
          app.get('/api/my-plugin/status', (c) => c.json({ ok: true }));
        });
      },
    });
  },
  migrations: async (knex) => {
    await knex.schema.createTable('my_table', (t) => {
      t.increments('id');
      t.text('data');
    });
  },
});
```

## Project Structure

```
your-project/
├── gatekeeper.ts     # Web UI + approval API
├── muteworker.ts      # Safe agent (no internet)
├── confidante.ts      # Dangerous agent (has credentials)
├── config.ts          # Ports, model provider, paths
├── plugins.ts         # Which plugins to enable
├── prompts/           # Agent personality and instructions
│   ├── IDENTITY.md
│   ├── SOUL.md
│   ├── SYSTEM.md
│   └── USER.md
├── memory/            # Persistent agent memory
└── data/              # SQLite database
```

## License

MIT
