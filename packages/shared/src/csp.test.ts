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

describe('compileCsp', () => {
  it("pins script-src to 'self' regardless of declared hosts", () => {
    const csp = compileCsp(m(['cdn.example.com']))
    expect(csp).toContain("script-src 'self'")
    // The declared host must not reach script-src. This is the vendoring gate.
    expect(csp).not.toMatch(/script-src[^;]*cdn\.example\.com/)
  })

  it('applies declared hosts to connect-src AND img-src', () => {
    const csp = compileCsp(m(['tile.openstreetmap.org']))
    expect(csp).toMatch(/connect-src[^;]*https:\/\/tile\.openstreetmap\.org/)
    // Without img-src, `new Image().src` is an open exfiltration channel.
    expect(csp).toMatch(/img-src[^;]*https:\/\/tile\.openstreetmap\.org/)
    expect(csp).toMatch(/media-src[^;]*https:\/\/tile\.openstreetmap\.org/)
    expect(csp).toMatch(/font-src[^;]*https:\/\/tile\.openstreetmap\.org/)
  })

  it("defaults to 'none' and denies object, base and form-action", () => {
    const csp = compileCsp(m())
    expect(csp).toContain("default-src 'none'")
    expect(csp).toContain("object-src 'none'")
    expect(csp).toContain("base-uri 'none'")
    expect(csp).toContain("form-action 'none'")
    expect(csp).not.toContain('unsafe-eval')
  })

  it('forces https on every declared host', () => {
    expect(compileCsp(m(['a.example.com']))).toContain('https://a.example.com')
  })

  it('is deterministic and order-independent', () => {
    expect(compileCsp(m(['b.example.com', 'a.example.com']))).toBe(
      compileCsp(m(['a.example.com', 'b.example.com'])),
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
        expect(() => compileCsp(bad)).toThrow(CspCompileError)
      })
    }
  })

  it('rejects a report-uri containing a directive separator', () => {
    expect(() => compileCsp(m(), { reportUri: '/r;script-src *' })).toThrow(CspCompileError)
  })
})
