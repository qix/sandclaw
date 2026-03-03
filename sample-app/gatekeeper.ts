/**
 * Sample Sandclaw Gatekeeper entry point.
 *
 * Run with:
 *   npx tsx sample-app/gatekeeper.ts
 */
import { startGatekeeper } from '@sandclaw/gatekeeper';
import { whatsappPlugin } from '@sandclaw/whatsapp-plugin';
import { createObsidianPlugin } from '@sandclaw/obsidian-plugin';
import { createGmailPlugin } from '@sandclaw/gmail-plugin';
import { createBrowserPlugin } from '@sandclaw/browser-plugin';

const obsidianPlugin = createObsidianPlugin({
  vaultRoot: process.env.OBSIDIAN_VAULT_ROOT || '~/obsidian',
});

const gmailPlugin = createGmailPlugin({
  clientId: process.env.GMAIL_CLIENT_ID || '',
  clientSecret: process.env.GMAIL_CLIENT_SECRET || '',
  refreshToken: process.env.GMAIL_REFRESH_TOKEN || '',
  userEmail: process.env.GMAIL_USER_EMAIL || '',
});

const browserPlugin = createBrowserPlugin();

startGatekeeper({
  plugins: [whatsappPlugin, obsidianPlugin, gmailPlugin, browserPlugin],
  dbPath: './sample-app/data/db.sqlite',
  port: 3000,
});
