import { beforeEach, describe, expect, it, vi } from 'vitest'
import { parseManifest, type Manifest } from '@townsquare/manifest'
import { PROTOCOL_VERSION } from '@townsquare/shared'
import { Bridge, type BridgeContext } from './bridge.js'
import { RateLimiter } from './limiter.js'

function manifestWith(permissions: Record<string, unknown> = {}, extra: Record<string, unknown> = {}): Manifest {
  const parsed = parseManifest({
    manifest_version: 1,
    sdk: 1,
    name: 'The Burrito Index',
    tagline: 'Fourteen taquerias, ranked',
    description: 'Fourteen taquerias in town, ranked by whoever shows up to vote each week.',
    version: '1.0.0',
    entry: 'index.html',
    icon: 'icon.png',
    permissions,
    ...extra,
  })
  if (!parsed.ok) throw new Error(JSON.stringify(parsed.issues))
  return parsed.manifest
}

const townData = {
  info: vi.fn(async () => ({ id: 'russellville-ar', name: 'Russellville', timezone: 'America/Chicago' })),
  thisWeek: vi.fn(async () => ({ today: [], weekend: [], comingUp: [], notices: [] })),
  items: vi.fn(async () => ({ items: [], nextCursor: null })),
  item: vi.fn(async () => null),
  businesses: vi.fn(async () => ({ items: [], nextCursor: null })),
}

const frame = { ready: vi.fn(), setHeight: vi.fn(), setTitle: vi.fn() }

function bridge(overrides: Partial<BridgeContext> = {}): Bridge {
  return new Bridge({
    manifest: manifestWith(),
    user: null,
    town: townData,
    frame,
    ...overrides,
  })
}

const req = (method: string, params?: unknown, id = 'r1') => ({
  ts: PROTOCOL_VERSION,
  kind: 'req' as const,
  id,
  method,
  params,
})

beforeEach(() => {
  vi.clearAllMocks()
})

describe('envelope handling', () => {
  it('drops a malformed envelope rather than replying to it', async () => {
    for (const bad of [null, undefined, 42, 'hello', {}, { ts: 2, kind: 'req', id: 'x', method: 'town.info' }]) {
      expect(await bridge().handle(bad)).toBeNull()
    }
  })

  it('drops a request with no id, since there is nothing to correlate a reply to', async () => {
    expect(await bridge().handle({ ts: 1, kind: 'req', method: 'town.info' })).toBeNull()
  })

  it('rejects an unknown method without running anything', async () => {
    const res = await bridge().handle(req('town.secrets'))
    expect(res).toMatchObject({ ok: false, error: { code: 'invalid_request' } })
  })

  it('resolves __proto__ to nothing rather than walking the prototype chain', async () => {
    for (const method of ['__proto__', 'constructor', 'prototype', 'toString']) {
      const res = await bridge().handle(req(method))
      expect(res, method).toMatchObject({ ok: false, error: { code: 'invalid_request' } })
    }
  })

  it('echoes the request id back on every response', async () => {
    const res = await bridge().handle(req('town.info', undefined, 'abc-123'))
    expect(res).toMatchObject({ id: 'abc-123', ok: true })
  })
})

describe('permission enforcement', () => {
  it('allows town.* with no declaration at all', async () => {
    const res = await bridge().handle(req('town.info'))
    expect(res).toMatchObject({ ok: true })
    expect(townData.info).toHaveBeenCalled()
  })

  it('denies user.current when identity was not declared', async () => {
    const res = await bridge().handle(req('user.current'))
    expect(res).toMatchObject({ ok: false, error: { code: 'permission_denied' } })
  })

  it('denies a record read for a type the manifest never declared', async () => {
    const res = await bridge().handle(req('records.list', ['taco_vote']))
    expect(res).toMatchObject({ ok: false, error: { code: 'permission_denied' } })
  })

  it('denies a write for a type declared only under read', async () => {
    const b = bridge({ manifest: manifestWith({ read: ['taco_vote'] }) })
    const res = await b.handle(req('records.create', ['taco_vote', { spot: 'El Sol' }]))
    expect(res).toMatchObject({ ok: false, error: { code: 'permission_denied' } })
  })

  it('treats a declared write as implying read', async () => {
    const b = bridge({
      manifest: manifestWith(
        { read: ['taco_vote'], write: ['taco_vote'] },
        {
          defines: [
            { type: 'taco_vote', label: 'Taco vote', schema: { spot: { type: 'string' } } },
          ],
        },
      ),
    })
    // Two elements, because the SDK always sends the full tuple with `undefined`
    // in the optional slot. A one-element array is a hand-written message.
    const res = await b.handle(req('records.list', ['taco_vote', undefined]))
    // Permitted, but the capability itself is not built yet.
    expect(res).toMatchObject({ ok: false, error: { code: 'unavailable' } })
  })

  it('says unavailable, not permission_denied, for a correctly declared capability that is not built yet', async () => {
    const b = bridge({ manifest: manifestWith({ identity: 'handle' }) })
    const res = await b.handle(req('user.current'))
    expect(res).toMatchObject({ ok: false, error: { code: 'unavailable' } })
  })

  it('gives the same answer for a malformed record type whether or not it was granted', async () => {
    // A non-string in the type position is a malformed call, not a permission
    // failure. What matters is that the answer does not depend on the grant:
    // if it did, passing garbage would be a way to enumerate which types a
    // creation is allowed to touch.
    const granted = bridge({
      manifest: manifestWith(
        { read: ['taco_vote'], write: ['taco_vote'] },
        { defines: [{ type: 'taco_vote', label: 'Taco vote', schema: { spot: { type: 'string' } } }] },
      ),
    })
    const ungranted = bridge()

    const a = await granted.handle(req('records.list', [12345, undefined]))
    const b = await ungranted.handle(req('records.list', [12345, undefined]))

    expect(a).toMatchObject({ ok: false, error: { code: 'invalid_request' } })
    expect(b).toMatchObject({ ok: false, error: { code: 'invalid_request' } })
  })

  it('does not leak which record types exist behind a permission check', async () => {
    // Two undeclared types, one of which another creation defines. Both must
    // read identically, or the error code becomes an existence oracle.
    const real = await bridge().handle(req('records.list', ['taco_vote', undefined]))
    const fake = await bridge().handle(req('records.list', ['not_a_real_type', undefined]))
    expect(real).toMatchObject({ ok: false, error: { code: 'permission_denied' } })
    expect(fake).toMatchObject({ ok: false, error: { code: 'permission_denied' } })
  })

  it('holds against a hand-written port message that skips the SDK entirely', async () => {
    // Exactly what an attacker writes: the wire shape, by hand, with grants the
    // guest simply asserts. The host reads the frozen manifest and ignores it.
    const res = await bridge().handle({
      ts: 1,
      kind: 'req',
      id: 'x',
      method: 'records.create',
      params: ['taco_vote', { spot: 'El Sol' }],
      grants: { write: ['taco_vote'], identity: 'handle', read: [], storage: true },
    })
    expect(res).toMatchObject({ ok: false, error: { code: 'permission_denied' } })
  })
})

describe('params validation', () => {
  it('rejects params that fail the schema for a permitted method', async () => {
    const res = await bridge().handle(req('town.items', { type: 'nope' }))
    expect(res).toMatchObject({ ok: false, error: { code: 'invalid_request' } })
  })

  it('rejects oversized params before any schema runs', async () => {
    const res = await bridge().handle(req('town.items', { q: 'x'.repeat(300_000) }))
    expect(res).toMatchObject({ ok: false, error: { code: 'too_large' } })
  })

  it('rejects params it cannot serialize, such as a cycle', async () => {
    const cyclic: Record<string, unknown> = {}
    cyclic['self'] = cyclic
    const res = await bridge().handle(req('town.items', cyclic))
    expect(res).toMatchObject({ ok: false, error: { code: 'too_large' } })
  })
})

describe('app.* is handled locally', () => {
  it('routes ready, setHeight and setTitle to the frame with no data source call', async () => {
    const b = bridge()
    await b.handle(req('app.ready'))
    await b.handle(req('app.setHeight', 720))
    await b.handle(req('app.setTitle', '12 cameras mapped'))

    expect(frame.ready).toHaveBeenCalled()
    expect(frame.setHeight).toHaveBeenCalledWith(720)
    expect(frame.setTitle).toHaveBeenCalledWith('12 cameras mapped')
    expect(townData.info).not.toHaveBeenCalled()
  })

  it('rejects a title over the documented length', async () => {
    const res = await bridge().handle(req('app.setTitle', 'x'.repeat(81)))
    expect(res).toMatchObject({ ok: false, error: { code: 'invalid_request' } })
  })
})

describe('rate limiting', () => {
  it('lets a normal burst of reads through', async () => {
    const b = bridge()
    for (let i = 0; i < 20; i++) {
      expect((await b.handle(req('town.info', undefined, `r${i}`)))?.ok, `call ${i}`).toBe(true)
    }
  })

  it('stops a runaway read loop and says how long to wait', async () => {
    let now = 0
    const b = bridge({ limiter: new RateLimiter({ now: () => now }) })
    let limited: unknown = null
    for (let i = 0; i < 200; i++) {
      const res = await b.handle(req('town.info', undefined, `r${i}`))
      if (res && !res.ok) {
        limited = res.error
        break
      }
    }
    expect(limited).toMatchObject({ code: 'rate_limited' })
    expect((limited as { retryAfter: number }).retryAfter).toBeGreaterThan(0)
  })

  it('refills over time rather than latching shut', () => {
    let now = 0
    const limiter = new RateLimiter({ now: () => now })
    while (limiter.take('town.info') === null) {
      /* drain */
    }
    now += 5000
    expect(limiter.take('town.info')).toBeNull()
  })

  it('meters writes far more tightly than reads', () => {
    let now = 0
    const limiter = new RateLimiter({ now: () => now })
    let reads = 0
    while (limiter.take('town.info') === null) reads++
    let writes = 0
    while (limiter.take('records.create', 10) === null) writes++
    expect(writes).toBeLessThan(reads)
  })

  it('keeps the buckets separate, so heavy reading cannot starve a write', () => {
    let now = 0
    const limiter = new RateLimiter({ now: () => now })
    while (limiter.take('town.info') === null) {
      /* drain reads */
    }
    expect(limiter.take('storage.get')).toBeNull()
  })
})

describe('in-flight cap', () => {
  it('rejects past 32 concurrent requests and recovers once they settle', async () => {
    let release: () => void = () => {}
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    const slow = {
      ...townData,
      info: vi.fn(async () => {
        await gate
        return {}
      }),
    }
    const b = bridge({ town: slow, limiter: new RateLimiter({ buckets: { read: { perSecond: 1000, burst: 1000 }, write: { perSecond: 1000, burst: 1000 }, storage: { perSecond: 1000, burst: 1000 }, local: { perSecond: 1000, burst: 1000 } } }) })

    const inflight = Array.from({ length: 32 }, (_, i) => b.handle(req('town.info', undefined, `p${i}`)))
    await Promise.resolve()

    const overflow = await b.handle(req('town.info', undefined, 'over'))
    expect(overflow).toMatchObject({ ok: false, error: { code: 'rate_limited' } })

    release()
    await Promise.all(inflight)
    expect((await b.handle(req('town.info', undefined, 'after')))?.ok).toBe(true)
  })
})

describe('error mapping', () => {
  it('never lets an upstream message reach the guest', async () => {
    const leaky = {
      ...townData,
      info: vi.fn(async () => {
        throw new Error('postgres://user:hunter2@10.0.0.4/townsquare timed out')
      }),
    }
    const res = await bridge({ town: leaky }).handle(req('town.info'))
    expect(res).toMatchObject({ ok: false, error: { code: 'unavailable' } })
    const serialized = JSON.stringify(res)
    expect(serialized).not.toContain('postgres')
    expect(serialized).not.toContain('hunter2')
    expect(serialized).not.toContain('10.0.0.4')
  })

  it('only ever returns codes from the closed vocabulary', async () => {
    const calls = [
      req('town.info'),
      req('town.secrets'),
      req('records.list', ['nope']),
      req('app.setTitle', 'x'.repeat(200)),
      req('town.items', { q: 'x'.repeat(300_000) }),
    ]
    const allowed = new Set([
      'not_verified',
      'unauthenticated',
      'permission_denied',
      'rate_limited',
      'not_found',
      'invalid_record',
      'invalid_request',
      'conflict',
      'too_large',
      'unavailable',
    ])
    for (const call of calls) {
      const res = await bridge().handle(call)
      if (res && !res.ok) expect(allowed.has(res.error.code), res.error.code).toBe(true)
    }
  })
})
