/**
 * Standalone server.
 *
 *   PORT=8787 HOST=0.0.0.0 CORS_ORIGIN='*' pnpm serve
 */
import { createServer } from 'node:http';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createApp } from './app.js';

const port = Number(process.env['PORT'] ?? 8787);
const host = process.env['HOST'] ?? '127.0.0.1';
const cors = process.env['CORS_ORIGIN'];
const previewUser = process.env['PREVIEW_USER'];
const previewPass = process.env['PREVIEW_PASS'];

if ((previewUser && !previewPass) || (!previewUser && previewPass)) {
  console.warn('preview auth disabled: set both PREVIEW_USER and PREVIEW_PASS to enable basic auth');
}

// Serve the built editor (packages/editor/dist) if present, or from STATIC_DIR.
const staticDir = process.env['STATIC_DIR'] ?? fileURLToPath(new URL('../../editor/dist', import.meta.url));

const server = createServer(
  createApp({
    staticDir: existsSync(staticDir) ? staticDir : undefined,
    corsOrigin: cors === undefined ? '*' : cors === '' ? null : cors,
    basicAuth: previewUser && previewPass ? { username: previewUser, password: previewPass } : undefined,
  }),
);
server.listen(port, host, () => {
  console.log(`openaac-avatar server on http://${host}:${port}`);
  console.log(`  try: http://${host}:${port}/render.svg?preset=waving&body=0.5&framing=upper&size=300`);
});
for (const sig of ['SIGINT', 'SIGTERM'] as const) process.on(sig, () => server.close(() => process.exit(0)));
