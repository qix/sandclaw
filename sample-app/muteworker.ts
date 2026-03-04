/**
 * Sample Sandclaw Muteworker entry point.
 *
 * Run with:
 *   npx tsx sample-app/muteworker.ts
 */
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
