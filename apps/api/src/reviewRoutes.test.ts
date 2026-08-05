/**
 * The reviewer's routes over a real socket.
 *
 * The property that matters most here is the one a unit test cannot check: an
 * ordinary resident with a perfectly good session must not be able to reach the
 * queue, read a neighbour's unreviewed source, or approve anything — and must
 * not learn from the response that a queue exists at all.
 */

import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { Identity, MemoryIdentityStore, type ChallengeDelivery } from '@townsquare/identity'
import { bundleDigest, hashFiles, type BundleFile } from '@townsquare/bundle'
import { BundleStorePublisher, MemoryBundleStore } from '@townsquare/sandbox'
import { parseManifest } from '@townsquare/manifest'
import {
  MemoryCreationStore,
  MemoryRecordTypeStore,
  MemorySubmissionStore,
  Review,
} from '@townsquare/review'
import { CreationStorage, MemoryStorageStore } from '@townsquare/storage'
import { createIdentityRoutes } from './identityRoutes.js'
import { createReviewRoutes } from './reviewRoutes.js'

const SHELL_ORIGIN = 'http://townsquare.localhost:5173'
const TOWN = 'russellville-ar'
const enc = new TextEncoder()

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
let review: Review
let bundles: MemoryBundleStore
let auth: ReturnType<typeof createIdentityRoutes>
let routes: ReturnType<typeof createReviewRoutes>

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
  bundles = new MemoryBundleStore()
  review = new Review({
    submissions: new MemorySubmissionStore(),
    creations: new MemoryCreationStore(),
    recordTypes: new MemoryRecordTypeStore(),
    publisher: new BundleStorePublisher({
      store: bundles,
      origin: { appsDomain: 'tsq-apps.localhost', scheme: 'http', port: 3031 },
      shellOrigins: [SHELL_ORIGIN],
    }),
  })
  auth = createIdentityRoutes({
    identity,
    store,
    storage: new CreationStorage({ store: new MemoryStorageStore() }),
    creations: () => [],
    shellOrigin: SHELL_ORIGIN,
    townId: TOWN,
    actSecret: 'test-act-secret',
  })
  routes = createReviewRoutes({ identity, review, shellOrigin: SHELL_ORIGIN, townId: TOWN })
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

async function signedIn(handle: string, role?: 'moderator' | 'admin'): Promise<string> {
  await post('/api/auth/signup', { handle, email: `${handle}@example.com` })
  const res = await post('/api/auth/confirm', { token: delivery.last })
  if (role) {
    const user = (await store.userByHandle(handle))!
    await store.updateUser(user.id, { role }, Date.now())
  }
  return res.headers.get('set-cookie')!.split(';')[0]!
}

async function queueOne(userId = 'builder-1') {
  const parsed = parseManifest({
    manifest_version: 1,
    sdk: 1,
    name: 'Hello',
    tagline: 'A very small creation',
    description: 'Exists so the review routes have something real to answer with.',
    version: '1.0.0',
    entry: 'index.html',
    icon: 'icon.svg',
  })
  if (!parsed.ok) throw new Error('bad fixture manifest')
  const files = new Map<string, Uint8Array>([
    ['townsquare.json', enc.encode(JSON.stringify(parsed.manifest, null, 2))],
    ['index.html', enc.encode('<!doctype html>\n<html><body><h1>Hello</h1></body></html>\n')],
    ['icon.svg', enc.encode('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1 1"/>\n')],
  ])
  const list: BundleFile[] = [...files].map(([path, bytes]) => ({ path, bytes }))
  return review.submit({
    townId: TOWN,
    userId,
    handle: 'builder',
    creationId: null,
    proposedSlug: 'hello',
    name: 'Hello',
    version: '1.0.0',
    manifest: parsed.manifest,
    entry: 'index.html',
    bundleDigest: bundleDigest(hashFiles(list)),
    files,
    warnings: [],
  })
}

describe('who can see the queue', () => {
  it('turns away someone with no session', async () => {
    const res = await fetch(base + '/api/review/queue')
    expect(res.status).toBe(401)
  })

  it('tells an ordinary resident the route does not exist', async () => {
    const cookie = await signedIn('resident')
    const res = await fetch(base + '/api/review/queue', { headers: { Cookie: cookie } })
    // 404, not 403: how much is pending and whose work is in it are not things
    // the town gets to learn by asking.
    expect(res.status).toBe(404)
    expect(await res.json()).toEqual({ error: 'not_found' })
  })

  it('answers a moderator', async () => {
    await queueOne()
    const cookie = await signedIn('tswic', 'admin')
    const res = await fetch(base + '/api/review/queue', { headers: { Cookie: cookie } })
    expect(res.status).toBe(200)
    const body = (await res.json()) as { items: Array<{ name: string }> }
    expect(body.items.map((i) => i.name)).toEqual(['Hello'])
  })

  it('does not hand unreviewed source to an ordinary resident', async () => {
    const submission = await queueOne()
    const cookie = await signedIn('resident')
    const res = await fetch(base + `/api/review/submissions/${submission.id}`, {
      headers: { Cookie: cookie },
    })
    expect(res.status).toBe(404)
    expect(await res.text()).not.toContain('doctype')
  })
})

describe('deciding over HTTP', () => {
  it('refuses a decision from a resident, and publishes nothing', async () => {
    const submission = await queueOne()
    const cookie = await signedIn('resident')
    const res = await post(
      `/api/review/submissions/${submission.id}/decide`,
      { decision: 'approve', note: '' },
      cookie,
    )
    expect(res.status).toBe(404)
    expect(bundles.list()).toHaveLength(0)
  })

  it('insists on a reason for anything that is not an approval', async () => {
    const submission = await queueOne()
    const cookie = await signedIn('tswic', 'admin')
    const res = await post(
      `/api/review/submissions/${submission.id}/decide`,
      { decision: 'reject', note: '   ' },
      cookie,
    )
    expect(res.status).toBe(400)
    expect(JSON.stringify(await res.json())).toContain('say why')
  })

  it('rejects an unknown decision word rather than guessing', async () => {
    const submission = await queueOne()
    const cookie = await signedIn('tswic', 'admin')
    const res = await post(
      `/api/review/submissions/${submission.id}/decide`,
      { decision: 'publish', note: 'go' },
      cookie,
    )
    expect(res.status).toBe(400)
  })

  it('approves, publishes, and empties the queue', async () => {
    const submission = await queueOne()
    const cookie = await signedIn('tswic', 'admin')
    const res = await post(
      `/api/review/submissions/${submission.id}/decide`,
      { decision: 'approve', note: 'reads clean' },
      cookie,
    )
    expect(res.status).toBe(200)

    const body = (await res.json()) as { url: string; creation: { originKey: string } }
    expect(body.url).toContain('.tsq-apps.localhost:3031')
    expect(await bundles.resolveOrigin('creation', body.creation.originKey)).not.toBeNull()

    const after = await fetch(base + '/api/review/queue', { headers: { Cookie: cookie } })
    expect((await after.json()) as { items: unknown[] }).toEqual({ items: [] })
  })

  it('maps a second decision on the same submission to a 409', async () => {
    const submission = await queueOne()
    const cookie = await signedIn('tswic', 'admin')
    await post(
      `/api/review/submissions/${submission.id}/decide`,
      { decision: 'approve', note: '' },
      cookie,
    )
    const again = await post(
      `/api/review/submissions/${submission.id}/decide`,
      { decision: 'reject', note: 'changed my mind' },
      cookie,
    )
    expect(again.status).toBe(409)
  })

  it('refuses a decision posted from another origin', async () => {
    const submission = await queueOne()
    const cookie = await signedIn('tswic', 'admin')
    const res = await fetch(base + `/api/review/submissions/${submission.id}/decide`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: 'https://evil.example', Cookie: cookie },
      body: JSON.stringify({ decision: 'approve', note: '' }),
    })
    expect(res.status).toBe(403)
    expect(bundles.list()).toHaveLength(0)
  })
})
