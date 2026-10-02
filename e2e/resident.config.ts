import { defineConfig, devices } from '@playwright/test'

/** Drives an already-running app. Never starts or substitutes local servers. */
export default defineConfig({
  testDir: '.',
  testMatch: ['resident.spec.ts', 'moderator.spec.ts'],
  workers: 1,
  fullyParallel: false,
  timeout: 90_000,
  expect: { timeout: 15_000 },
  outputDir: process.env['TOWNSQUARE_E2E_OUTPUT'] ?? '../artifacts/resident-e2e',
  reporter: [['list']],
  use: {
    baseURL: process.env['TOWNSQUARE_BASE_URL'] ?? 'http://127.0.0.1:4310',
    screenshot: 'only-on-failure',
    // Auth traces can contain typed passwords; do not record them.
    trace: 'off',
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 1000 } } },
    { name: 'phone', use: { ...devices['iPhone 13'], defaultBrowserType: 'chromium' } },
  ],
})
