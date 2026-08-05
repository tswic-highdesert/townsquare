import { defineConfig } from 'vitest/config'
import { fileURLToPath } from 'node:url'

const r = (p: string) => fileURLToPath(new URL(p, import.meta.url))

export default defineConfig({
  resolve: {
    alias: {
      '@townsquare/manifest': r('./packages/manifest/src/index.ts'),
      '@townsquare/shared': r('./packages/shared/src/index.ts'),
      '@townsquare/tokens': r('./packages/tokens/src/index.ts'),
      '@townsquare/bundle': r('./packages/bundle/src/index.ts'),
      '@townsquare/sandbox': r('./packages/sandbox/src/index.ts'),
      '@townsquare/host': r('./packages/host/src/index.ts'),
      '@townsquare/sdk': r('./packages/sdk/src/index.ts'),
      '@townsquare/content': r('./packages/content/src/index.ts'),
      '@townsquare/feed': r('./packages/feed/src/index.ts'),
      '@townsquare/db': r('./packages/db/src/index.ts'),
      '@townsquare/identity': r('./packages/identity/src/index.ts'),
      '@townsquare/storage': r('./packages/storage/src/index.ts'),
      '@townsquare/saves': r('./packages/saves/src/index.ts'),
      '@townsquare/mcp': r('./packages/mcp/src/index.ts'),
      '@townsquare/review': r('./packages/review/src/index.ts'),
      '@townsquare/contributions': r('./packages/contributions/src/index.ts'),
      '@townsquare/civic': r('./packages/civic/src/index.ts'),
    },
  },
  test: {
    // `apps/` is included so the auth routes can be tested over a real socket.
    // The properties there are HTTP properties — which routes read a cookie,
    // what Set-Cookie says — and a handler called directly cannot be wrong
    // about any of them.
    include: ['packages/**/src/**/*.test.ts', 'apps/**/src/**/*.test.ts'],
    environment: 'node',
    testTimeout: 30_000,
  },
})
