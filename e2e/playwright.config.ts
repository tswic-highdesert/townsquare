/**
 * The boundary suite.
 *
 * Everything here needs a real browser, because everything here is a claim
 * about what a browser will refuse to do. A mocked origin proves nothing about
 * origins; a stubbed CSP proves nothing about CSP. This is the only suite in
 * the repo that can honestly assert the security model holds, and it is
 * adversarial by construction rather than happy-path with a few negative cases
 * bolted on.
 *
 * Three real origins, no /etc/hosts entry and no certificates: Chromium maps
 * any `*.localhost` name to 127.0.0.1 itself and treats it as a secure
 * context, so origin separation here is genuine and every assertion means the
 * same thing it will mean in production.
 */

import { defineConfig, devices } from '@playwright/test'
import { fileURLToPath } from 'node:url'

const r = (p: string) => fileURLToPath(new URL(p, import.meta.url))

const SHELL = 'http://townsquare.localhost:5173'
const FIXTURES = r('./fixtures')

const env = {
  TOWNSQUARE_EXTRA_EXAMPLES: FIXTURES,
  APPS_DOMAIN: 'tsq-apps.localhost',
  SANDBOX_PORT: '3031',
  API_PORT: '3030',
}

export default defineConfig({
  testDir: r('.'),
  testMatch: '**/*.spec.ts',
  // Serial. The suite drives shared servers and asserts on cross-origin
  // storage, so parallel workers would be testing each other's leftovers.
  workers: 1,
  fullyParallel: false,
  // In CI: inline annotations on the failing line, plus an HTML report the
  // workflow uploads when something fails. Locally: just the list.
  reporter: process.env['CI']
    ? [['github'], ['html', { outputFolder: 'playwright-report', open: 'never' }]]
    : [['list']],
  timeout: 30_000,
  expect: { timeout: 10_000 },

  use: {
    baseURL: SHELL,
    trace: 'retain-on-failure',
  },

  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],

  webServer: [
    {
      command: 'pnpm tsx apps/api/src/main.ts',
      url: 'http://localhost:3030/api/town',
      cwd: r('..'),
      env,
      reuseExistingServer: !process.env['CI'],
      stdout: 'pipe',
    },
    {
      command: 'pnpm tsx apps/sandbox/src/main.ts',
      // Waiting on the port rather than a URL: every response this server gives
      // may legitimately be a 404, so "listening" is the only honest readiness
      // signal for it.
      port: 3031,
      cwd: r('..'),
      env,
      reuseExistingServer: !process.env['CI'],
      stdout: 'pipe',
    },
    {
      command: 'pnpm --filter @townsquare/web dev',
      // Loopback, not the name: Node's resolver does not know `*.localhost`,
      // only browsers do. The tests still drive the shell by name, which is
      // what makes it a distinct registrable domain from the bundle origins.
      url: 'http://127.0.0.1:5173/',
      cwd: r('..'),
      env,
      reuseExistingServer: !process.env['CI'],
      stdout: 'pipe',
    },
  ],
})
