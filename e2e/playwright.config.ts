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
import { cpSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const r = (p: string) => fileURLToPath(new URL(p, import.meta.url))

const SHELL_PORT = process.env['BOUNDARY_SHELL_PORT'] ?? '4410'
const API_PORT = process.env['BOUNDARY_API_PORT'] ?? '4411'
const SANDBOX_PORT = process.env['BOUNDARY_SANDBOX_PORT'] ?? '4412'
const SHELL = `http://townsquare.localhost:${SHELL_PORT}`
const RUN_DIR = process.env['BOUNDARY_RUN_DIR'] ?? mkdtempSync(join(tmpdir(), 'townsquare-boundary-'))
process.env['BOUNDARY_RUN_DIR'] = RUN_DIR
const FIXTURES = join(RUN_DIR, 'fixtures')
cpSync(r('./fixtures'), FIXTURES, { recursive: true })
// Public starter examples need no private permissions. Keep identity/storage
// coverage in a test-only creation published through the same real validator.
const PROBE = join(FIXTURES, 'identity-probe')
mkdirSync(PROBE, { recursive: true })
cpSync(r('./fixtures/attacker/icon.png'), join(PROBE, 'icon.png'))
writeFileSync(join(PROBE, 'townsquare.json'), JSON.stringify({
  manifest_version: 1, sdk: 1, name: 'Boundary Identity Probe',
  tagline: 'Test-only identity and private storage probe',
  description: 'A test fixture for explicit identity grants and resident-scoped storage. Never loaded outside the boundary suite.',
  version: '1.0.0', entry: 'index.html', icon: 'icon.png',
  permissions: { identity: 'handle', storage: true },
}))
writeFileSync(join(PROBE, 'index.html'), `<!doctype html><html lang="en"><head><title>Boundary Identity Probe</title></head><body>
<p id="lede">Loading</p><button id="pin" hidden>Pin my favourite</button>
<script type="module">
import { user, storage, app } from '@townsquare/sdk';
try {
 const me = await user.current();
 document.getElementById('lede').textContent = me ? me.handle : 'Signed out';
 if (me) {
  const value = await storage.get('favourite');
  if (value) { const marker = document.createElement('p'); marker.id='favourite'; marker.textContent=String(value); document.body.append(marker); }
  const pin=document.getElementById('pin'); pin.hidden=false;
  pin.textContent=value ? 'Pin a different favourite' : 'Pin my favourite';
  pin.addEventListener('click',async()=>{await storage.set('favourite','boundary-private-value');pin.textContent='Pinned';});
 }
} catch(error) { document.getElementById('lede').textContent=String(error); }
finally { app.ready(); }
</script></body></html>`)
const env = {
  NODE_ENV: 'test',
  TOWNSQUARE_EXTRA_EXAMPLES: FIXTURES,
  TOWNSQUARE_DB_PATH: join(RUN_DIR, 'residents.sqlite'),
  APPS_DOMAIN: 'tsq-apps.localhost',
  SANDBOX_PORT, API_PORT, SHELL_PORT,
  SHELL_ORIGIN: SHELL, SHELL_ORIGINS: SHELL,
}

export default defineConfig({
  testDir: r('.'),
  testMatch: 'boundary.spec.ts',
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
      url: `http://127.0.0.1:${API_PORT}/api/town`,
      cwd: r('..'),
      env: { ...env, PORT: API_PORT },
      reuseExistingServer: false,
      stdout: 'pipe',
    },
    {
      command: 'pnpm tsx apps/sandbox/src/main.ts',
      // Waiting on the port rather than a URL: every response this server gives
      // may legitimately be a 404, so "listening" is the only honest readiness
      // signal for it.
      port: Number(SANDBOX_PORT),
      cwd: r('..'),
      env: { ...env, PORT: SANDBOX_PORT },
      reuseExistingServer: false,
      stdout: 'pipe',
    },
    {
      command: 'pnpm --filter @townsquare/web dev',
      // Loopback, not the name: Node's resolver does not know `*.localhost`,
      // only browsers do. The tests still drive the shell by name, which is
      // what makes it a distinct registrable domain from the bundle origins.
      url: `http://127.0.0.1:${SHELL_PORT}/`,
      cwd: r('..'),
      env,
      reuseExistingServer: false,
      stdout: 'pipe',
    },
  ],
})
