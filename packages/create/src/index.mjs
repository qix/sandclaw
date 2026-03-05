#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import readline from 'node:readline';

const templates = {
  'package.json': (name) => JSON.stringify(
    {
      name,
      version: '0.1.0',
      private: true,
      scripts: {
        gatekeeper: 'tsx gatekeeper.ts',
        muteworker: 'tsx muteworker.ts',
        confidante: 'tsx confidante.ts',
      },
      dependencies: {
        '@sandclaw/gatekeeper': 'latest',
        '@sandclaw/muteworker': 'latest',
        '@sandclaw/confidante': 'latest',
        '@sandclaw/gatekeeper-plugin-api': 'latest',
        '@sandclaw/muteworker-plugin-api': 'latest',
        '@sandclaw/confidante-plugin-api': 'latest',
        '@sandclaw/chat-plugin': 'latest',
        '@sandclaw/prompts-plugin': 'latest',
        '@sandclaw/memory-plugin': 'latest',
        '@sandclaw/web-search-plugin': 'latest',
        '@sandclaw/whatsapp-plugin': 'latest',
        '@sandclaw/telegram-plugin': 'latest',
        '@sandclaw/obsidian-plugin': 'latest',
        '@sandclaw/gmail-plugin': 'latest',
        '@sandclaw/browser-plugin': 'latest',
        '@sandclaw/google-maps-plugin': 'latest',
        '@sandclaw/github-plugin': 'latest',
        '@sandclaw/builder-plugin': 'latest',
      },
      devDependencies: {
        tsx: 'latest',
        typescript: 'latest',
      },
    },
    null,
    2,
  ),

  'gatekeeper.ts': () => `\
import { startGatekeeper } from '@sandclaw/gatekeeper';
import { plugins } from './plugins';

startGatekeeper({
  plugins,
  dbPath: './data/db.sqlite',
  port: 3000,
});
`,

  'muteworker.ts': () => `\
import { startMuteworker } from '@sandclaw/muteworker';
import { plugins } from './plugins';

startMuteworker({
  plugins,
  config: {
    apiBaseUrl: 'http://localhost:3000',
    modelProvider: 'anthropic',
    modelId: 'claude-sonnet-4-6',
    verificationUiUrl: 'http://localhost:3000',
  },
});
`,

  'confidante.ts': () => `\
import { parseArgs } from 'node:util';
import { confidanteScript } from '@sandclaw/confidante';
import { plugins } from './plugins';

const { values } = parseArgs({
  options: {
    replay: { type: 'string' },
  },
  strict: false,
});

const replay = values.replay ? parseInt(values.replay, 10) : undefined;
if (values.replay !== undefined && (replay == null || isNaN(replay))) {
  console.error('Error: --replay requires a numeric job ID.');
  process.exit(1);
}

confidanteScript({
  plugins,
  config: {
    apiBaseUrl: 'http://localhost:3000',
  },
  replayJobId: replay,
});
`,

  'plugins.ts': () => `\
import path from 'path';
import { fileURLToPath } from 'url';
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
// import { createBuilderPlugin } from '@sandclaw/builder-plugin';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export type SandclawPlugin = GatekeeperPlugin & MuteworkerPlugin & Partial<ConfidantePlugin>;

export const plugins: SandclawPlugin[] = [
  // Core plugins (work out of the box)
  buildChatPlugin(),
  createPromptsPlugin({ promptsDir: path.join(__dirname, 'prompts') }),
  createMemoryPlugin({ memoryDir: path.join(__dirname, 'memory') }),
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

  '.gitignore': () => `\
node_modules/
data/
memory/
*.js
*.d.ts
*.map
`,

  '.env': () => `\
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

  'tsconfig.json': () => JSON.stringify(
    {
      compilerOptions: {
        target: 'ES2022',
        module: 'ES2022',
        moduleResolution: 'bundler',
        esModuleInterop: true,
        strict: true,
        skipLibCheck: true,
        outDir: 'dist',
        declaration: true,
        jsx: 'react-jsx',
      },
      include: ['*.ts'],
    },
    null,
    2,
  ),

  'prompts/SYSTEM.md': () => `\
# SYSTEM.md - Core system behaviours

## Tools

If any tool responds with a verification url, that verification url should be added to the reply to the user.

Make sure you are clear that no change has been made yet if it still requires verification.
`,

  'prompts/IDENTITY.md': () => `\
# IDENTITY.md - Who Am I?

- **Name:** (your agent's name)
- **Creature:** A helpful AI assistant
`,

  'prompts/SOUL.md': () => `\
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

  'prompts/USER.md': () => `\
# USER.md - About Your Human

- **Name:** (your name)
- **Timezone:** (your timezone)
`,

  'prompts/HEARTBEAT.md': () => `\
# HEARTBEAT.md

## Reporting

Heartbeat turns should usually end with NO_REPLY.

## Every heartbeat

- Update memory/heartbeat-state.json with the current timestamp
`,
};

function ask(question) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

async function main() {
  let projectName = process.argv[2];

  if (!projectName) {
    projectName = await ask('Project name: ');
  }

  if (!projectName) {
    console.error('Please provide a project name.');
    process.exit(1);
  }

  const projectDir = path.resolve(projectName);

  if (fs.existsSync(projectDir)) {
    console.error(`Directory "${projectName}" already exists.`);
    process.exit(1);
  }

  console.log(`\nCreating Sandclaw project in ${projectDir}...\n`);

  // Create directories
  fs.mkdirSync(projectDir, { recursive: true });
  fs.mkdirSync(path.join(projectDir, 'prompts'), { recursive: true });
  fs.mkdirSync(path.join(projectDir, 'memory'), { recursive: true });
  fs.mkdirSync(path.join(projectDir, 'data'), { recursive: true });

  // Write template files
  for (const [filePath, render] of Object.entries(templates)) {
    const fullPath = path.join(projectDir, filePath);
    fs.writeFileSync(fullPath, render(projectName));
  }

  // Install dependencies
  console.log('Installing dependencies...\n');
  try {
    execSync('npm install', { cwd: projectDir, stdio: 'inherit' });
  } catch {
    console.log('\nnpm install failed. You can run it manually later.');
  }

  console.log(`
Done! Your Sandclaw project is ready.

  cd ${projectName}

  # Edit .env with your API keys, then:
  npx tsx gatekeeper.ts    # Start the gatekeeper (web UI on port 3000)
  npx tsx muteworker.ts    # Start the safe agent
  npx tsx confidante.ts    # Start the dangerous agent

  # Customize your agent in prompts/ and plugins in plugins.ts
`);
}

main();
