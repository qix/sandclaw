<p align="center">
  <img src="assets/sandclaw-versus-robot.jpg" alt="Sandclaw" width="400" />
</p>

<h1 align="center">Sandclaw</h1>

<p align="center">A human-in-the-loop safety framework for AI agents</p>

---

Sand**claw** is a personal agent designed for safety first.

The core safety mechanism is a split into three three parts:

- **Muteworker** — does the thinking, all the data, but cannot speak to the outside world.
- **Gatekeeper** — the web UI and API that holds the keys to the outside world.
- **Confidante** — trusted worker can run agents on specific trusted websites

While the Muteworker is exposed to content from the internet, prompt injections cannot expose any secrets or do any damage. The Muteworker is still able to produce emails, messagers, and request actions be taken on the internet... but each of those still needs to step through the Gatekeeper before they take affect.

The Confidante is an agent that is intended to run with secrets, but the scope of the public internet that it is exposed to is limited.

## Getting Started

> [!WARNING]
> This is a _very early_ release and work in progress, it should start up with the chat plugin, but some of the other plugins, especially the builder, will require tweaking on your end to get working.

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

Sandclaw has a minimal core, and most of the logic is implemented by plugins. Each plugin can add UI panels, API routes, database tables, and agent tools. For personal use you should be generating your own local plugins that do exactly what you need.

### Built-in plugins

| Plugin                         | Description                                  |
| ------------------------------ | -------------------------------------------- |
| `@sandclaw/memory-plugin`      | Persistent agent memory                      |
| `@sandclaw/prompts-plugin`     | Handles system prompts                       |
| `@sandclaw/chat-plugin`        | Chat interface for talking to your agent     |
| `@sandclaw/web-search-plugin`  | Web search via Brave API                     |
| `@sandclaw/http-plugin`        | Allow-listed HTTP requests for the muteworker |
| `@sandclaw/browser-plugin`     | Browser automation (runs on the Confidante)  |
| `@sandclaw/github-plugin`      | Create PRs, download code, manage repos      |
| `@sandclaw/gmail-plugin`       | Read and send Gmail messages                 |
| `@sandclaw/whatsapp-plugin`    | Send and receive WhatsApp messages           |
| `@sandclaw/telegram-plugin`    | Telegram bot integration                     |
| `@sandclaw/obsidian-plugin`    | Search, read, and write Obsidian vault notes |
| `@sandclaw/google-maps-plugin` | Google Maps lookups                          |
| `@sandclaw/builder-plugin`     | Code generation for your sandclaw            |

Plugins are configured in `plugins.ts`. Enable or disable them by adding or removing them from the array.

## Project Structure

```
your-project/
├── gatekeeper.ts     # Web UI + approval API
├── muteworker.ts      # Safe agent (no internet)
├── confidante.ts      # Dangerous agent (has credentials)
├── config.ts          # Ports, model provider, paths, plugins
├── prompts/           # Agent personality and instructions
│   ├── IDENTITY.md
│   ├── SOUL.md
│   ├── SYSTEM.md
│   └── USER.md
├── plugins/           # Custom plugins for your agent
├── memory/            # Persistent agent memory
└── data/              # SQLite database
```

## License

MIT
