/**
 * Central plugin list shared by gatekeeper and muteworker entry points.
 */
import type { GatekeeperPlugin } from '@sandclaw/gatekeeper-plugin-api';
import type { MuteworkerPlugin } from '@sandclaw/muteworker-plugin-api';
import { buildWhatsappPlugin } from '@sandclaw/whatsapp-plugin';
import { telegramPlugin } from '@sandclaw/telegram-plugin';
import { createObsidianPlugin } from '@sandclaw/obsidian-plugin';
import { createGmailPlugin } from '@sandclaw/gmail-plugin';
import { createBrowserPlugin } from '@sandclaw/browser-plugin';

export type SandclawPlugin = GatekeeperPlugin & MuteworkerPlugin;

export const plugins: SandclawPlugin[] = [
  buildWhatsappPlugin({
    operatorJids: [
      // Add trusted operator JIDs here, e.g. '27821234567@s.whatsapp.net'
    ],
  }),
  telegramPlugin,
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
];
