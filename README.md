<p align="center">
  <img src="assets/sandclaw-versus-robot.jpg" alt="Sandclaw" width="600" />
</p>

<h1 align="center">Sandclaw</h1>

<p align="center">A human-in-the-loop safety framework for AI agents</p>

---

Sand**claw** is a safety first personal agent.

Sandclaw enforces this with a split into three parts:

- **Muteworker** — does the thinking, all the data, but cannot speak to the outside world.
- **Gatekeeper** — the web UI that holds the keys to the outside world.
- **Confidante** — trusted worker can run agents on specific trusted websites

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

By default the Gatekeeper UI will be available at `http://localhost:3000`.

## Plugins

Sandclaw has a minimal core, and most of the logic is implemented by plugins. Each plugin can add UI panels, API routes, database tables, and agent tools.

### Built-in plugins

| Plugin                         | Description                                  |
| ------------------------------ | -------------------------------------------- |
| `@sandclaw/memory-plugin`      | Persistent agent memory                      |
| `@sandclaw/prompts-plugin`     | Handles system prompts                       |
| `@sandclaw/chat-plugin`        | Chat interface for talking to your agent     |
| `@sandclaw/web-search-plugin`  | Web search via Brave API                     |
| `@sandclaw/browser-plugin`     | Browser automation (runs on the Confidante)  |
| `@sandclaw/github-plugin`      | Create PRs, download code, manage repos      |
| `@sandclaw/gmail-plugin`       | Read and send Gmail messages                 |
| `@sandclaw/whatsapp-plugin`    | Send and receive WhatsApp messages           |
| `@sandclaw/telegram-plugin`    | Telegram bot integration                     |
| `@sandclaw/obsidian-plugin`    | Search, read, and write Obsidian vault notes |
| `@sandclaw/google-maps-plugin` | Google Maps lookups                          |
| `@sandclaw/builder-plugin`     | Code generation and deployment               |

Plugins are configured in `plugins.ts`. Enable or disable them by adding or removing them from the array.

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
