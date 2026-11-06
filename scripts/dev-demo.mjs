/**
 * `pnpm dev:demo`: build the React SDK demo, then run `pnpm dev` with it loaded.
 *
 * The demo's build output is not committed (see .gitignore), and the sandbox
 * reads creations from disk once at startup, so it has to be built first.
 * `TOWNSQUARE_EXTRA_EXAMPLES` makes the sandbox and API load every folder in
 * `apps/sandbox/dev-creations/` through the same validator as the built-in
 * examples, while keeping the demo out of the public gallery.
 *
 * Plain Node rather than a shell one-liner so it works on Windows too.
 */

import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const isWindows = process.platform === 'win32'

const build = spawnSync('pnpm', ['--filter', '@townsquare/sdk-demo', 'build'], {
  stdio: 'inherit',
  shell: isWindows,
})
if (build.status !== 0) {
  console.error('\nThe SDK demo did not build, so the servers were not started.')
  process.exit(build.status ?? 1)
}

process.env['TOWNSQUARE_EXTRA_EXAMPLES'] = fileURLToPath(
  new URL('../apps/sandbox/dev-creations', import.meta.url),
)

// dev.mjs does its work at import time, and its child processes inherit the
// environment set above.
await import('./dev.mjs')
