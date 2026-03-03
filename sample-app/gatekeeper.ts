/**
 * Sample Sandclaw Gatekeeper entry point.
 *
 * Run with:
 *   npx tsx sample-app/gatekeeper.ts
 */
import { startGatekeeper } from '@sandclaw/gatekeeper';
import { plugins } from './plugins';

startGatekeeper({
  plugins,
  dbPath: './sample-app/data/db.sqlite',
  port: 3000,
});
