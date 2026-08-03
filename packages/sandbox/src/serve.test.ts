import { describe, expect, it } from 'vitest'
import { compileCsp } from '@townsquare/shared'
import { guestThemeCss } from '@townsquare/tokens'
import { parseManifest } from '@townsquare/manifest'
import { MemoryBundleStore } from './memoryStore.js'
import { serveBundleRequest, type SandboxConfig } from './serve.js'

const ORIGIN = { appsDomain: 'tsq-apps.localhost', scheme: 'http' as const, port: 3031 }

const MANIFEST = {
  manifest_version: 1,
  sdk: 1,
  name: 'Flock Camera Map',
  tagline: 'Every camera in town',
  description: 'A map of every automated licence plate reader in Russellville.',
  version: '1.0.0',
  entry: 'index.html',
  icon: 'icon.png',
  permissions: { network: ['tile.openstreetmap.org'] },
}

function csp(): string {
  const parsed = parseManifest(MANIFEST)
  if (!parsed.ok) throw new Error(JSON.stringify(parsed.issues))
  return compileCsp(parsed.manifest)
}

const enc = (s: string) => new TextEncoder().encode(s)
const dec = (b: Uint8Array | null) => (b ? new TextDecoder().decode(b) : '')

function config(overrides: Partial<SandboxConfig> = {}): SandboxConfig {
  const store = new MemoryBundleStore()
  store.add('creation', 'a7k2m9x4tsq', {
    versionId: 'v1',
    creationId: 'c1',
    originKey: 'a7k2m9x4tsq',
    entryPath: 'index.html',
    cspHeader: csp(),
    townId: 'russellville-ar',
    creationStatus: 'active',
    files: new Map([
      ['index.html', enc('<!doctype html><html><head><title>Map</title></head><body>hi</body></html>')],
      ['app.js', enc('console.log("hello")')],
      ['icon.png', enc('not really a png')],
      ['data/cameras.geojson', enc('{"type":"FeatureCollection","features":[]}')],
    ]),
  })
  store.add('creation', 'blockedkey12', {
    versionId: 'v2',
    creationId: 'c2',
    originKey: 'blockedkey12',
    entryPath: 'index.html',
    cspHeader: csp(),
    townId: 'russellville-ar',
    creationStatus: 'blocked',
    files: new Map([['index.html', enc('<html>blocked</html>')]]),
  })

  return {
    origin: ORIGIN,
    store,
    assets: {
      sdkJs: 'export const town = {}',
      themeCss: () => guestThemeCss(),
      themeVersion: 19,
      sdkMajor: 1,
    },
    ...overrides,
  }
}

const HOST = 'a7k2m9x4tsq.tsq-apps.localhost:3031'
const get = (url: string, host = HOST) =>
  serveBundleRequest({ method: 'GET', host, url }, config())

describe('serving a bundle', () => {
  it('serves the entry document for /', async () => {
    const res = await get('/')
    expect(res.status).toBe(200)
    expect(res.headers['Content-Type']).toBe('text/html; charset=utf-8')
    expect(dec(res.body)).toContain('<body>hi</body>')
  })

  it('injects the import map, theme and boot script into the entry', async () => {
    const body = dec((await get('/')).body)
    expect(body).toContain('<script type="importmap">')
    expect(body).toContain('"@townsquare/sdk":"/_ts/sdk/1/sdk.js"')
    expect(body).toContain('/_ts/theme/russellville-ar-19.css')
    expect(body).toContain('/_ts/sdk/1/boot.js')
  })

  it('puts the import map before any module script in the document', async () => {
    const body = dec((await get('/')).body)
    expect(body.indexOf('type="importmap"')).toBeLessThan(body.indexOf('boot.js'))
  })

  it('serves a non-entry asset with its own content type and an immutable cache', async () => {
    const res = await get('/app.js')
    expect(res.status).toBe(200)
    expect(res.headers['Content-Type']).toBe('text/javascript; charset=utf-8')
    expect(res.headers['Cache-Control']).toContain('immutable')
    expect(res.headers['ETag']).toMatch(/^"[0-9a-f]{64}"$/)
    expect(dec(res.body)).toBe('console.log("hello")')
  })

  it('does not put an ETag on the entry, whose bytes are rewritten per request', async () => {
    const res = await get('/')
    expect(res.headers['ETag']).toBeUndefined()
    expect(res.headers['Cache-Control']).toBe('no-cache')
  })

  it('serves nested paths', async () => {
    const res = await get('/data/cameras.geojson')
    expect(res.status).toBe(200)
    expect(res.headers['Content-Type']).toBe('application/geo+json')
  })

  it('omits the body but keeps the headers on HEAD', async () => {
    const res = await serveBundleRequest({ method: 'HEAD', host: HOST, url: '/app.js' }, config())
    expect(res.status).toBe(200)
    expect(res.body).toBeNull()
    expect(res.headers['Content-Length']).toBe('20')
  })

  it('refuses anything but GET and HEAD', async () => {
    const res = await serveBundleRequest({ method: 'POST', host: HOST, url: '/' }, config())
    expect(res.status).toBe(405)
  })
})

describe('security headers', () => {
  it('serves the frozen CSP verbatim on every asset', async () => {
    for (const path of ['/', '/app.js', '/data/cameras.geojson', '/_ts/sdk/1/sdk.js']) {
      const res = await get(path)
      expect(res.headers['Content-Security-Policy'], path).toBe(csp())
    }
  })

  it('pins the exact CSP, so nobody can loosen it without a visible diff', async () => {
    const res = await get('/')
    expect(res.headers['Content-Security-Policy']).toBe(
      "default-src 'none'; " +
        "script-src 'self'; " +
        "style-src 'self' 'unsafe-inline'; " +
        "img-src 'self' data: https://tile.openstreetmap.org; " +
        "font-src 'self' data: https://tile.openstreetmap.org; " +
        "media-src 'self' https://tile.openstreetmap.org; " +
        "connect-src 'self' https://tile.openstreetmap.org; " +
        "frame-src 'none'; " +
        "child-src 'none'; " +
        "object-src 'none'; " +
        "base-uri 'none'; " +
        "form-action 'none'; " +
        "worker-src 'self'; " +
        "frame-ancestors 'self'",
    )
  })

  it('sets nosniff, no-referrer and a locked-down permissions policy everywhere', async () => {
    const res = await get('/app.js')
    expect(res.headers['X-Content-Type-Options']).toBe('nosniff')
    expect(res.headers['Referrer-Policy']).toBe('no-referrer')
    expect(res.headers['Permissions-Policy']).toContain('geolocation=()')
    expect(res.headers['Permissions-Policy']).toContain('camera=()')
    expect(res.headers['Vary']).toBe('Host')
  })

  it('never emits a Set-Cookie, because this process knows nothing about sessions', async () => {
    for (const path of ['/', '/app.js', '/nope', '/_ts/sdk/1/sdk.js']) {
      const res = await get(path)
      const names = Object.keys(res.headers).map((h) => h.toLowerCase())
      expect(names, path).not.toContain('set-cookie')
    }
  })
})

describe('path traversal', () => {
  const attempts = [
    '/../../etc/passwd',
    '/%2e%2e/%2e%2e/etc/passwd',
    '/..%2fapp.js',
    '/%252e%252e/app.js',
    '/./../../app.js',
    '/data/../../app.js',
    '/\\..\\app.js',
    '/.hidden.js',
    '/data/.env.json',
  ]

  for (const attempt of attempts) {
    it(`404s ${attempt}`, async () => {
      const res = await get(attempt)
      expect(res.status).toBe(404)
    })
  }

  it('404s an extension with no entry in the type allowlist', async () => {
    const res = await get('/app.wasm')
    expect(res.status).toBe(404)
  })

  it('does not serve a file from another version', async () => {
    const res = await get('/index.html', 'blockedkey12.tsq-apps.localhost:3031')
    // Blocked, so it never gets as far as the file table.
    expect(res.status).toBe(410)
  })
})

describe('host resolution', () => {
  it('421s a Host that is not under the apps domain', async () => {
    for (const host of [
      'townsquare.org',
      'a7k2m9x4tsq.tsq-apps.localhost.evil.com',
      'eviltsq-apps.localhost',
      'a.b.tsq-apps.localhost',
    ]) {
      const res = await get('/', host)
      expect(res.status, host).toBe(421)
    }
  })

  it('404s a well-formed key that resolves to nothing', async () => {
    const res = await get('/', 'zzzzzzzzzzzz.tsq-apps.localhost:3031')
    expect(res.status).toBe(404)
  })

  it('410s a blocked creation with an explainer rather than a blank frame', async () => {
    const res = await get('/', 'blockedkey12.tsq-apps.localhost:3031')
    expect(res.status).toBe(410)
    expect(dec(res.body)).toContain('blocked by a moderator')
  })

  it('keeps preview keys in their own namespace', async () => {
    const res = await get('/', 'p-a7k2m9x4tsq.tsq-apps.localhost:3031')
    // The same key under the preview namespace is a different creation, and
    // this one was never registered there.
    expect(res.status).toBe(404)
  })
})

describe('platform assets', () => {
  it('serves the SDK from the guest own origin so script-src self covers it', async () => {
    const res = await get('/_ts/sdk/1/sdk.js')
    expect(res.status).toBe(200)
    expect(res.headers['Content-Type']).toBe('text/javascript; charset=utf-8')
    expect(dec(res.body)).toContain('export const town')
  })

  it('serves a boot module that imports the same SDK URL', async () => {
    const res = await get('/_ts/sdk/1/boot.js')
    expect(res.status).toBe(200)
    expect(dec(res.body)).toContain("import './sdk.js'")
  })

  it('serves the theme for the creation town, not one named in the URL', async () => {
    const res = await get('/_ts/theme/some-other-town-19.css')
    expect(res.status).toBe(200)
    expect(dec(res.body)).toContain('--ts-navy')
  })

  it('404s an unknown platform path', async () => {
    expect((await get('/_ts/nope.js')).status).toBe(404)
    expect((await get('/_ts/sdk/9/sdk.js')).status).toBe(404)
  })
})
