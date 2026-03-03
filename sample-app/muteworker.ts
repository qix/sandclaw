/**
 * Sample Sandclaw Muteworker entry point.
 *
 * Run with:
 *   npx tsx sample-app/muteworker.ts
 */
import path from 'path';
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
  promptsDir: path.join(__dirname, 'prompts'),
  memoryDir: path.join(__dirname, 'memory'),
});
