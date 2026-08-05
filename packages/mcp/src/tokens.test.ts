import { describe, expect, it } from 'vitest'
import { hashSecret } from '@townsquare/identity'
import {
  MemoryMcpTokenStore,
  TOKEN_PREFIX,
  TOKEN_TTL_MS,
  authenticateToken,
  mintToken,
  parseToken,
  shouldTouch,
} from './tokens.js'

const NOW = 1_700_000_000_000

describe('token shape', () => {
  it('is prefixed so a secret scanner can recognise it', async () => {
    const store = new MemoryMcpTokenStore()
    const { token } = await mintToken(store, { userId: 'u1', label: 'laptop' }, NOW)
    expect(token.startsWith(TOKEN_PREFIX)).toBe(true)
  })

  it('splits into a public id and a secret at fixed widths', async () => {
    const store = new MemoryMcpTokenStore()
    const { token, record } = await mintToken(store, { userId: 'u1', label: 'laptop' }, NOW)
    const parsed = parseToken(token)
    expect(parsed?.id).toBe(record.id)
    expect(parsed?.secret).toHaveLength(43)
  })

  it('stores only the hash', async () => {
    const store = new MemoryMcpTokenStore()
    const { token, record } = await mintToken(store, { userId: 'u1', label: 'laptop' }, NOW)
    const secret = parseToken(token)!.secret
    expect(record.secretHash).toBe(hashSecret(secret))
    expect(record.secretHash).not.toContain(secret)
    // The whole row, serialised, must not contain the credential anywhere.
    expect(JSON.stringify(record)).not.toContain(secret)
  })

  it.each([
    ['', 'empty'],
    ['nope', 'no prefix'],
    [`${TOKEN_PREFIX}short`, 'too short'],
    [`${TOKEN_PREFIX}${'a'.repeat(56)}`, 'wrong length'],
    [`${TOKEN_PREFIX}${'a'.repeat(54)}!!`, 'illegal characters'],
  ])('refuses %s (%s) without touching the store', (raw) => {
    expect(parseToken(raw)).toBeNull()
  })
})

describe('authentication', () => {
  it('accepts a freshly minted token', async () => {
    const store = new MemoryMcpTokenStore()
    const { token } = await mintToken(store, { userId: 'u1', label: 'laptop' }, NOW)
    const result = await authenticateToken(store, token, NOW)
    expect(result.ok).toBe(true)
  })

  it('refuses a valid id carrying the wrong secret', async () => {
    const store = new MemoryMcpTokenStore()
    const { token, record } = await mintToken(store, { userId: 'u1', label: 'laptop' }, NOW)
    const forged = `${TOKEN_PREFIX}${record.id}${'A'.repeat(43)}`
    expect(forged).not.toBe(token)
    const result = await authenticateToken(store, forged, NOW)
    expect(result).toEqual({ ok: false, reason: 'unknown' })
  })

  it('gives the same answer for an unknown id as for a wrong secret', async () => {
    const store = new MemoryMcpTokenStore()
    const missing = await authenticateToken(
      store,
      `${TOKEN_PREFIX}${'b'.repeat(12)}${'c'.repeat(43)}`,
      NOW,
    )
    expect(missing).toEqual({ ok: false, reason: 'unknown' })
  })

  it('refuses a revoked token', async () => {
    const store = new MemoryMcpTokenStore()
    const { token, record } = await mintToken(store, { userId: 'u1', label: 'laptop' }, NOW)
    await store.revokeToken(record.id, NOW + 1)
    expect(await authenticateToken(store, token, NOW + 2)).toEqual({ ok: false, reason: 'revoked' })
  })

  it('refuses an expired token', async () => {
    const store = new MemoryMcpTokenStore()
    const { token } = await mintToken(store, { userId: 'u1', label: 'laptop' }, NOW)
    expect(await authenticateToken(store, token, NOW + TOKEN_TTL_MS + 1)).toEqual({
      ok: false,
      reason: 'expired',
    })
  })

  it('refuses a missing credential before it looks anything up', async () => {
    const store = new MemoryMcpTokenStore()
    expect(await authenticateToken(store, undefined, NOW)).toEqual({ ok: false, reason: 'missing' })
    expect(await authenticateToken(store, 'Bearer nonsense', NOW)).toEqual({
      ok: false,
      reason: 'malformed',
    })
  })
})

describe('last-used bookkeeping', () => {
  it('writes at most once an hour', async () => {
    const store = new MemoryMcpTokenStore()
    const { record } = await mintToken(store, { userId: 'u1', label: 'laptop' }, NOW)
    expect(shouldTouch(record, NOW)).toBe(true)

    await store.touchToken(record.id, NOW)
    const touched = (await store.tokenById(record.id))!
    expect(shouldTouch(touched, NOW + 60_000)).toBe(false)
    expect(shouldTouch(touched, NOW + 2 * 60 * 60 * 1000)).toBe(true)
  })
})
