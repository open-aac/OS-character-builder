#!/usr/bin/env node
// Inside the repo, runs the TypeScript source (through tsx) so it always matches the current code.
// Without the source (e.g. a deployed copy), runs the built dist/main.js.
import { existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const source = join(here, '../src/main.ts');
let tsx = null;
try {
  tsx = import.meta.resolve('tsx');
} catch {
  /* tsx not installed: production copy */
}
if (existsSync(source) && tsx) {
  const r = spawnSync(process.execPath, ['--conditions=source', '--import', tsx, source, ...process.argv.slice(2)], { stdio: 'inherit' });
  process.exit(r.status ?? 1);
} else {
  await import(new URL('../dist/main.js', import.meta.url).href);
}
