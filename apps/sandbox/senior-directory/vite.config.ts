/**
 * Builds the React source into a Town Square creation folder.
 *
 * The output in `../dev-creations/senior-directory/` is a normal creation: the sandbox
 * loads it at startup through the same validator a resident's upload hits
 * (see `apps/sandbox/src/examples.ts`). Every setting below exists to keep
 * that output publishable.
 */

import { fileURLToPath } from 'node:url'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

const OUT_DIR = fileURLToPath(new URL('../dev-creations/senior-directory', import.meta.url))

export default defineConfig({
  plugins: [react()],

  // Creations are served from their own origin, but relative URLs keep the
  // bundle working wherever the sandbox mounts it.
  base: './',

  build: {
    outDir: OUT_DIR,
    emptyOutDir: true,

    // The bundle validator rejects minified code as an error, not a warning:
    // review depends on a person being able to read what runs.
    minify: false,

    // No source maps for now: they double the bundle size and the sandbox
    // already serves readable code.
    sourcemap: false,

    // Vite's preload polyfill injects a script the reviewer did not write.
    // Module scripts are supported everywhere Town Square runs.
    modulePreload: { polyfill: false },

    rollupOptions: {
      // Never bundle the SDK. Town Square injects an import map at serve
      // time that resolves this bare specifier to the real guest runtime, and
      // the validator rejects a vendored copy.
      external: ['@townsquare/sdk'],
      output: {
        // Keep the content hash. The sandbox serves bundle files with
        // `Cache-Control: immutable` for a year, so a fixed name like app.js
        // would leave browsers running the previous build after a rebuild.
        // index.html is served no-cache and points at the new hashed name.
        entryFileNames: 'app-[hash].js',
        chunkFileNames: '[name]-[hash].js',
        assetFileNames: '[name]-[hash][extname]',
      },
    },
  },
})
