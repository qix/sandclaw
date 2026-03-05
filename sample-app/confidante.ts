/**
 * Sample Sandclaw Confidante entry point.
 *
 * Run with:
 *   npx tsx sample-app/confidante.ts
 *
 * Replay a specific job:
 *   npx tsx sample-app/confidante.ts --replay <job-id>
 */
import { parseArgs } from 'node:util';
import { confidanteScript } from '@sandclaw/confidante';
import { plugins } from './plugins';

const { values } = parseArgs({
  options: {
    replay: { type: 'string' },
  },
  strict: false,
});

const replay = values.replay ? parseInt(values.replay, 10) : undefined;
if (values.replay !== undefined && (replay == null || isNaN(replay))) {
  console.error('Error: --replay requires a numeric job ID.');
  process.exit(1);
}

confidanteScript({
  plugins,
  config: {
    apiBaseUrl: 'http://localhost:3000',
  },
  replay,
});
