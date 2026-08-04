/**
 * The auth routes over a real socket.
 *
 * Called through `fetch` against a listening server rather than by invoking
 * the handler with a fake request, because the properties worth testing here
 * are HTTP properties: which routes read a cookie, what `Set-Cookie` actually
 * says, whether a bridge call authenticated by a session would work. A handler
 * called directly cannot be wrong about any of those, which is exactly why
 * testing it that way proves nothing.
 */

import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { parseManifest, type Manifest } from '@townsquare/manifest'
import {
  Identity,
  MemoryIdentityStore,
  mintActToken,
  seedCohort,
  type ChallengeDelivery,
} from '@townsquare/identity'
import type { CatalogueEntry } from '@townsquare/sandbox'
import { createIdentityRoutes } from './identityRoutes.js'

const SHELL_ORIGIN = 'http://townsquare.localhost:5173'
const ACT_SECRET = 'test-act-secret'

function manifest(permissions: Record<string, unknown>): Manifest {
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
  })
  if (!parsed.ok) throw new Error(JSON.stringify(parsed.issues))
  return parsed.manifest
}

function catalogue(permissions: Record<string, unknown>): CatalogueEntry[] {
  return [
    {
      originKey: 'a7k2m9x4',
      creationId: 'creation-1',
      versionId: 'version-1',
      townId: 'russellville-ar',
      name: 'The Burrito Index',
      slug: 'burrito-index',
      manifest: manifest(permissions),
      status: 'active',
    },
  ]
}

class Captured implements ChallengeDelivery {
  tokens: string[] = []
  async deliver(input: { token: string }): Promise<void> {
    this.tokens.push(input.token)
  }
  get last(): string {
    return this.tokens[this.tokens.length - 1]!
  }
}

let server: Server
let base: string
let store: MemoryIdentityStore
let identity: Identity
let delivery: Captured
let creations: CatalogueEntry[]

beforeAll(async () => {
  server = createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://localhost')
    void routes(req, res, url).then((handled) => {
      if (!handled) {
        res.writeHead(404, { 'Content-Type': 'application/json' })
        res.end('{"error":"not_found"}')
      }
    })
  })

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
})

afterAll(() => {
  server.close()
})

// Rebuilt per test, and closed over by the handler above so each test gets a
// clean town without restarting the listener.
let routes: ReturnType<typeof createIdentityRoutes>

beforeEach(() => {
  store = new MemoryIdentityStore()
  delivery = new Captured()
  identity = new Identity({ store, delivery })
  creations = catalogue({ identity: 'handle' })
  routes = createIdentityRoutes({
    identity,
    store,
    creations: () => creations,
    shellOrigin: SHELL_ORIGIN,
    townId: 'russellville-ar',
    actSecret: ACT_SECRET,
  })
})

async function post(path: string, body: unknown, init: RequestInit = {}) {
  return fetch(base + path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: SHELL_ORIGIN, ...(init.headers ?? {}) },
    body: JSON.stringify(body),
    ...init,
  })
}

/** Sign up, redeem the emailed token, and hand back the session cookie. */
async function signedIn(handle = 'tswic', email = 'tal@example.com'): Promise<string> {
  await post('/api/auth/signup', { handle, email })
  const res = await post('/api/auth/confirm', { token: delivery.last })
  const cookie = res.headers.get('set-cookie')
  if (!cookie) throw new Error('no session cookie')
  return cookie.split(';')[0]!
}

describe('the session cookie', () => {
  it('is HttpOnly, Lax and path-scoped', async () => {
    await post('/api/auth/signup', { handle: 'tswic', email: 'tal@example.com' })
    const res = await post('/api/auth/confirm', { token: delivery.last })
    const cookie = res.headers.get('set-cookie') ?? ''

    expect(cookie).toContain('HttpOnly')
    expect(cookie).toContain('SameSite=Lax')
    expect(cookie).toContain('Path=/')
    // Plain-http development cannot satisfy `Secure`, which `__Host-` requires.
    expect(cookie).not.toContain('__Host-')
  })

  it('is what /api/auth/me answers from, and nothing else', async () => {
    const cookie = await signedIn()

    expect(await (await fetch(`${base}/api/auth/me`)).json()).toBe(null)
    const mine = await (await fetch(`${base}/api/auth/me`, { headers: { cookie } })).json()
    expect(mine).toMatchObject({ handle: 'tswic', verified: false, canSubmit: false })
  })

  it('never carries an email in any response', async () => {
    const cookie = await signedIn()
    const body = await (await fetch(`${base}/api/auth/me`, { headers: { cookie } })).text()
    expect(body).not.toContain('example.com')
  })

  it('stops working after sign-out', async () => {
    const cookie = await signedIn()
    await post('/api/auth/signout', {}, { headers: { cookie } })
    expect(await (await fetch(`${base}/api/auth/me`, { headers: { cookie } })).json()).toBe(null)
  })
})

describe('cross-origin writes', () => {
  it('are refused outright when the Origin is wrong', async () => {
    const res = await post(
      '/api/auth/signup',
      { handle: 'tswic', email: 'tal@example.com' },
      { headers: { Origin: 'https://evil.example' } },
    )
    expect(res.status).toBe(403)
    expect(delivery.tokens).toHaveLength(0)
  })
})

describe('the act endpoint', () => {
  it('mints a token scoped to the creation, version and grants', async () => {
    const cookie = await signedIn()
    const res = await post('/api/creations/burrito-index/act', {}, { headers: { cookie } })
    const body = (await res.json()) as { token: string; expiresAt: number }

    const [, payload] = body.token.split('.') as [string, string]
    const claims = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'))

    expect(claims).toMatchObject({
      aud: 'bridge',
      cre: 'creation-1',
      cv: 'version-1',
      town: 'russellville-ar',
      gr: { identity: 'handle', read: [], write: [], storage: false },
    })
    expect(claims.sub).toEqual(expect.any(String))
  })

  it('mints an anonymous token with no session, because reading is anonymous', async () => {
    const res = await post('/api/creations/burrito-index/act', {})
    const body = (await res.json()) as { token: string }
    const claims = JSON.parse(
      Buffer.from(body.token.split('.')[1]!, 'base64url').toString('utf8'),
    )
    expect(claims.sub).toBe(null)
    expect(claims.vr).toBe(false)
  })

  it('carries the verification state the grant will be checked against', async () => {
    await seedCohort(store, [{ handle: 'first', email: 'first@example.com' }], Date.now())
    await post('/api/auth/signin', { email: 'first@example.com' })
    const confirmed = await post('/api/auth/confirm', { token: delivery.last })
    const cookie = confirmed.headers.get('set-cookie')!.split(';')[0]!

    const res = await post('/api/creations/burrito-index/act', {}, { headers: { cookie } })
    const body = (await res.json()) as { token: string }
    const claims = JSON.parse(Buffer.from(body.token.split('.')[1]!, 'base64url').toString('utf8'))
    expect(claims.vr).toBe(true)
  })

  it('refuses a creation that is not active', async () => {
    creations = creations.map((c) => ({ ...c, status: 'blocked' as const }))
    expect((await post('/api/creations/burrito-index/act', {})).status).toBe(404)
  })
})

describe('the bridge', () => {
  async function actToken(cookie?: string) {
    const res = await post(
      '/api/creations/burrito-index/act',
      {},
      cookie ? { headers: { cookie } } : {},
    )
    return ((await res.json()) as { token: string }).token
  }

  it('answers /me with exactly the handle and the verification, nothing more', async () => {
    const cookie = await signedIn()
    const token = await actToken(cookie)

    const res = await fetch(`${base}/api/bridge/me`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    expect(await res.json()).toEqual({ handle: 'tswic', verified: false })
  })

  it('does not authenticate from a session cookie', async () => {
    // The one property the whole act-token design exists for. A bridge route
    // that accepted a cookie would work, look fine, and have turned a
    // fifteen-minute creation-scoped grant back into an account session.
    const cookie = await signedIn()
    const res = await fetch(`${base}/api/bridge/me`, { headers: { cookie } })
    expect(res.status).toBe(401)
  })

  it('refuses a token the creation was not granted identity for', async () => {
    creations = catalogue({})
    const cookie = await signedIn()
    const token = await actToken(cookie)

    const res = await fetch(`${base}/api/bridge/me`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    // Enforced server side from the token's own claims, independently of the
    // host's check, which is only there for a fast error message.
    expect(res.status).toBe(403)
  })

  it('answers null for an anonymous token rather than failing', async () => {
    const res = await fetch(`${base}/api/bridge/me`, {
      headers: { Authorization: `Bearer ${await actToken()}` },
    })
    expect(await res.json()).toBe(null)
  })

  it('refuses a token signed with another key', async () => {
    const forged = mintActToken('some-other-secret', {
      sub: null,
      cre: 'creation-1',
      cv: 'version-1',
      town: 'russellville-ar',
      vr: true,
      grants: { identity: 'handle', read: [], write: [], storage: false },
      jti: 'forged',
      now: Date.now(),
    })
    const res = await fetch(`${base}/api/bridge/me`, {
      headers: { Authorization: `Bearer ${forged.token}` },
    })
    expect(res.status).toBe(401)
  })

  it('refuses a revoked token', async () => {
    const cookie = await signedIn()
    const token = await actToken(cookie)
    const claims = JSON.parse(Buffer.from(token.split('.')[1]!, 'base64url').toString('utf8'))
    await store.revokeActToken(claims.jti, 'creation blocked', claims.exp, Date.now())

    const res = await fetch(`${base}/api/bridge/me`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    expect(res.status).toBe(401)
  })
})

describe('vouching over HTTP', () => {
  it('verifies the vouchee and returns the voucher’s updated budget', async () => {
    await seedCohort(store, [{ handle: 'first', email: 'first@example.com' }], Date.now())
    await post('/api/auth/signin', { email: 'first@example.com' })
    const confirmed = await post('/api/auth/confirm', { token: delivery.last })
    const cookie = confirmed.headers.get('set-cookie')!.split(';')[0]!

    await post('/api/auth/signup', { handle: 'newcomer', email: 'new@example.com' })

    const res = await post('/api/auth/vouch', { handle: 'newcomer' }, { headers: { cookie } })
    expect(await res.json()).toMatchObject({
      vouchee: { handle: 'newcomer', verified: true },
      account: { handle: 'first', vouches: { available: 9, used: 1 } },
    })
  })

  it('refuses an unverified voucher with a 403', async () => {
    const cookie = await signedIn()
    await post('/api/auth/signup', { handle: 'newcomer', email: 'new@example.com' })
    const res = await post('/api/auth/vouch', { handle: 'newcomer' }, { headers: { cookie } })
    expect(res.status).toBe(403)
  })

  it('needs a session at all', async () => {
    expect((await post('/api/auth/vouch', { handle: 'newcomer' })).status).toBe(401)
  })
})

describe('what the routes refuse to disclose', () => {
  it('answers a sign-in for an unknown address exactly as it answers a known one', async () => {
    const unknown = await post('/api/auth/signin', { email: 'nobody@example.com' })
    await signedIn()
    const known = await post('/api/auth/signin', { email: 'tal@example.com' })

    expect(unknown.status).toBe(known.status)
    expect(await unknown.json()).toEqual(await known.json())
  })

  it('says nothing about why an act token failed', async () => {
    const res = await fetch(`${base}/api/bridge/me`, {
      headers: { Authorization: 'Bearer ts1.nonsense.nonsense' },
    })
    const body = await res.text()
    for (const leak of ['signature', 'expired', 'malformed', 'revoked']) {
      expect(body).not.toContain(leak)
    }
  })
})
