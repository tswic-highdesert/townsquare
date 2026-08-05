/**
 * The resident's report route over a real socket.
 *
 * The HTTP properties are the point here, and none of them can be checked by
 * calling the handler: that an unverified session gets 403 rather than a silent
 * success, that a duplicate is a 200 saying so rather than a second row, and
 * that the response body carries the reporter's own report and nothing about
 * anyone else's.
 *
 * Verification comes from the session's user on every call, so the test signs
 * people in for real and promotes them the way a vouch would.
 */

import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { Identity, MemoryIdentityStore, type ChallengeDelivery } from '@townsquare/identity'
import { CreationStorage, MemoryStorageStore } from '@townsquare/storage'
import { MemoryReportStore, REPORTS_PER_DAY, Reports } from '@townsquare/review'
import { createIdentityRoutes } from './identityRoutes.js'
import { createReportRoutes } from './reportRoutes.js'

const SHELL_ORIGIN = 'http://townsquare.localhost:5173'
const TOWN = 'russellville-ar'

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
let reportStore: MemoryReportStore
let gallery: Map<string, { id: string; name: string }>
let auth: ReturnType<typeof createIdentityRoutes>
let routes: ReturnType<typeof createReportRoutes>

beforeAll(async () => {
  server = createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://localhost')
    void auth(req, res, url)
      .then((handled) => (handled ? true : routes(req, res, url)))
      .then((handled) => {
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

beforeEach(() => {
  store = new MemoryIdentityStore()
  delivery = new Captured()
  identity = new Identity({ store, delivery })
  reportStore = new MemoryReportStore()
  gallery = new Map([['flock-map', { id: 'creation-1', name: 'Flock camera map' }]])

  auth = createIdentityRoutes({
    identity,
    store,
    storage: new CreationStorage({ store: new MemoryStorageStore() }),
    creations: () => [],
    shellOrigin: SHELL_ORIGIN,
    townId: TOWN,
    actSecret: 'test-act-secret',
  })
  routes = createReportRoutes({
    identity,
    reports: new Reports({
      reports: reportStore,
      targets: {
        async creationBySlug(_townId, slug) {
          return gallery.get(slug) ?? null
        },
      },
    }),
    shellOrigin: SHELL_ORIGIN,
    townId: TOWN,
  })
})

async function post(path: string, body: unknown, cookie?: string) {
  return fetch(base + path, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Origin: SHELL_ORIGIN,
      ...(cookie ? { Cookie: cookie } : {}),
    },
    body: JSON.stringify(body),
  })
}

async function signedIn(handle: string, verified = false): Promise<string> {
  await post('/api/auth/signup', { handle, email: `${handle}@example.com` })
  const res = await post('/api/auth/confirm', { token: delivery.last })
  if (verified) {
    const user = (await store.userByHandle(handle))!
    await store.updateUser(
      user.id,
      { verifiedResident: true, verifiedMethod: 'manual', verifiedAt: Date.now() },
      Date.now(),
    )
  }
  return res.headers.get('set-cookie')!.split(';')[0]!
}

function report(cookie: string | undefined, body: Record<string, unknown> = {}) {
  return post('/api/reports', { slug: 'flock-map', reason: 'broken', ...body }, cookie)
}

describe('who can file over HTTP', () => {
  it('turns away someone with no session', async () => {
    const res = await report(undefined)
    expect(res.status).toBe(401)
    expect(await reportStore.open(TOWN)).toHaveLength(0)
  })

  it('turns away a signed-in but unverified account', async () => {
    const cookie = await signedIn('drifter')
    const res = await report(cookie)
    expect(res.status).toBe(403)
    expect(JSON.stringify(await res.json())).toContain('verified residents')
    expect(await reportStore.open(TOWN)).toHaveLength(0)
  })

  it('takes one from a verified resident', async () => {
    const cookie = await signedIn('dana', true)
    const res = await report(cookie, { reason: 'illegal', detail: 'see the map', version: '1.2.0' })

    expect(res.status).toBe(200)
    const body = (await res.json()) as {
      report: { id: string; reason: string; targetLabel: string }
      duplicate: boolean
    }
    expect(body.duplicate).toBe(false)
    expect(body.report).toMatchObject({ reason: 'illegal', targetLabel: 'Flock camera map' })
    // The reporter learns nothing about anyone else's report, or about the
    // queue this landed in. A report that reports back is a public signal, and
    // a public signal is worth manufacturing.
    expect(Object.keys(body.report).sort()).toEqual(['createdAt', 'id', 'reason', 'targetLabel'])
  })

  it('reads verification fresh, so a vouch granted a minute ago counts', async () => {
    const cookie = await signedIn('sam')
    expect((await report(cookie)).status).toBe(403)

    const user = (await store.userByHandle('sam'))!
    await store.updateUser(
      user.id,
      { verifiedResident: true, verifiedMethod: 'vouch', verifiedAt: Date.now() },
      Date.now(),
    )
    expect((await report(cookie)).status).toBe(200)
  })
})

describe('what the route refuses', () => {
  it('refuses a reason nobody defined', async () => {
    const cookie = await signedIn('dana', true)
    const res = await report(cookie, { reason: 'i-dont-like-them' })
    expect(res.status).toBe(400)
    expect(await reportStore.open(TOWN)).toHaveLength(0)
  })

  it('answers 404 for a creation that is not in the gallery', async () => {
    const cookie = await signedIn('dana', true)
    const res = await report(cookie, { slug: 'never-existed' })
    expect(res.status).toBe(404)
  })

  it('refuses a report posted from another origin', async () => {
    const cookie = await signedIn('dana', true)
    const res = await fetch(base + '/api/reports', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: 'https://evil.example', Cookie: cookie },
      body: JSON.stringify({ slug: 'flock-map', reason: 'spam' }),
    })
    expect(res.status).toBe(403)
    expect(await reportStore.open(TOWN)).toHaveLength(0)
  })

  it('has no GET, so there is nothing to read here', async () => {
    const cookie = await signedIn('dana', true)
    await report(cookie)
    const res = await fetch(base + '/api/reports', { headers: { Cookie: cookie } })
    expect(res.status).toBe(404)
  })
})

describe('reporting cannot be used to spam', () => {
  it('answers a duplicate with the first report rather than a second row', async () => {
    const cookie = await signedIn('dana', true)
    const first = (await (await report(cookie)).json()) as { report: { id: string } }

    const again = await report(cookie, { reason: 'spam', detail: 'and again' })
    expect(again.status).toBe(200)
    const body = (await again.json()) as { report: { id: string }; duplicate: boolean }
    expect(body.duplicate).toBe(true)
    expect(body.report.id).toBe(first.report.id)
    expect(await reportStore.open(TOWN)).toHaveLength(1)
  })

  it('stops one resident filing against the whole gallery in an afternoon', async () => {
    const cookie = await signedIn('dana', true)
    for (let n = 0; n < REPORTS_PER_DAY; n++) {
      gallery.set(`filler-${n}`, { id: `filler-${n}`, name: `Filler ${n}` })
      expect((await report(cookie, { slug: `filler-${n}` })).status).toBe(200)
    }

    const capped = await report(cookie)
    expect(capped.status).toBe(409)
    expect(JSON.stringify(await capped.json())).toContain('daily limit')
  })

  it('caps the resident, not the town', async () => {
    const dana = await signedIn('dana', true)
    for (let n = 0; n < REPORTS_PER_DAY; n++) {
      gallery.set(`filler-${n}`, { id: `filler-${n}`, name: `Filler ${n}` })
      await report(dana, { slug: `filler-${n}` })
    }

    const kim = await signedIn('kim', true)
    expect((await report(kim)).status).toBe(200)
  })
})
