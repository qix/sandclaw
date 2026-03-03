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
  port: 3000,
});
