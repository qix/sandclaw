/**
 * Central plugin list shared by gatekeeper, muteworker, and confidante entry points.
 */
import path from 'path';
import type { GatekeeperPlugin } from '@sandclaw/gatekeeper-plugin-api';
import type { MuteworkerPlugin } from '@sandclaw/muteworker-plugin-api';
import type { ConfidantePlugin } from '@sandclaw/confidante-plugin-api';
import { buildWhatsappPlugin } from '@sandclaw/whatsapp-plugin';
import { buildTelegramPlugin } from '@sandclaw/telegram-plugin';
import { createObsidianPlugin } from '@sandclaw/obsidian-plugin';
import { createGmailPlugin } from '@sandclaw/gmail-plugin';
import { createBrowserPlugin } from '@sandclaw/browser-plugin';
import { createPromptsPlugin } from '@sandclaw/prompts-plugin';
import { createMemoryPlugin } from '@sandclaw/memory-plugin';
import { createGoogleMapsPlugin } from '@sandclaw/google-maps-plugin';
import { createWebSearchPlugin } from '@sandclaw/web-search-plugin';
import { buildChatPlugin } from '@sandclaw/chat-plugin';
import { createGithubPlugin } from '@sandclaw/github-plugin';
import { createBuilderPlugin } from '@sandclaw/builder-plugin';

export type SandclawPlugin = GatekeeperPlugin & MuteworkerPlugin & Partial<ConfidantePlugin>;

export const plugins: SandclawPlugin[] = [
  buildWhatsappPlugin({
    operatorJids: [
      // Add trusted operator JIDs here, e.g. '27821234567@s.whatsapp.net'
    ],
  }),
  buildTelegramPlugin({
    botToken: process.env.TELEGRAM_BOT_TOKEN,
    operatorChatIds: [
      // Add trusted operator chat IDs here, e.g. '123456789'
    ],
  }),
  createObsidianPlugin({
    vaultRoot: process.env.OBSIDIAN_VAULT_ROOT || '~/obsidian',
  }),
  createGmailPlugin({
    clientId: process.env.GMAIL_CLIENT_ID || '',
    clientSecret: process.env.GMAIL_CLIENT_SECRET || '',
    refreshToken: process.env.GMAIL_REFRESH_TOKEN || '',
    userEmail: process.env.GMAIL_USER_EMAIL || '',
  }),
  createBrowserPlugin(),
  createPromptsPlugin({ promptsDir: path.join(__dirname, 'prompts') }),
  createMemoryPlugin({ memoryDir: path.join(__dirname, 'memory') }),
  createGoogleMapsPlugin(),
  createWebSearchPlugin({ braveApiKey: process.env.BRAVE_API_KEY || '' }),
  buildChatPlugin(),
  createGithubPlugin(),
  createBuilderPlugin({
    repo: process.env.BUILDER_REPO || '',
    workDir: process.env.BUILDER_WORK_DIR || '/tmp/builder-workdir',
    branch: process.env.BUILDER_BRANCH || 'main',
  }),
];
