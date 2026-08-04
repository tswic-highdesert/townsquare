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
import { CreationStorage, MemoryStorageStore, MAX_TOTAL_BYTES } from '@townsquare/storage'
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
let storage: CreationStorage

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
  storage = new CreationStorage({ store: new MemoryStorageStore() })
  routes = createIdentityRoutes({
    identity,
    store,
    storage,
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

describe('storage over the bridge', () => {
  /** Sign in, then exchange the session for an act token. */
  async function actAs(handle: string, email: string): Promise<string> {
    const cookie = await signedIn(handle, email)
    const res = await post('/api/creations/burrito-index/act', {}, { headers: { cookie } })
    return ((await res.json()) as { token: string }).token
  }

  function get(token: string, key: string) {
    return fetch(`${base}/api/bridge/storage?key=${encodeURIComponent(key)}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
  }

  function put(token: string, body: unknown) {
    return fetch(`${base}/api/bridge/storage`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
  }

  beforeEach(() => {
    creations = catalogue({ storage: true })
  })

  it('round-trips a value', async () => {
    const token = await actAs('tswic', 'tal@example.com')

    expect((await put(token, { key: 'filters', value: { showInactive: false } })).status).toBe(200)
    expect(await (await get(token, 'filters')).json()).toEqual({
      found: true,
      value: { showInactive: false },
    })
  })

  it('reports an unset key as absent rather than as an error', async () => {
    const token = await actAs('tswic', 'tal@example.com')
    const res = await get(token, 'never-set')
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ found: false, value: null })
  })

  it('removes a key when the value is absent from the body', async () => {
    const token = await actAs('tswic', 'tal@example.com')
    await put(token, { key: 'filters', value: 1 })
    await put(token, { key: 'filters' })
    expect(await (await get(token, 'filters')).json()).toMatchObject({ found: false })
  })

  it('scopes rows to the token, so one resident cannot read another', async () => {
    // Threat model #17. Neither request names a user or a creation anywhere:
    // the scope is derived from the act token and there is no parameter that
    // could address someone else's row.
    const alice = await actAs('alice', 'alice@example.com')
    const bob = await actAs('bob', 'bob@example.com')

    await put(alice, { key: 'filters', value: 'alice only' })
    expect(await (await get(bob, 'filters')).json()).toEqual({ found: false, value: null })
  })

  it('refuses a creation that never declared storage', async () => {
    creations = catalogue({ identity: 'handle' })
    const token = await actAs('tswic', 'tal@example.com')

    expect((await get(token, 'filters')).status).toBe(403)
    expect((await put(token, { key: 'filters', value: 1 })).status).toBe(403)
  })

  it('refuses an anonymous token, because there is nobody to store against', async () => {
    const res = await post('/api/creations/burrito-index/act', {})
    const { token } = (await res.json()) as { token: string }
    expect((await get(token, 'filters')).status).toBe(401)
  })

  it('enforces the quota, and says what to do about it', async () => {
    const token = await actAs('tswic', 'tal@example.com')
    await put(token, { key: 'big', value: 'x'.repeat(MAX_TOTAL_BYTES - 100) })

    const res = await put(token, { key: 'more', value: 'x'.repeat(500) })
    expect(res.status).toBe(413)
    expect(((await res.json()) as { message: string }).message).toContain('Remove a key first')
  })

  it('rejects a malformed key', async () => {
    const token = await actAs('tswic', 'tal@example.com')
    expect((await put(token, { key: 'has space', value: 1 })).status).toBe(400)
    expect((await put(token, { key: 42, value: 1 })).status).toBe(400)
    expect((await get(token, '../escape')).status).toBe(400)
  })

  it('does not authenticate from a session cookie', async () => {
    const cookie = await signedIn()
    const res = await fetch(`${base}/api/bridge/storage?key=filters`, { headers: { cookie } })
    expect(res.status).toBe(401)
  })
})
