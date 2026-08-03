import { describe, expect, it } from 'vitest'
import { validateBundle, type BundleFile } from './validate.js'
import { bundleDigest, hashFiles, sha256 } from './digest.js'
import { checkBundlePath } from './paths.js'

const enc = (s: string) => new TextEncoder().encode(s)

const MANIFEST = {
  manifest_version: 1,
  sdk: 1,
  name: 'The Burrito Index',
  tagline: 'Fourteen taquerias, ranked by whoever shows up',
  description: 'Fourteen taquerias in town, ranked by whoever shows up to vote. Resets Sunday.',
  version: '1.0.0',
  entry: 'index.html',
  icon: 'icon.png',
}

/** A 1x1 PNG header is enough for the icon check, which only reads IHDR. */
function png(width: number, height: number): Uint8Array {
  const bytes = new Uint8Array(24)
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0)
  const view = new DataView(bytes.buffer)
  view.setUint32(8, 13)
  view.setUint32(12, 0x49484452)
  view.setUint32(16, width)
  view.setUint32(20, height)
  return bytes
}

function bundle(overrides: Partial<Record<string, Uint8Array>> = {}, manifest = MANIFEST): BundleFile[] {
  const files: Record<string, Uint8Array> = {
    'townsquare.json': enc(JSON.stringify(manifest)),
    'index.html': enc('<!doctype html><html><body><h1>Burritos</h1></body></html>'),
    'icon.png': png(512, 512),
    ...overrides,
  }
  return Object.entries(files)
    .filter(([, v]) => v !== undefined)
    .map(([path, bytes]) => ({ path, bytes: bytes as Uint8Array }))
}

const errorCodes = (r: ReturnType<typeof validateBundle>) =>
  r.ok ? [] : r.errors.map((e) => e.code)
const warnCodes = (r: ReturnType<typeof validateBundle>) => r.warnings.map((w) => w.code)

describe('a well-formed bundle', () => {
  it('passes', () => {
    const result = validateBundle(bundle())
    expect(result.ok, JSON.stringify(errorCodes(result))).toBe(true)
    if (result.ok) expect(result.entry).toBe('index.html')
  })
})

describe('the manifest', () => {
  it('requires one', () => {
    const files = bundle().filter((f) => f.path !== 'townsquare.json')
    expect(errorCodes(validateBundle(files))).toContain('missing_manifest')
  })

  it('rejects invalid JSON', () => {
    expect(errorCodes(validateBundle(bundle({ 'townsquare.json': enc('{nope') })))).toContain(
      'invalid_json',
    )
  })

  it('rejects a manifest that fails the schema', () => {
    const bad = { ...MANIFEST, name: '' }
    expect(errorCodes(validateBundle(bundle({}, bad as never)))).toContain('invalid_manifest')
  })

  it('rejects a prototype-polluting key anywhere in the tree', () => {
    const raw = '{"manifest_version":1,"sdk":1,"display":{"__proto__":{"admin":true}}}'
    expect(errorCodes(validateBundle(bundle({ 'townsquare.json': enc(raw) })))).toContain(
      'prototype_key',
    )
  })

  it('rejects a manifest asserting its own author', () => {
    const bad = { ...MANIFEST, author: 'luis' }
    expect(errorCodes(validateBundle(bundle({}, bad as never)))).toContain('invalid_manifest')
  })
})

describe('declared files', () => {
  it('rejects an entry that is not in the bundle', () => {
    const files = bundle().filter((f) => f.path !== 'index.html')
    expect(errorCodes(validateBundle(files))).toContain('missing_entry')
  })

  it('rejects an entry that is not HTML', () => {
    const m = { ...MANIFEST, entry: 'app.js' }
    const files = bundle({ 'app.js': enc('console.log(1)') }, m)
    expect(errorCodes(validateBundle(files))).toContain('entry_not_html')
  })

  it('rejects a non-square icon', () => {
    expect(errorCodes(validateBundle(bundle({ 'icon.png': png(512, 256) })))).toContain(
      'icon_not_square',
    )
  })

  it('rejects an icon that is not a readable PNG', () => {
    expect(errorCodes(validateBundle(bundle({ 'icon.png': enc('gotcha') })))).toContain(
      'icon_unreadable',
    )
  })
})

describe('paths', () => {
  it('rejects traversal, absolute paths, dotfiles and backslashes', () => {
    for (const path of ['../escape.js', '/abs.js', '.env.json', 'a\\b.js', 'a//b.js']) {
      const result = validateBundle([...bundle(), { path, bytes: enc('x') }])
      expect(errorCodes(result), path).toContain('bad_path')
    }
  })

  it('rejects an extension the sandbox will not serve', () => {
    const result = validateBundle([...bundle(), { path: 'mod.wasm', bytes: enc('x') }])
    expect(errorCodes(result)).toContain('bad_path')
  })

  it('rejects two files that differ only in case', () => {
    const result = validateBundle([...bundle(), { path: 'Index.html', bytes: enc('<html>') }])
    expect(errorCodes(result)).toContain('duplicate_path')
  })

  it('accepts a normal nested path', () => {
    expect(checkBundlePath('data/cameras.geojson')).toEqual({
      ok: true,
      path: 'data/cameras.geojson',
    })
  })
})

describe('limits', () => {
  it('rejects a file over the single-file ceiling', () => {
    const big = new Uint8Array(1024 * 1024 + 1)
    const result = validateBundle([...bundle(), { path: 'big.png', bytes: big }])
    expect(errorCodes(result)).toContain('file_too_large')
  })

  it('rejects a bundle over the total ceiling', () => {
    const extra = Array.from({ length: 4 }, (_, i) => ({
      path: `chunk${i}.png`,
      bytes: new Uint8Array(600 * 1024),
    }))
    const result = validateBundle([...bundle(), ...extra])
    expect(errorCodes(result)).toContain('bundle_too_large')
  })

  it('rejects too many files', () => {
    const extra = Array.from({ length: 201 }, (_, i) => ({
      path: `f${i}.txt`,
      bytes: enc('x'),
    }))
    expect(errorCodes(validateBundle([...bundle(), ...extra]))).toContain('too_many_files')
  })
})

describe('source autochecks', () => {
  it('rejects minified source by line length', () => {
    const minified = 'var a=1;'.repeat(400) + ';'
    const result = validateBundle(bundle({ 'app.js': enc(minified) }))
    expect(errorCodes(result)).toContain('minified')
  })

  it('accepts ordinary hand-written source of the same size', () => {
    const readable = Array.from({ length: 400 }, (_, i) => `  const value${i} = ${i}`).join('\n')
    const result = validateBundle(bundle({ 'app.js': enc(readable) }))
    expect(result.ok, JSON.stringify(errorCodes(result))).toBe(true)
  })

  it('rejects eval and new Function, which the CSP would kill at runtime anyway', () => {
    expect(errorCodes(validateBundle(bundle({ 'app.js': enc('eval("1+1")') })))).toContain(
      'dynamic_code',
    )
    expect(
      errorCodes(validateBundle(bundle({ 'app.js': enc('const f = new Function("return 1")') }))),
    ).toContain('dynamic_code')
  })

  it('rejects a bundle shipping its own @townsquare import map', () => {
    const html =
      '<!doctype html><html><head><script type="importmap">' +
      '{"imports":{"@townsquare/sdk":"https://evil.example/sdk.js"}}</script></head><body></body></html>'
    expect(errorCodes(validateBundle(bundle({ 'index.html': enc(html) })))).toContain(
      'own_import_map',
    )
  })

  it('rejects a vendored copy of the SDK', () => {
    const vendored =
      'window.parent.postMessage({ ts: 1, kind: "hello", sdk: 1 }, "*")\n'.repeat(2)
    expect(errorCodes(validateBundle(bundle({ 'sdk.js': enc(vendored) })))).toContain(
      'vendored_sdk',
    )
  })

  it('warns rather than rejects on a host the manifest never declared', () => {
    const src = 'fetch("https://api.weather.gov/points/35,-93")'
    const result = validateBundle(bundle({ 'app.js': enc(src) }))
    expect(result.ok).toBe(true)
    expect(warnCodes(result)).toContain('undeclared_host')
  })

  it('stays quiet about a declared host and its subdomains', () => {
    const m = { ...MANIFEST, permissions: { network: ['weather.gov'] } }
    const src = 'fetch("https://api.weather.gov/points/35,-93")'
    const result = validateBundle(bundle({ 'app.js': enc(src) }, m))
    expect(warnCodes(result)).not.toContain('undeclared_host')
  })

  it('skips heuristics for a known library and says so to the reviewer', () => {
    const minified = 'var a=1;'.repeat(400) + ';'
    const files = bundle({ 'leaflet.js': enc(minified) })
    const hashes = hashFiles(files)
    const known = new Map([[hashes.get('leaflet.js')!, 'leaflet 1.9.4']])
    const result = validateBundle(files, { hashes, knownLibraries: known })
    expect(result.ok, JSON.stringify(errorCodes(result))).toBe(true)
    expect(warnCodes(result)).toContain('known_library')
  })
})

describe('defines', () => {
  const withDefine = {
    ...MANIFEST,
    permissions: { write: ['taco_vote'], read: ['taco_vote'] },
    defines: [
      {
        type: 'taco_vote',
        label: 'Taco vote',
        schema: { spot: { type: 'string' as const, required: true } },
      },
    ],
  }

  it('warns when no town was supplied to check against', () => {
    const result = validateBundle(bundle({}, withDefine as never))
    expect(warnCodes(result)).toContain('defines_unchecked')
  })

  it('rejects a redefinition that retypes an existing field', () => {
    const existing = new Map([
      [
        'taco_vote',
        {
          type: 'taco_vote',
          label: 'Taco vote',
          schema: { spot: { type: 'number' as const, required: true } },
        },
      ],
    ])
    const result = validateBundle(bundle({}, withDefine as never), { existingTypes: existing })
    expect(errorCodes(result)).toContain('defines_incompatible')
  })

  it('accepts an additive redefinition', () => {
    const existing = new Map([
      [
        'taco_vote',
        {
          type: 'taco_vote',
          label: 'Taco vote',
          schema: { spot: { type: 'string' as const, required: true } },
        },
      ],
    ])
    const result = validateBundle(bundle({}, withDefine as never), { existingTypes: existing })
    expect(result.ok, JSON.stringify(errorCodes(result))).toBe(true)
  })
})

describe('content addressing', () => {
  it('hashes identical bytes to the same blob, so vendoring dedupes', () => {
    expect(sha256(enc('leaflet'))).toBe(sha256(enc('leaflet')))
  })

  it('gives the same digest for the same tree regardless of file order', () => {
    const files = bundle()
    const a = bundleDigest(hashFiles(files))
    const b = bundleDigest(hashFiles([...files].reverse()))
    expect(a).toBe(b)
  })

  it('changes the digest when a file moves, not just when bytes change', () => {
    const files = bundle()
    const moved = files.map((f) => (f.path === 'icon.png' ? { ...f, path: 'img/icon.png' } : f))
    expect(bundleDigest(hashFiles(files))).not.toBe(bundleDigest(hashFiles(moved)))
  })

  it('cannot be collided by naming a file cleverly', () => {
    const a = new Map([
      ['ab/c.js', 'x'.repeat(64)],
      ['d.js', 'y'.repeat(64)],
    ])
    const b = new Map([
      ['ab', 'c.js'.padEnd(64, 'x')],
      ['d.js', 'y'.repeat(64)],
    ])
    expect(bundleDigest(a)).not.toBe(bundleDigest(b))
  })
})
