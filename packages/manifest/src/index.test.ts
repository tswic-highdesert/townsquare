import { describe, it, expect } from 'vitest'
import { parseManifest, checkDefinesCompatible, type Defines } from './index.js'

const base = {
  manifest_version: 1,
  sdk: 1,
  name: 'Flock Camera Map',
  tagline: 'Every known ALPR camera in town',
  description: 'A community-maintained map.',
  version: '1.2.0',
  entry: 'index.html',
  icon: 'icon.svg',
}

describe('parseManifest', () => {
  it('accepts a minimal manifest and defaults permissions closed', () => {
    const r = parseManifest(base)
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.manifest.permissions.identity).toBe('none')
    expect(r.manifest.permissions.read).toEqual([])
    expect(r.manifest.permissions.storage).toBe(false)
    expect(r.manifest.permissions.network).toEqual([])
  })

  it('rejects a self-asserted author or id', () => {
    for (const field of ['author', 'id']) {
      const r = parseManifest({ ...base, [field]: 'x' })
      expect(r.ok).toBe(false)
    }
  })

  it('rejects unknown top-level keys so a typo cannot mean "no permissions"', () => {
    const r = parseManifest({ ...base, permisions: { storage: true } })
    expect(r.ok).toBe(false)
  })

  it('rejects unknown keys inside permissions too', () => {
    const r = parseManifest({ ...base, permissions: { netowrk: ['a.example.com'] } })
    expect(r.ok).toBe(false)
  })

  it('requires sdk and manifest_version to be numbers, not strings', () => {
    expect(parseManifest({ ...base, sdk: '1' }).ok).toBe(false)
  })

  it('rejects a non-empty device permission at launch', () => {
    const r = parseManifest({ ...base, permissions: { device: ['geolocation'] } })
    expect(r.ok).toBe(false)
  })

  it('rejects a write of a type it neither defines nor reads', () => {
    const r = parseManifest({ ...base, permissions: { write: ['flock_camera'] } })
    expect(r.ok).toBe(false)
  })

  it('accepts a coherent defines + permissions pair', () => {
    const r = parseManifest({
      ...base,
      permissions: { read: ['flock_camera'], write: ['flock_camera'] },
      defines: [
        {
          type: 'flock_camera',
          label: 'Flock camera',
          schema: { lat: { type: 'number', required: true } },
        },
      ],
    })
    expect(r.ok).toBe(true)
  })

  it('rejects malformed network hosts', () => {
    for (const network of [['http://a.com'], ['*.a.com'], ['a.com:8080'], ['localhost'], ['a.internal']]) {
      expect(parseManifest({ ...base, permissions: { network } }).ok).toBe(false)
    }
  })

  it('rejects traversal in entry and icon', () => {
    expect(parseManifest({ ...base, entry: '../x.html' }).ok).toBe(false)
    expect(parseManifest({ ...base, icon: '/abs.svg' }).ok).toBe(false)
  })

  it('is not confused by a __proto__ payload', () => {
    const r = parseManifest(JSON.parse(`{"__proto__":{"polluted":true},"manifest_version":1}`))
    expect(r.ok).toBe(false)
    expect(({} as Record<string, unknown>)['polluted']).toBeUndefined()
  })
})

describe('checkDefinesCompatible', () => {
  const existing: Defines = {
    type: 'flock_camera',
    label: 'Flock camera',
    schema: {
      lat: { type: 'number', required: true },
      note: { type: 'string', maxLength: 500 },
    },
  }

  it('allows adding an optional field', () => {
    const next: Defines = {
      ...existing,
      schema: { ...existing.schema, confirmed_on: { type: 'date' } },
    }
    expect(checkDefinesCompatible(next, existing)).toEqual([])
  })

  it('rejects removing a field', () => {
    const next: Defines = { ...existing, schema: { lat: { type: 'number', required: true } } }
    expect(checkDefinesCompatible(next, existing).length).toBeGreaterThan(0)
  })

  it('rejects retyping a field', () => {
    const next: Defines = {
      ...existing,
      schema: { ...existing.schema, lat: { type: 'string' } },
    }
    expect(checkDefinesCompatible(next, existing).length).toBeGreaterThan(0)
  })

  it('rejects adding a required field, which would invalidate existing rows', () => {
    const next: Defines = {
      ...existing,
      schema: { ...existing.schema, source: { type: 'string', required: true } },
    }
    expect(checkDefinesCompatible(next, existing).length).toBeGreaterThan(0)
  })

  it('rejects narrowing maxLength', () => {
    const next: Defines = {
      ...existing,
      schema: { ...existing.schema, note: { type: 'string', maxLength: 100 } },
    }
    expect(checkDefinesCompatible(next, existing).length).toBeGreaterThan(0)
  })

  it('is a no-op when the type is new to the town', () => {
    expect(checkDefinesCompatible(existing, undefined)).toEqual([])
  })
})

describe('hostname regex regression', () => {
  // Found by the CSP test suite: an all-numeric TLD meant a bare IP parsed as a
  // valid hostname and bypassed the loopback denylist entirely.
  it('rejects bare IP literals', () => {
    for (const network of [['127.0.0.1'], ['10.0.0.5'], ['192.168.1.1'], ['169.254.169.254']]) {
      expect(parseManifest({ ...base, permissions: { network } }).ok).toBe(false)
    }
  })

  it('still accepts ordinary hostnames', () => {
    for (const network of [['tile.openstreetmap.org'], ['a-b.example.co.uk'], ['x1.cdn.example.com']]) {
      expect(parseManifest({ ...base, permissions: { network } }).ok).toBe(true)
    }
  })
})
