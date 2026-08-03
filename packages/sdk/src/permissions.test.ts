import { describe, it, expect } from 'vitest'
import { manifestSchema, type Manifest } from '@townsquare/manifest'
import { METHODS, METHOD_MAP, assertMethodTable } from './methods.js'
import { checkCall, advisoryGrants, type CheckContext } from './permissions.js'
import { METHODS as WIRE_METHODS } from '@townsquare/shared'

function mk(permissions: Record<string, unknown> = {}, defines: unknown[] = []): Manifest {
  return manifestSchema.parse({
    manifest_version: 1,
    sdk: 1,
    name: 'T',
    tagline: 'T',
    description: 'D',
    version: '1.0.0',
    entry: 'index.html',
    icon: 'icon.svg',
    permissions,
    defines,
  })
}

const anon = (m: Manifest): CheckContext => ({ manifest: m, user: null })
const signedIn = (m: Manifest): CheckContext => ({
  manifest: m,
  user: { handle: 'tswic', verified: false },
})
const verified = (m: Manifest): CheckContext => ({
  manifest: m,
  user: { handle: 'tswic', verified: true },
})

const camera = [
  {
    type: 'flock_camera',
    label: 'Flock camera',
    schema: { lat: { type: 'number', required: true } },
  },
]

describe('method table', () => {
  it('is internally consistent', () => {
    expect(() => assertMethodTable()).not.toThrow()
  })

  // The drift lock. A wire method without a table entry would be callable but
  // undocumented and unpermissioned, which is the worst combination available.
  it('covers every wire method, both directions', () => {
    for (const m of WIRE_METHODS) {
      expect(METHOD_MAP.has(m), `wire method ${m} has no table entry`).toBe(true)
    }
    const wire = new Set<string>(WIRE_METHODS)
    for (const m of METHODS) {
      expect(wire.has(m.method), `${m.method} is documented but not on the wire`).toBe(true)
    }
  })

  it('declares a requirement for every method', () => {
    for (const m of METHODS) expect(m.requires.kind).toBeTruthy()
  })
})

describe('checkCall', () => {
  it('rejects an unknown method without touching params', () => {
    const r = checkCall('records.destroy', ['x'], anon(mk()))
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error.code).toBe('invalid_request')
  })

  it('resolves nothing through the prototype chain', () => {
    for (const evil of ['__proto__', 'constructor', 'toString']) {
      const r = checkCall(evil, undefined, anon(mk()))
      expect(r.ok).toBe(false)
    }
  })

  it('allows town.* with no declaration at all', () => {
    expect(checkCall('town.thisWeek', undefined, anon(mk())).ok).toBe(true)
    expect(checkCall('town.businesses', {}, anon(mk())).ok).toBe(true)
  })

  describe('identity', () => {
    it('denies user.current when identity is not declared', () => {
      const r = checkCall('user.current', undefined, verified(mk()))
      expect(r.ok).toBe(false)
      if (!r.ok) expect(r.error.code).toBe('permission_denied')
    })

    it('allows it when declared, and returns null-ish for anonymous at the handler', () => {
      expect(checkCall('user.current', undefined, anon(mk({ identity: 'handle' }))).ok).toBe(true)
    })
  })

  describe('record reads', () => {
    const m = mk({ read: ['flock_camera'] })

    it('allows a declared type', () => {
      expect(checkCall('records.list', ['flock_camera', {}], anon(m)).ok).toBe(true)
    })

    it('denies an undeclared type', () => {
      const r = checkCall('records.list', ['burrito', {}], anon(m))
      expect(r.ok).toBe(false)
      if (!r.ok) expect(r.error.code).toBe('permission_denied')
    })

    it('treats a declared write as implying read', () => {
      const w = mk({ write: ['flock_camera'], read: ['flock_camera'] }, camera)
      expect(checkCall('records.get', ['flock_camera', 'id1'], anon(w)).ok).toBe(true)
    })

    it('requires the type argument on every record call', () => {
      for (const method of ['records.get', 'records.history']) {
        const r = checkCall(method, [], anon(m))
        expect(r.ok).toBe(false)
        if (!r.ok) expect(r.error.code).toBe('invalid_request')
      }
    })

    // The whole reason get/update/history take a type: without it the host would
    // resolve id -> type first, and the error would differ depending on whether
    // the id existed, which is an enumeration oracle.
    it('denies an undeclared type identically whether or not the id exists', () => {
      const a = checkCall('records.get', ['secret_type', 'real-id'], anon(m))
      const b = checkCall('records.get', ['secret_type', 'fake-id'], anon(m))
      expect(a).toEqual(b)
    })
  })

  describe('record writes', () => {
    const m = mk({ read: ['flock_camera'], write: ['flock_camera'] }, camera)

    it('denies when the type is not declared writable', () => {
      const ro = mk({ read: ['flock_camera'] })
      const r = checkCall('records.create', ['flock_camera', {}], verified(ro))
      expect(r.ok).toBe(false)
      if (!r.ok) expect(r.error.code).toBe('permission_denied')
    })

    it('reports unauthenticated for an anonymous visitor', () => {
      const r = checkCall('records.create', ['flock_camera', {}], anon(m))
      expect(r.ok).toBe(false)
      if (!r.ok) expect(r.error.code).toBe('unauthenticated')
    })

    it('reports not_verified for a signed-in but unverified resident', () => {
      const r = checkCall('records.create', ['flock_camera', {}], signedIn(m))
      expect(r.ok).toBe(false)
      if (!r.ok) expect(r.error.code).toBe('not_verified')
    })

    it('allows a verified resident', () => {
      expect(checkCall('records.create', ['flock_camera', { lat: 1 }], verified(m)).ok).toBe(true)
    })

    // Permission is decided before verification status, so an app that never had
    // the grant learns nothing about who is signed in.
    it('checks the declaration before the user, not after', () => {
      const ro = mk({ read: ['flock_camera'] })
      const r = checkCall('records.create', ['flock_camera', {}], anon(ro))
      expect(r.ok).toBe(false)
      if (!r.ok) expect(r.error.code).toBe('permission_denied')
    })
  })

  describe('storage', () => {
    it('denies when undeclared', () => {
      const r = checkCall('storage.get', 'k', verified(mk()))
      expect(r.ok).toBe(false)
      if (!r.ok) expect(r.error.code).toBe('permission_denied')
    })

    it('reports unauthenticated when declared but nobody is signed in', () => {
      const r = checkCall('storage.get', 'k', anon(mk({ storage: true })))
      expect(r.ok).toBe(false)
      if (!r.ok) expect(r.error.code).toBe('unauthenticated')
    })

    it('allows a signed-in user without requiring verification', () => {
      expect(checkCall('storage.set', ['k', { a: 1 }], signedIn(mk({ storage: true }))).ok).toBe(true)
    })
  })

  describe('params validation', () => {
    it('rejects malformed params after permission passes', () => {
      const r = checkCall('town.items', { limit: 9999 }, anon(mk()))
      expect(r.ok).toBe(false)
      if (!r.ok) expect(r.error.code).toBe('invalid_request')
    })

    it('rejects an oversized title', () => {
      const r = checkCall('app.setTitle', 'x'.repeat(200), anon(mk()))
      expect(r.ok).toBe(false)
    })
  })
})

describe('advisoryGrants', () => {
  it('exposes only what the manifest already says publicly', () => {
    const m = mk({ identity: 'handle', read: ['a_type'], write: ['a_type'], storage: true }, [
      { type: 'a_type', label: 'A', schema: { x: { type: 'number' } } },
    ])
    expect(advisoryGrants(m)).toEqual({
      identity: 'handle',
      read: ['a_type'],
      write: ['a_type'],
      storage: true,
    })
  })
})
