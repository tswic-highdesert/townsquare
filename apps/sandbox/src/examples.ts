/**
 * Load the example creations off disk through the *real* publish path.
 *
 * Deliberately not a fixture shortcut. Each example is validated by the same
 * validator a resident's upload hits, and its CSP is compiled by the same
 * compiler, then frozen — so running the dev server is a continuous test that
 * publishing works, and an example that would be rejected in production fails
 * here loudly instead of quietly working only in development.
 */

import { readdir, readFile, stat } from 'node:fs/promises'
import { join, relative, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { validateBundle, hashFiles, type BundleFile } from '@townsquare/bundle'
import { compileCsp, originKeyFromUuid } from '@townsquare/shared'
import { MemoryBundleStore } from '@townsquare/sandbox'

const EXAMPLES_DIR = fileURLToPath(new URL('../examples', import.meta.url))
const TOWN_ID = 'russellville-ar'

/**
 * An extra directory of creations to load, for the boundary suite.
 *
 * The attacker fixture must not ship in the normal gallery, but it must go
 * through the *same* publish path as anything else — otherwise the suite would
 * be attacking a specially-privileged bundle and proving nothing.
 */
const EXTRA_DIR = process.env['TOWNSQUARE_EXTRA_EXAMPLES']

/**
 * Examples that load only in development.
 *
 * Every example serves from its own origin, and in production each origin is a
 * hostname someone has to add to the sandbox service by hand. Only
 * burrito-index has one. The starter is a folder to copy, so a gallery card for
 * it in production would open a frame that cannot load.
 */
const DEVELOPMENT_ONLY = new Set(['starter'])
const PRODUCTION = process.env['NODE_ENV'] === 'production'

/**
 * Who is allowed to frame these creations.
 *
 * Baked into the frozen CSP at publish time. Getting this wrong does not fail
 * loudly anywhere on the server — the browser simply refuses to render every
 * creation, which is why it is configuration rather than a constant.
 */
const SHELL_ORIGINS = (process.env['SHELL_ORIGINS'] ?? 'http://townsquare.localhost:5173')
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean)

async function readDirectoryAsBundle(dir: string): Promise<BundleFile[]> {
  const files: BundleFile[] = []

  async function walk(current: string): Promise<void> {
    for (const entry of await readdir(current, { withFileTypes: true })) {
      const full = join(current, entry.name)
      if (entry.isDirectory()) {
        await walk(full)
        continue
      }
      if (!entry.isFile()) continue
      // POSIX separators, always. A bundle path is a URL key, not a filesystem
      // path, and it must be identical whichever machine published it.
      const path = relative(dir, full).split(sep).join('/')
      files.push({ path, bytes: new Uint8Array(await readFile(full)) })
    }
  }

  await walk(dir)
  return files
}

async function directoriesIn(root: string): Promise<Array<[string, string]>> {
  try {
    return (await readdir(root, { withFileTypes: true }))
      .filter((e) => e.isDirectory())
      .map((e) => [e.name, join(root, e.name)])
  } catch {
    console.warn(`no examples directory at ${root}`)
    return []
  }
}

export async function loadExampleCreations(): Promise<MemoryBundleStore> {
  const store = new MemoryBundleStore()

  const entries = [
    ...(await directoriesIn(EXAMPLES_DIR)),
    ...(EXTRA_DIR ? await directoriesIn(EXTRA_DIR) : []),
  ]

  for (const [name, dir] of entries) {
    if (!(await stat(dir)).isDirectory()) continue
    if (PRODUCTION && DEVELOPMENT_ONLY.has(name)) continue

    const files = await readDirectoryAsBundle(dir)
    const report = validateBundle(files, { hashes: hashFiles(files) })

    if (!report.ok) {
      console.error(`example "${name}" is not publishable:`)
      for (const e of report.errors) console.error(`  ${e.path}: ${e.code} — ${e.message}`)
      continue
    }
    for (const w of report.warnings) {
      console.warn(`example "${name}": ${w.path}: ${w.code} — ${w.message}`)
    }

    // A stable fake uuid per example, so the origin key does not move between
    // restarts and a creation keeps its localStorage across a dev session.
    const uuid = fakeUuid(name)
    const originKey = originKeyFromUuid(uuid)

    store.add('creation', originKey, {
      versionId: `${name}-v1`,
      creationId: uuid,
      originKey,
      entryPath: report.entry,
      // Compiled once, here, and frozen. Never recomputed per request.
      cspHeader: compileCsp(report.manifest, { shellOrigins: SHELL_ORIGINS }),
      townId: TOWN_ID,
      creationStatus: 'active',
      files: new Map(files.map((f) => [f.path, f.bytes])),
      manifest: report.manifest,
      name: report.manifest.name,
      slug: name,
    })

    console.log(`loaded example "${name}" at origin key ${originKey}`)
  }

  return store
}

/** Deterministic uuid-shaped string from a name. Development only. */
function fakeUuid(name: string): string {
  let h1 = 0x811c9dc5
  let h2 = 0x01000193
  for (let i = 0; i < name.length; i++) {
    h1 = Math.imul(h1 ^ name.charCodeAt(i), 0x01000193) >>> 0
    h2 = Math.imul(h2 + name.charCodeAt(i), 0x85ebca6b) >>> 0
  }
  const hex = (h1.toString(16).padStart(8, '0') + h2.toString(16).padStart(8, '0')).repeat(2)
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20, 32),
  ].join('-')
}
