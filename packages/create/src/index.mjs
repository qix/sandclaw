#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { exec } from "node:child_process";
import { promisify } from "node:util";

const execAsync = promisify(exec);
import * as p from "@clack/prompts";
import pc from "picocolors";
import { MODELS } from "./models.mjs";

function getSystemTimezone() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch {
    return "UTC";
  }
}

function buildTemplates({
  projectName,
  userName,
  botName,
  timezone,
  modelProvider,
  modelId,
}) {
  return {
    "package.json": JSON.stringify(
      {
        name: projectName,
        version: "0.1.0",
        private: true,
        scripts: {
          gatekeeper: "tsx --env-file .env gatekeeper.ts",
          muteworker: "tsx --env-file .env muteworker.ts",
          confidante: "tsx --env-file .env confidante.ts",
          start:
            "concurrently --names gatekeeper,muteworker,confidante " +
            '"npm run gatekeeper" "sleep 1; npm run muteworker" "sleep 1; npm run confidante"',
        },
        dependencies: {
          "@sandclaw/browser-plugin": "latest",
          "@sandclaw/pi-builder-plugin": "latest",
          "@sandclaw/claude-builder-plugin": "latest",
          "@sandclaw/chat-plugin": "latest",
          "@sandclaw/confidante": "latest",
          "@sandclaw/confidante-plugin-api": "latest",
          "@sandclaw/gatekeeper": "latest",
          "@sandclaw/gatekeeper-plugin-api": "latest",
          "@sandclaw/github-plugin": "latest",
          "@sandclaw/gmail-plugin": "latest",
          "@sandclaw/google-maps-plugin": "latest",
          "@sandclaw/memory-plugin": "latest",
          "@sandclaw/muteworker": "latest",
          "@sandclaw/muteworker-plugin-api": "latest",
          "@sandclaw/obsidian-plugin": "latest",
          "@sandclaw/prompts-plugin": "latest",
          "@sandclaw/telegram-plugin": "latest",
          "@sandclaw/web-search-plugin": "latest",
          "@sandclaw/whatsapp-plugin": "latest",
          concurrently: "^9.2.1",
        },
        devDependencies: {
          tsx: "latest",
          typescript: "latest",
        },
      },
      null,
      2,
    ),

    "gatekeeper.ts": `\
import { startGatekeeper } from "@sandclaw/gatekeeper";
import { plugins } from "./plugins";
import { gatekeeperConfig } from "./config";

startGatekeeper({
  plugins,
  config: gatekeeperConfig,
});
`,

    "muteworker.ts": `\
import { startMuteworker } from "@sandclaw/muteworker";
import { muteworkerConfig } from "./config";
import { plugins } from "./plugins";

startMuteworker({
  plugins,
  config: muteworkerConfig,
});
`,

    "confidante.ts": `\
import { parseArgs } from "node:util";
import { confidanteScript } from "@sandclaw/confidante";
import { plugins } from "./plugins";
import { confidanteConfig } from "./config";

const { values } = parseArgs({
  options: {
    replay: { type: "string" },
  },
  strict: false,
});

const replay =
  typeof values.replay === "string" ? parseInt(values.replay, 10) : undefined;
if (values.replay !== undefined && (replay == null || isNaN(replay))) {
  console.error("Error: --replay requires a numeric job ID.");
  process.exit(1);
}

confidanteScript({
  plugins,
  config: confidanteConfig,
  replayJobId: replay,
});
`,

    "config.ts": `\
import { fileURLToPath } from "url";
import path from "path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const gatekeeperPort = 3000;

const shared = {
  /* Pi agent model configuration */
  modelProvider: "${modelProvider}",
  modelId: "${modelId}",

  /* Address that the muteworker and confidante instances use to talk to gatekeeper. Should be localhost if running on the same machine. */
  gatekeeperInternalUrl: \`http://localhost:\${gatekeeperPort}\`,

  /* Address that the gatekeeper instance is available from remote. Recommend using tailscale, etc. */
  gatekeeperExternalUrl: \`http://localhost:\${gatekeeperPort}\`,
};

export const gatekeeperConfig = {
  ...shared,

  /* Host/port to run gatekeeper on */
  gatekeeperHost: "127.0.0.1",
  gatekeeperPort,

  /* Local storage paths */
  dbPath: path.join(__dirname, "data/db.sqlite"),
  memoryDir: path.join(__dirname, "memory"),
  promptsDir: path.join(__dirname, "prompts"),
};

export const muteworkerConfig = {
  ...shared,
};

export const confidanteConfig = {
  ...shared,
};

export const config = gatekeeperConfig;
`,

    "plugins.ts": `\
import type { GatekeeperPlugin } from '@sandclaw/gatekeeper-plugin-api';
import type { MuteworkerPlugin } from '@sandclaw/muteworker-plugin-api';
import type { ConfidantePlugin } from '@sandclaw/confidante-plugin-api';
import { buildChatPlugin } from '@sandclaw/chat-plugin';
import { createPromptsPlugin } from '@sandclaw/prompts-plugin';
import { createMemoryPlugin } from '@sandclaw/memory-plugin';
import { createWebSearchPlugin } from '@sandclaw/web-search-plugin';
import { createBrowserPlugin } from '@sandclaw/browser-plugin';
import { createGithubPlugin } from '@sandclaw/github-plugin';
import { createGoogleMapsPlugin } from '@sandclaw/google-maps-plugin';
// import { buildWhatsappPlugin } from '@sandclaw/whatsapp-plugin';
// import { buildTelegramPlugin } from '@sandclaw/telegram-plugin';
// import { createObsidianPlugin } from '@sandclaw/obsidian-plugin';
// import { createGmailPlugin } from '@sandclaw/gmail-plugin';
// import { createBuilderPlugin } from '@sandclaw/pi-builder-plugin';
// import { createClaudeBuilderPlugin } from '@sandclaw/claude-builder-plugin';
import { config } from './config';


export type SandclawPlugin = GatekeeperPlugin & MuteworkerPlugin & Partial<ConfidantePlugin>;

export const plugins: SandclawPlugin[] = [
  // Core plugins (work out of the box)
  buildChatPlugin(),
  createPromptsPlugin({ promptsDir: config.promptsDir }),
  createMemoryPlugin({ memoryDir: config.memoryDir }),
  createBrowserPlugin(),
  createGithubPlugin(),
  createGoogleMapsPlugin(),

  // Needs BRAVE_API_KEY env var
  createWebSearchPlugin({ braveApiKey: process.env.BRAVE_API_KEY || '' }),

  // Uncomment and configure as needed:
  //
  // buildWhatsappPlugin({
  //   operatorJids: ['27821234567@s.whatsapp.net'],
  // }),
  //
  // buildTelegramPlugin({
  //   botToken: process.env.TELEGRAM_BOT_TOKEN,
  //   operatorChatIds: [],
  // }),
  //
  // createObsidianPlugin({
  //   vaultRoot: process.env.OBSIDIAN_VAULT_ROOT || '~/obsidian',
  // }),
  //
  // createGmailPlugin({
  //   clientId: process.env.GMAIL_CLIENT_ID || '',
  //   clientSecret: process.env.GMAIL_CLIENT_SECRET || '',
  //   refreshToken: process.env.GMAIL_REFRESH_TOKEN || '',
  //   userEmail: process.env.GMAIL_USER_EMAIL || '',
  // }),
  //
  // createBuilderPlugin({
  //   repo: process.env.BUILDER_REPO || '',
  //   workDir: process.env.BUILDER_WORK_DIR || '/tmp/builder-workdir',
  //   branch: process.env.BUILDER_BRANCH || 'main',
  // }),
];
`,

    ".gitignore": `\
node_modules/
data/
memory/
*.js
*.d.ts
*.map
`,

    ".env": `\
# Anthropic API key (required for the AI agent)
ANTHROPIC_API_KEY=

# Brave Search API key (for web-search-plugin)
BRAVE_API_KEY=

# Telegram (uncomment telegram plugin in plugins.ts)
# TELEGRAM_BOT_TOKEN=

# Gmail (uncomment gmail plugin in plugins.ts)
# GMAIL_CLIENT_ID=
# GMAIL_CLIENT_SECRET=
# GMAIL_REFRESH_TOKEN=
# GMAIL_USER_EMAIL=

# Obsidian (uncomment obsidian plugin in plugins.ts)
# OBSIDIAN_VAULT_ROOT=~/obsidian

# Builder (uncomment builder plugin in plugins.ts)
# BUILDER_REPO=
# BUILDER_WORK_DIR=/tmp/builder-workdir
# BUILDER_BRANCH=main
`,

    "tsconfig.json": JSON.stringify(
      {
        compilerOptions: {
          target: "ES2022",
          module: "ES2022",
          moduleResolution: "bundler",
          esModuleInterop: true,
          strict: true,
          skipLibCheck: true,
          outDir: "dist",
          declaration: true,
          jsx: "react-jsx",
        },
        include: ["*.ts"],
      },
      null,
      2,
    ),

    "prompts/SYSTEM.md": `\
# SYSTEM.md - Core system behaviours

## Tools

If any tool responds with a verification url, that verification url should be added to the reply to the user.

Make sure you are clear that no change has been made yet if it still requires verification.
`,

    "prompts/IDENTITY.md": `\
# IDENTITY.md - Who Am I?

- **Name:** ${botName}
- **Creature:** A helpful AI assistant
`,

    "prompts/SOUL.md": `\
# SOUL.md - Who You Are

You are a helpful assistant.

## Core Truths

- Lead with the answer.
- Be direct and concise.
- Be resourceful before asking.
- Earn trust through competence.

## Boundaries

- Private things stay private.
- When in doubt, ask before acting externally.
- Send complete replies.

## Style

- Keep information tight.
`,

    "prompts/USER.md": `\
# USER.md - About Your Human

- **Name:** ${userName}
- **Timezone:** ${timezone}
`,

    "prompts/HEARTBEAT.md": `\
# HEARTBEAT.md

## Reporting

Heartbeat turns should usually end with NO_REPLY.

## Every heartbeat

- Update memory/heartbeat-state.json with the current timestamp
`,
  };
}

async function main() {
  p.intro(pc.bgCyan(pc.black(" create-sandclaw ")));

  const detectedTimezone = getSystemTimezone();

  const answers = await p.group(
    {
      projectName: () =>
        p.text({
          message: "Project name",
          placeholder: "sandclaw",
          defaultValue: "sandclaw",
          validate: (value) => {
            if (!value) return "Project name is required";
            if (fs.existsSync(path.resolve(value)))
              return `Directory "${value}" already exists`;
          },
        }),
      userName: () =>
        p.text({
          message: "What's your name?",
          placeholder: "Your name",
          validate: (value) => {
            if (!value) return "Your name is required";
          },
        }),
      botName: () =>
        p.text({
          message: "What should your bot be called?",
          placeholder: "Sandclaw",
          defaultValue: "Sandclaw",
        }),
      timezone: () =>
        p.confirm({
          message: `Is ${pc.cyan(detectedTimezone)} your timezone?`,
          initialValue: true,
        }),
      timezoneCustom: ({ results }) => {
        if (results.timezone === true) return;
        return p.text({
          message: "Enter your timezone",
          placeholder: "America/New_York",
          validate: (value) => {
            if (!value) return "Timezone is required";
          },
        });
      },
      modelProvider: () =>
        p.select({
          message: "Select a model provider",
          options: [
            ...Object.keys(MODELS).map((provider) => ({
              value: provider,
              label: provider,
            })),
            { value: "__other__", label: "Other" },
            { value: "", label: "Skip" },
          ],
        }),
      modelProviderCustom: ({ results }) => {
        if (results.modelProvider !== "__other__") return;
        return p.text({
          message: "Enter model provider name",
          validate: (value) => {
            if (!value) return "Provider name is required";
          },
        });
      },
      modelId: ({ results }) => {
        if (results.modelProvider === "") return;
        if (results.modelProvider === "__other__") {
          return p.text({
            message: "Enter model ID",
            validate: (value) => {
              if (!value) return "Model ID is required";
            },
          });
        }
        const models = MODELS[results.modelProvider] || [];
        return p.select({
          message: "Select a model",
          options: [
            ...models.map((model) => ({
              value: model,
              label: model,
            })),
            { value: "__other__", label: "Other" },
            { value: "", label: "Skip" },
          ],
        });
      },
      modelIdCustom: ({ results }) => {
        if (results.modelId !== "__other__") return;
        return p.text({
          message: "Enter model ID",
          validate: (value) => {
            if (!value) return "Model ID is required";
          },
        });
      },
    },
    {
      onCancel: () => {
        p.cancel("Setup cancelled.");
        process.exit(0);
      },
    },
  );

  const timezone =
    answers.timezone === true ? detectedTimezone : answers.timezoneCustom;

  const modelProvider =
    answers.modelProvider === "__other__"
      ? answers.modelProviderCustom
      : answers.modelProvider;
  const modelId =
    answers.modelId === "__other__"
      ? answers.modelIdCustom
      : answers.modelId || "";

  const projectDir = path.resolve(answers.projectName);
  const templates = buildTemplates({
    projectName: answers.projectName,
    userName: answers.userName,
    botName: answers.botName,
    timezone,
    modelProvider,
    modelId,
  });

  // Create directories
  fs.mkdirSync(projectDir, { recursive: true });
  fs.mkdirSync(path.join(projectDir, "prompts"), { recursive: true });
  fs.mkdirSync(path.join(projectDir, "memory"), { recursive: true });
  fs.mkdirSync(path.join(projectDir, "data"), { recursive: true });

  // Write template files
  for (const [filePath, content] of Object.entries(templates)) {
    fs.writeFileSync(path.join(projectDir, filePath), content);
  }

  // Install dependencies
  const s = p.spinner();
  s.start("Installing dependencies");
  try {
    await execAsync("npm install", { cwd: projectDir });
    s.stop("Dependencies installed");
  } catch {
    s.stop("npm install failed — you can run it manually later");
  }

  p.note(
    [
      `cd ${answers.projectName}`,
      "",
      "# Edit .env with your API keys and config.ts as needed, then:",
      "npm start                # Start all services",
      "",
      "# Or run individually:",
      "npx tsx gatekeeper.ts    # Web UI on port 3000",
      "npx tsx muteworker.ts    # Safe agent",
      "npx tsx confidante.ts    # Dangerous agent",
      "",
      "# Customize your agent in prompts/ and plugins.ts",
    ].join("\n"),
    "Next steps",
  );

  p.outro(pc.green("Your Sandclaw project is ready!"));
}

main();
