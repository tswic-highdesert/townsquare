/**
 * Fail early, and say how to fix it, when node_modules is in a state that
 * `pnpm install` will not repair on its own.
 *
 * The trap: a node_modules that was copied, zipped, symlinked from another
 * worktree or half deleted can lose its `.bin` folder while keeping pnpm's
 * workspace state file. `pnpm install` then reads the state file, prints
 * "Already up to date" and relinks nothing, and the next `pnpm test` dies with
 * `vitest: command not found`. That message points at vitest, not at the
 * install, so a newcomer has no way to know the cure is a clean reinstall.
 *
 * Runs before test, typecheck and dev (the `pre*` scripts in package.json).
 * Plain Node with no imports outside the standard library, because the whole
 * point is that it has to work when the dependencies do not.
 */

import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('..', import.meta.url))

// The commands the scripts call. All are root devDependencies, so pnpm links
// every one into the root node_modules/.bin (apps/web's `vite` included).
const REQUIRED = ['vitest', 'tsc', 'tsx', 'vite']

function linked(bin) {
  const base = join(root, 'node_modules', '.bin', bin)
  // pnpm writes a .cmd and a .ps1 shim on Windows, and a shell shim elsewhere.
  return existsSync(base) || existsSync(`${base}.cmd`)
}

const problems = []

if (!existsSync(join(root, 'node_modules'))) {
  problems.push('node_modules does not exist yet.')
} else {
  for (const bin of REQUIRED.filter((b) => !linked(b))) {
    problems.push(`${join('node_modules', '.bin', bin)} is missing.`)
  }
}

if (problems.length > 0) {
  const isWindows = process.platform === 'win32'
  const remove = isWindows
    ? 'Remove-Item -Recurse -Force node_modules, apps\\*\\node_modules, packages\\*\\node_modules'
    : 'rm -rf node_modules apps/*/node_modules packages/*/node_modules'
  console.error(
    [
      '',
      'Town Square: the install is incomplete.',
      '',
      ...problems.map((p) => `  ${p}`),
      '',
      'Without these, scripts fail with "command not found", and `pnpm install`',
      'may say "Already up to date" without fixing anything. Reinstall cleanly:',
      '',
      `  ${remove}`,
      '  pnpm install',
      '',
      'See GETTING-STARTED.md, "If something goes wrong".',
      '',
    ].join('\n'),
  )
  process.exit(1)
}
