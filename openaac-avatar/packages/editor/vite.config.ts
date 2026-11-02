import { defineConfig } from 'vite';

/**
 * Builds a static site into dist/:
 *
 *   dist/
 *     index.html
 *     css/editor-[hash].css
 *     js/editor-[hash].js        the page's own code
 *     js/render-core-[hash].js   the shared render core (same code as the CLI and server)
 *     js/art-kit-[hash].js       the compiled artwork
 *     assets/favicon.svg
 *
 * Upload the whole folder to any static host. The hashes change when a file
 * changes, so browsers never use a stale copy.
 */
export default defineConfig({
  // Relative paths so the site works from any folder or sub-path.
  base: './',
  resolve: { conditions: ['source', 'module', 'browser', 'development|production'] },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    target: 'es2022',
    assetsDir: 'assets',
    rollupOptions: {
      output: {
        entryFileNames: 'js/editor-[hash].js',
        chunkFileNames: 'js/[name]-[hash].js',
        assetFileNames: (asset) =>
          (asset.names?.[0] ?? asset.name ?? '').endsWith('.css') ? 'css/editor-[hash][extname]' : 'assets/[name]-[hash][extname]',
        manualChunks(id: string) {
          if (id.includes('/core/src/kits/')) return 'art-kit';
          if (id.includes('/packages/core/')) return 'render-core';
          return undefined;
        },
      },
    },
  },
  server: { port: 5173 },
});
