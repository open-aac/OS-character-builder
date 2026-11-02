import { defineConfig } from 'vitest/config';

/** Resolve workspace packages from their TypeScript source (the "source" export condition). */
export default defineConfig({
  resolve: { conditions: ['source', 'module', 'import', 'default'] },
  ssr: { resolve: { conditions: ['source', 'module', 'import', 'node', 'default'] } },
});
