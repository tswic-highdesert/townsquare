import { defineConfig } from 'vitest/config'
import { fileURLToPath } from 'node:url'

const r = (p: string) => fileURLToPath(new URL(p, import.meta.url))

export default defineConfig({
  resolve: {
    alias: {
      '@townsquare/manifest': r('./packages/manifest/src/index.ts'),
      '@townsquare/shared': r('./packages/shared/src/index.ts'),
      '@townsquare/tokens': r('./packages/tokens/src/index.ts'),
    },
  },
  test: {
    include: ['packages/**/src/**/*.test.ts'],
    environment: 'node',
    testTimeout: 30_000,
  },
})
