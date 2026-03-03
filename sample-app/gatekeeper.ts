/**
 * Sample Sandclaw Gatekeeper entry point.
 *
 * Run with:
 *   npx tsx sample-app/gatekeeper.ts
 */
import { startGatekeeper } from '@sandclaw/gatekeeper';
import { whatsappPlugin } from '@sandclaw/whatsapp-plugin';

startGatekeeper({
  plugins: [whatsappPlugin],
  dbPath: './sample-app/data/db.sqlite',
  port: 3000,
});
