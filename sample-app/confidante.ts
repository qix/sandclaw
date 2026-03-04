/**
 * Sample Sandclaw Confidante entry point.
 *
 * Run with:
 *   npx tsx sample-app/confidante.ts
 */
import { startConfidante } from '@sandclaw/confidante';
import { plugins } from './plugins';

startConfidante({
  plugins,
  config: {
    apiBaseUrl: 'http://localhost:3000',
  },
});
