/**
 * Standalone proxy runner for testing.
 * Usage: npx tsx src/test-proxy.ts
 *
 * Starts the proxy and keeps it alive until Ctrl+C.
 * Test with:  curl http://127.0.0.1:<port>/v1/models
 */
import { startProxy } from './proxy.js';

async function main() {
  const proxy = await startProxy();
  console.log(`Proxy listening on http://127.0.0.1:${proxy.port}`);
  console.log(`Test:  curl http://127.0.0.1:${proxy.port}/v1/models`);

  process.on('SIGINT', () => {
    console.log('\nShutting down proxy…');
    proxy.close();
    process.exit(0);
  });

  process.on('SIGTERM', () => {
    proxy.close();
    process.exit(0);
  });

  // Keep the process alive
  setInterval(() => {}, 60_000);
}

main().catch((err) => {
  console.error('Failed:', err);
  process.exit(1);
});
