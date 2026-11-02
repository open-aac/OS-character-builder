/**
 * Standalone server.
 *
 *   PORT=8787 HOST=0.0.0.0 CORS_ORIGIN='*' pnpm serve
 */
import { createServer } from 'node:http';
import { createApp } from './app.js';

const port = Number(process.env['PORT'] ?? 8787);
const host = process.env['HOST'] ?? '127.0.0.1';
const cors = process.env['CORS_ORIGIN'];

const server = createServer(createApp({ corsOrigin: cors === undefined ? '*' : cors === '' ? null : cors }));
server.listen(port, host, () => {
  console.log(`openaac-avatar server on http://${host}:${port}`);
  console.log(`  try: http://${host}:${port}/render.svg?preset=waving&body=0.5&framing=upper&size=300`);
});
for (const sig of ['SIGINT', 'SIGTERM'] as const) process.on(sig, () => server.close(() => process.exit(0)));
