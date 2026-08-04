import { describe, it, expect } from 'vitest'
import { compileCsp, CspCompileError } from './csp.js'
import { manifestSchema, type Manifest } from '@townsquare/manifest'

function m(network: string[] = []): Manifest {
  return manifestSchema.parse({
    manifest_version: 1,
    sdk: 1,
    name: 'Test',
    tagline: 'T',
    description: 'D',
    version: '1.0.0',
    entry: 'index.html',
    icon: 'icon.svg',
    permissions: { network },
  })
}

const OPTS = { shellOrigins: ['https://townsquare.org'] }

describe('compileCsp', () => {
  it("pins script-src to 'self' regardless of declared hosts", () => {
    const csp = compileCsp(m(['cdn.example.com']), OPTS)
    expect(csp).toContain("script-src 'self' 'unsafe-inline'")
    // The declared host must not reach script-src. This is the vendoring gate.
    expect(csp).not.toMatch(/script-src[^;]*cdn\.example\.com/)
  })

  it('applies declared hosts to connect-src AND img-src', () => {
    const csp = compileCsp(m(['tile.openstreetmap.org']), OPTS)
    expect(csp).toMatch(/connect-src[^;]*https:\/\/tile\.openstreetmap\.org/)
    // Without img-src, `new Image().src` is an open exfiltration channel.
    expect(csp).toMatch(/img-src[^;]*https:\/\/tile\.openstreetmap\.org/)
    expect(csp).toMatch(/media-src[^;]*https:\/\/tile\.openstreetmap\.org/)
    expect(csp).toMatch(/font-src[^;]*https:\/\/tile\.openstreetmap\.org/)
  })

  it("defaults to 'none' and denies object, base and form-action", () => {
    const csp = compileCsp(m(), OPTS)
    expect(csp).toContain("default-src 'none'")
    expect(csp).toContain("object-src 'none'")
    expect(csp).toContain("base-uri 'none'")
    expect(csp).toContain("form-action 'none'")
    expect(csp).not.toContain('unsafe-eval')
  })

  it('forces https on every declared host', () => {
    expect(compileCsp(m(['a.example.com']), OPTS)).toContain('https://a.example.com')
  })

  it('is deterministic and order-independent', () => {
    expect(compileCsp(m(['b.example.com', 'a.example.com']), OPTS)).toBe(
      compileCsp(m(['a.example.com', 'b.example.com']), OPTS),
    )
  })

  // The compiler emits a security header, so it must not trust its caller even
  // though the manifest schema already validated these.
  describe('header injection', () => {
    const attacks = [
      'evil.com;script-src *',
      'evil.com script-src *',
      "evil.com'",
      'evil.com,other.com',
      'EVIL.COM',
      '*.evil.com',
      'evil.com:8080',
      'evil.com/path',
      'localhost',
      '127.0.0.1',
      '10.0.0.5',
      '169.254.169.254',
      'foo.localhost',
      'metadata.google.internal',
      'thing.internal',
      'secret.onion',
      'x.local',
    ]
    for (const host of attacks) {
      it(`rejects ${JSON.stringify(host)}`, () => {
        // Bypass the schema to test the compiler's own guard directly.
        const bad = { ...m(), permissions: { ...m().permissions, network: [host] } } as Manifest
        expect(() => compileCsp(bad, OPTS)).toThrow(CspCompileError)
      })
    }
  })

  it('rejects a report-uri containing a directive separator', () => {
    expect(() => compileCsp(m(), { ...OPTS, reportUri: '/r;script-src *' })).toThrow(CspCompileError)
  })
})

describe('inline script', () => {
  it("allows 'unsafe-inline' for scripts, because a creation is one HTML file", () => {
    // Found by the Playwright boundary suite: without this, an inline
    // `<script type="module">` — the normal shape of a resident's creation and
    // the near-universal shape of a generated one — never executes, and every
    // creation renders as a blank frame.
    expect(compileCsp(m(), OPTS)).toContain("script-src 'self' 'unsafe-inline'")
  })

  it("never allows 'unsafe-eval', which is the distinction that matters", () => {
    // eval is how you fetch a payload after approval and run behaviour a
    // reviewer never saw. Inline script buys an attacker nothing extra on an
    // origin whose entire document they already control.
    expect(compileCsp(m(), OPTS)).not.toContain('unsafe-eval')
    expect(compileCsp(m(), OPTS)).not.toContain('wasm-unsafe-eval')
  })

  it('still refuses to let a declared host reach script-src', () => {
    const csp = compileCsp(m(['cdn.example.com']), OPTS)
    expect(csp).not.toMatch(/script-src[^;]*cdn\.example\.com/)
  })
})

describe('frame-ancestors', () => {
  it('names the shell origins, never self', () => {
    // The bug this test exists for: `frame-ancestors 'self'` means only the
    // creation's own origin may frame it — but it is always framed by the
    // shell, which is a different registrable domain by design. The whole
    // platform silently fails to load, in the browser, where no server log
    // shows it. Found by the Playwright boundary suite.
    const csp = compileCsp(m(), OPTS)
    expect(csp).toContain('frame-ancestors https://townsquare.org')
    expect(csp).not.toContain("frame-ancestors 'self'")
  })

  it('supports several shells, for a multi-town deploy', () => {
    const csp = compileCsp(m(), {
      shellOrigins: ['https://townsquare.org', 'https://russellville.townsquare.org'],
    })
    expect(csp).toContain(
      'frame-ancestors https://townsquare.org https://russellville.townsquare.org',
    )
  })

  it('accepts a development origin with a port', () => {
    const csp = compileCsp(m(), { shellOrigins: ['http://townsquare.localhost:5173'] })
    expect(csp).toContain('frame-ancestors http://townsquare.localhost:5173')
  })

  it('refuses to compile without knowing who may frame the creation', () => {
    expect(() => compileCsp(m(), { shellOrigins: [] })).toThrow(CspCompileError)
  })

  it('refuses an origin that could break out of the directive', () => {
    for (const bad of [
      "https://ok.example; script-src *",
      'https://ok.example/path',
      'https://*.example',
      'townsquare.org',
      'javascript:alert(1)',
    ]) {
      expect(() => compileCsp(m(), { shellOrigins: [bad] }), bad).toThrow(CspCompileError)
    }
  })

  it('de-duplicates rather than repeating an origin', () => {
    const csp = compileCsp(m(), {
      shellOrigins: ['https://townsquare.org', 'https://townsquare.org'],
    })
    expect(csp.match(/townsquare\.org/g)).toHaveLength(1)
  })
})
