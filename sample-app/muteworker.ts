/**
 * Sample Sandclaw Muteworker entry point.
 *
 * Run with:
 *   npx tsx sample-app/muteworker.ts
 */
import path from 'path';
import { startMuteworker } from '@sandclaw/muteworker';
import { whatsappMuteworkerPlugin } from '@sandclaw/whatsapp-plugin';
import { obsidianMuteworkerPlugin } from '@sandclaw/obsidian-plugin';
import { gmailMuteworkerPlugin } from '@sandclaw/gmail-plugin';
import { browserMuteworkerPlugin } from '@sandclaw/browser-plugin';

startMuteworker({
  plugins: [
    whatsappMuteworkerPlugin,
    obsidianMuteworkerPlugin,
    gmailMuteworkerPlugin,
    browserMuteworkerPlugin,
  ],
  config: {
    apiBaseUrl: 'http://localhost:3000',
    modelProvider: 'anthropic',
    modelId: 'claude-sonnet-4-6',
    verificationUiUrl: 'http://localhost:3000',
  },
  promptsDir: path.join(__dirname, 'prompts'),
  memoryDir: path.join(__dirname, 'memory'),
});
