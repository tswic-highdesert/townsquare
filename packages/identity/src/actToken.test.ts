import { createHmac } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import {
  ACT_TOKEN_TTL_MS,
  mintActToken,
  shouldRefresh,
  verifyActToken,
  type ActGrants,
} from './actToken.js'

const SECRET = 'test-secret-not-a-real-one'
const NOW = 1_800_000_000_000

const GRANTS: ActGrants = {
  identity: 'handle',
  read: ['flock_camera'],
  write: ['flock_camera'],
  storage: true,
}

function mint(over: Partial<Parameters<typeof mintActToken>[1]> = {}) {
  return mintActToken(SECRET, {
    sub: 'user-1',
    cre: 'creation-1',
    cv: 'version-1',
    town: 'russellville-ar',
    vr: true,
    grants: GRANTS,
    jti: 'jti-1',
    now: NOW,
    ...over,
  })
}

describe('act tokens', () => {
  it('round-trips every claim the bridge decides from', () => {
    const { token } = mint()
    const result = verifyActToken(SECRET, token, { now: NOW })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.claims).toMatchObject({
      iss: 'townsquare',
      aud: 'bridge',
      sub: 'user-1',
      cre: 'creation-1',
      cv: 'version-1',
      town: 'russellville-ar',
      vr: true,
      gr: GRANTS,
      jti: 'jti-1',
    })
    expect(result.claims.exp).toBe(NOW + ACT_TOKEN_TTL_MS)
  })

  it('carries a null subject, because most visitors are not signed in', () => {
    const result = verifyActToken(SECRET, mint({ sub: null }).token, { now: NOW })
    expect(result.ok && result.claims.sub).toBe(null)
  })

  it('rejects a token signed with another secret', () => {
    const { token } = mint()
    expect(verifyActToken('a-different-secret', token, { now: NOW })).toEqual({
      ok: false,
      reason: 'bad_signature',
    })
  })

  it('rejects a widened grant, which is the whole point of signing it', () => {
    const { token } = mint({ grants: { ...GRANTS, write: [] } })
    const [version, body, mac] = token.split('.') as [string, string, string]
    const claims = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'))
    claims.gr.write = ['flock_camera', 'business']
    const forged = Buffer.from(JSON.stringify(claims), 'utf8').toString('base64url')

    expect(verifyActToken(SECRET, `${version}.${forged}.${mac}`, { now: NOW })).toEqual({
      ok: false,
      reason: 'bad_signature',
    })
  })

  it('expires, with a small allowance for clock skew', () => {
    const { token } = mint()
    expect(verifyActToken(SECRET, token, { now: NOW + ACT_TOKEN_TTL_MS + 10_000 }).ok).toBe(true)
    expect(verifyActToken(SECRET, token, { now: NOW + ACT_TOKEN_TTL_MS + 60_000 })).toEqual({
      ok: false,
      reason: 'expired',
    })
  })

  it.each([
    ['not-a-token', 'malformed'],
    ['a.b', 'malformed'],
    ['ts9.abc.def', 'bad_version'],
  ])('rejects %s as %s', (token, reason) => {
    expect(verifyActToken(SECRET, token, { now: NOW })).toEqual({ ok: false, reason })
  })

  it('honours revocation, but only after the signature holds', () => {
    const { token } = mint()
    const seen: string[] = []
    const isRevoked = (jti: string) => {
      seen.push(jti)
      return jti === 'jti-1'
    }

    expect(verifyActToken(SECRET, token, { now: NOW, isRevoked })).toEqual({
      ok: false,
      reason: 'revoked',
    })

    // A forged token must not reach the revocation list at all: consulting it
    // on unverified input would turn the list into an oracle.
    verifyActToken('wrong-secret', token, { now: NOW, isRevoked })
    expect(seen).toEqual(['jti-1'])
  })

  it('asks for a refresh two minutes before it lapses', () => {
    const { claims } = mint()
    expect(shouldRefresh(claims, NOW)).toBe(false)
    expect(shouldRefresh(claims, claims.exp - 3 * 60 * 1000)).toBe(false)
    expect(shouldRefresh(claims, claims.exp - 90 * 1000)).toBe(true)
  })

  it('fails closed on a token missing a claims field', () => {
    // An old token shape surviving a deploy must not read as "no grants
    // declared, therefore nothing denied" anywhere downstream.
    const stale = { iss: 'townsquare', aud: 'bridge', sub: 'u', cre: 'c', exp: NOW + 1000 }
    const body = Buffer.from(JSON.stringify(stale), 'utf8').toString('base64url')
    const mac = createHmac('sha256', SECRET).update(body, 'utf8').digest('base64url')

    expect(verifyActToken(SECRET, `ts1.${body}.${mac}`, { now: NOW })).toEqual({
      ok: false,
      reason: 'malformed',
    })
  })
})
