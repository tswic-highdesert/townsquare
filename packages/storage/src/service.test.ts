import { beforeEach, describe, expect, it } from 'vitest'
import { checkKey, measureValue, MAX_KEYS, MAX_TOTAL_BYTES } from './limits.js'
import { CreationStorage } from './service.js'
import { MemoryStorageStore } from './store.js'

const ALICE = { creationId: 'creation-a', userId: 'user-alice' }
const BOB = { creationId: 'creation-a', userId: 'user-bob' }
const OTHER_APP = { creationId: 'creation-b', userId: 'user-alice' }

let store: MemoryStorageStore
let storage: CreationStorage
let now: number

beforeEach(() => {
  store = new MemoryStorageStore()
  now = 1_800_000_000_000
  storage = new CreationStorage({ store, now: () => now })
})

describe('keys', () => {
  it('accepts the shapes an app actually uses', () => {
    for (const key of ['filters', 'map.center', 'view:2026', 'last_seen-id']) {
      expect(checkKey(key).ok, key).toBe(true)
    }
  })

  it.each([
    ['', 'empty'],
    ['a'.repeat(129), 'too_long'],
    ['has space', 'bad_characters'],
    ['nested/path', 'bad_characters'],
    ['../escape', 'bad_characters'],
  ])('rejects %s', (key, problem) => {
    const result = checkKey(key)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.problem).toBe(problem)
  })

  it('rejects a non-string, which is what a guest sends by accident', () => {
    for (const key of [null, undefined, 42, {}, ['filters']]) {
      expect(checkKey(key).ok).toBe(false)
    }
  })
})

describe('values', () => {
  it('measures the serialized form, not the object', () => {
    expect(measureValue({ a: 1 })).toMatchObject({ ok: true, bytes: 7 })
  })

  it('returns the value as it will come back out', () => {
    // Storing something that reads back differently tomorrow is worse than
    // refusing it today.
    const result = measureValue({ when: new Date(0), keep: 'yes' })
    expect(result.ok && result.value).toEqual({ when: '1970-01-01T00:00:00.000Z', keep: 'yes' })
  })

  it.each([
    ['a cycle', () => { const o: Record<string, unknown> = {}; o['self'] = o; return o }],
    ['a bigint', () => ({ n: 1n })],
    ['a bare function', () => () => 1],
    ['undefined', () => undefined],
  ])('refuses %s rather than storing something else', (_label, make) => {
    expect(measureValue(make())).toMatchObject({ ok: false, problem: 'unserializable' })
  })
})

describe('get and set', () => {
  it('round-trips a value', async () => {
    await storage.set(ALICE, 'filters', { showInactive: false })
    expect(await storage.get(ALICE, 'filters')).toEqual({
      ok: true,
      value: { showInactive: false },
      found: true,
    })
  })

  it('answers undefined for an unset key, and calls it a success', async () => {
    // First run is the normal path, not an error condition.
    expect(await storage.get(ALICE, 'never-set')).toEqual({
      ok: true,
      value: undefined,
      found: false,
    })
  })

  it('stores null as a value, distinct from unset', async () => {
    await storage.set(ALICE, 'dismissed', null)
    expect(await storage.get(ALICE, 'dismissed')).toEqual({ ok: true, value: null, found: true })
  })

  it('removes a key when set to undefined, which is the only way back under quota', async () => {
    await storage.set(ALICE, 'filters', { showInactive: false })
    await storage.set(ALICE, 'filters', undefined)

    expect(await storage.get(ALICE, 'filters')).toMatchObject({ found: false })
    expect(await storage.usage(ALICE)).toMatchObject({ bytes: 0, keys: 0 })
  })

  it('rejects a malformed key before touching the store', async () => {
    expect(await storage.set(ALICE, 'has space', 1)).toMatchObject({ code: 'invalid_request' })
    expect(await storage.usage(ALICE)).toMatchObject({ keys: 0 })
  })
})

describe('the scope is the security property', () => {
  it('keeps two residents of the same creation apart', async () => {
    await storage.set(ALICE, 'filters', 'alice')
    await storage.set(BOB, 'filters', 'bob')

    expect(await storage.get(ALICE, 'filters')).toMatchObject({ value: 'alice' })
    expect(await storage.get(BOB, 'filters')).toMatchObject({ value: 'bob' })
  })

  it('keeps two creations of the same resident apart', async () => {
    await storage.set(ALICE, 'filters', 'in app A')
    expect(await storage.get(OTHER_APP, 'filters')).toMatchObject({ found: false })
  })

  it('charges quota per creation and per user, not globally', async () => {
    await storage.set(ALICE, 'a', 'x'.repeat(1000))
    expect((await storage.usage(ALICE)).bytes).toBeGreaterThan(1000)
    expect(await storage.usage(BOB)).toMatchObject({ bytes: 0, keys: 0 })
    expect(await storage.usage(OTHER_APP)).toMatchObject({ bytes: 0, keys: 0 })
  })
})

describe('quota', () => {
  it('refuses a write that would go over the byte ceiling', async () => {
    const big = 'x'.repeat(MAX_TOTAL_BYTES - 100)
    expect((await storage.set(ALICE, 'first', big)).ok).toBe(true)

    const result = await storage.set(ALICE, 'second', 'x'.repeat(500))
    expect(result).toMatchObject({ ok: false, code: 'too_large' })
    // And nothing was written: a partial success here would be worse than a
    // refusal, because the app would believe both keys are present.
    expect(await storage.get(ALICE, 'second')).toMatchObject({ found: false })
  })

  it('lets an app rewrite one key forever, which is what apps actually do', async () => {
    const value = 'x'.repeat(MAX_TOTAL_BYTES - 100)
    for (let i = 0; i < 5; i++) {
      expect((await storage.set(ALICE, 'state', value)).ok, `write ${i}`).toBe(true)
    }
    expect((await storage.usage(ALICE)).keys).toBe(1)
  })

  it('frees the space again when a key is removed', async () => {
    await storage.set(ALICE, 'first', 'x'.repeat(MAX_TOTAL_BYTES - 100))
    await storage.set(ALICE, 'first', undefined)
    expect((await storage.set(ALICE, 'second', 'x'.repeat(1000))).ok).toBe(true)
  })

  it('bounds the number of keys, not only the bytes', async () => {
    for (let i = 0; i < MAX_KEYS; i++) {
      expect((await storage.set(ALICE, `k${i}`, 1)).ok, `key ${i}`).toBe(true)
    }
    expect(await storage.set(ALICE, 'one-too-many', 1)).toMatchObject({
      ok: false,
      code: 'too_large',
    })
    // Overwriting an existing key still works at the ceiling.
    expect((await storage.set(ALICE, 'k0', 2)).ok).toBe(true)
  })

  it('refuses a single value larger than the whole allowance', async () => {
    expect(await storage.set(ALICE, 'huge', 'x'.repeat(MAX_TOTAL_BYTES + 1))).toMatchObject({
      ok: false,
      code: 'too_large',
    })
  })

  it('reports usage against the documented ceilings', async () => {
    await storage.set(ALICE, 'filters', { showInactive: false })
    expect(await storage.usage(ALICE)).toEqual({
      bytes: 22,
      keys: 1,
      maxBytes: MAX_TOTAL_BYTES,
      maxKeys: MAX_KEYS,
    })
  })
})
