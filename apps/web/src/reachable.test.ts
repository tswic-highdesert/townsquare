/**
 * Every module in the shell is reachable from the entry point.
 *
 * The News screen sat finished and dark for an hour today: the component was
 * built, the API was written, and nothing imported either. Nobody noticed
 * because everything compiled, every test passed, and the screen looked correct
 * in isolation. A screen that nothing routes to is invisible to a typechecker
 * and to a unit test, and the only person who finds it is a resident who never
 * arrives.
 *
 * So this walks the real import graph from `main.tsx` and fails on anything
 * stranded. It is deliberately structural rather than clever: it does not know
 * what a route is, only what is reachable, which is the property that actually
 * broke.
 *
 * `ui/specimens.tsx` is the one honest exception. It calls `createRoot` itself
 * and has its own `specimens.html`, so it is a second entry point rather than
 * an unrouted screen, and it is listed by name rather than pattern so a real
 * orphan cannot hide behind a wildcard.
 */

import { readFileSync, readdirSync, statSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const SRC = resolve(dirname(fileURLToPath(import.meta.url)))

/** Second entry points, each with its own HTML document. Not orphans. */
const OTHER_ENTRIES = ['ui/specimens.tsx']

/**
 * Known orphans, each with the reason it is still here.
 *
 * A waiver has to carry an argument, the same way a contrast waiver in
 * `packages/tokens` does. "It is fine" is how this test becomes a list nobody
 * reads, and the point of the list is that adding to it should feel like a
 * decision.
 */
const KNOWN_ORPHANS: Readonly<Record<string, string>> = {
  'identity/ReportForm.tsx':
    'A second, better-argued report form. The live path is RunningCreation → ReportPanel, ' +
    'and swapping a working reporting path for a nicer unused one was declined rather than ' +
    'overlooked. Whoever revisits reporting should fold its reasoning into ReportPanel and ' +
    'delete this, rather than connect it.',
  'identity/index.ts': 'The barrel for the above. Goes when it goes.',
}

function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name)
    if (statSync(full).isDirectory()) sourceFiles(full, out)
    else if (/\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name)) out.push(full)
  }
  return out
}

/** Resolve a relative specifier the way the bundler does, `.js` to `.ts(x)`. */
function resolveImport(fromFile: string, spec: string): string | null {
  if (!spec.startsWith('.')) return null
  const base = resolve(dirname(fromFile), spec).replace(/\.js$/, '')
  for (const candidate of [`${base}.ts`, `${base}.tsx`, join(base, 'index.ts'), join(base, 'index.tsx')]) {
    try {
      if (statSync(candidate).isFile()) return candidate
    } catch {
      // Not this one.
    }
  }
  return null
}

function reachableFrom(entry: string): Set<string> {
  const seen = new Set<string>()
  const queue = [entry]
  while (queue.length) {
    const file = queue.pop() as string
    if (seen.has(file)) continue
    seen.add(file)
    const text = readFileSync(file, 'utf8')
    for (const m of text.matchAll(/(?:from|import)\s*\(?\s*['"]([^'"]+)['"]/g)) {
      const next = resolveImport(file, m[1] as string)
      if (next) queue.push(next)
    }
  }
  return seen
}

describe('the shell has no stranded modules', () => {
  it('reaches every source file from main.tsx', () => {
    const reachable = reachableFrom(join(SRC, 'main.tsx'))
    for (const other of OTHER_ENTRIES) {
      for (const f of reachableFrom(join(SRC, other))) reachable.add(f)
    }

    const stranded = sourceFiles(SRC)
      .filter((f) => !reachable.has(f))
      .map((f) => relative(SRC, f))
      .filter((f) => !(f in KNOWN_ORPHANS))
      .sort()

    // A screen nothing imports is a screen no resident can open, however
    // finished it looks on its own.
    expect(stranded).toEqual([])
  })

  it('keeps the known-orphan list honest', () => {
    // A waiver for a file that is now reachable, or now deleted, is a waiver
    // hiding the next real orphan behind it.
    const all = new Set(sourceFiles(SRC).map((f) => relative(SRC, f)))
    for (const orphan of Object.keys(KNOWN_ORPHANS)) {
      expect(all.has(orphan), `${orphan} is waived but no longer exists`).toBe(true)
    }
  })
})
