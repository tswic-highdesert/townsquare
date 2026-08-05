/**
 * The contribution routes over a real socket.
 *
 * Driven with `fetch` against a listening server rather than by calling the
 * handler, for the reason `identityRoutes.test.ts` gives: the properties that
 * matter here are HTTP properties. Which routes read a cookie, what a
 * cross-origin POST actually gets back, whether a resident asking after a
 * neighbour's proposal is told 404 rather than 403, and what status a pause
 * returns to a client library that might retry it. A handler called directly
 * cannot be wrong about any of those.
 *
 * The moderator surface is mounted here alongside the resident one, because the
 * interesting assertions are the ones that cross between them: a correction a
 * resident filed, read by a moderator, decided, and then visible in the
 * resident's own list with the note attached.
 */

import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { Identity, MemoryIdentityStore, type ChallengeDelivery } from '@townsquare/identity'
import {
  Contributions,
  Drafts,
  MemoryAttemptLog,
  MemoryContributionStore,
  MemoryDraftStore,
  MemoryRecordStore,
  NoListingOwners,
  NoOrganisations,
} from '@townsquare/contributions'
import { CreationStorage, MemoryStorageStore } from '@townsquare/storage'
import {
  MemoryCreationStore,
  MemoryModerationLogStore,
  MemoryRecordTypeStore,
  MemoryReportStore,
  MemorySubmissionStore,
  Moderation,
  Reports,
  Review,
} from '@townsquare/review'
import { BundleStorePublisher, MemoryBundleStore } from '@townsquare/sandbox'
import { createContributionRoutes } from './contributionRoutes.js'
import { createIdentityRoutes } from './identityRoutes.js'
import { createReviewRoutes } from './reviewRoutes.js'

const SHELL_ORIGIN = 'http://townsquare.localhost:5173'
const TOWN = 'russellville-ar'
const TZ = 'America/Chicago'
const WEEK = 7 * 24 * 60 * 60 * 1000

class Captured implements ChallengeDelivery {
  tokens: string[] = []
  async deliver(input: { token: string }): Promise<void> {
    this.tokens.push(input.token)
  }
  get last(): string {
    return this.tokens[this.tokens.length - 1]!
  }
}

/** A directory of exactly one listing, with a real value the test supplies. */
const listing = { hours: '11am to 8pm' }

let server: Server
let base: string
let store: MemoryIdentityStore
let identity: Identity
let delivery: Captured
let contributions: Contributions
let routes: ReturnType<typeof createContributionRoutes>
let reviewRoutes: ReturnType<typeof createReviewRoutes>
let auth: ReturnType<typeof createIdentityRoutes>

beforeAll(async () => {
  server = createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://localhost')
    void auth(req, res, url)
      .then((handled) => (handled ? true : reviewRoutes(req, res, url)))
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
  listing.hours = '11am to 8pm'

  contributions = new Contributions({
    contributions: new MemoryContributionStore(),
    records: new MemoryRecordStore(),
    attempts: new MemoryAttemptLog(),
    orgs: new NoOrganisations(),
    ownership: new NoListingOwners(),
    listings: {
      async current(_townId, listingId, field) {
        if (listingId !== 'biz-fat-daddys' || field !== 'hours') return null
        return { label: "Fat Daddy's Bar-B-Que", value: listing.hours }
      },
    },
  })

  const creations = new MemoryCreationStore()
  const reportStore = new MemoryReportStore()
  const publisher = new BundleStorePublisher({
    store: new MemoryBundleStore(),
    origin: { appsDomain: 'tsq-apps.localhost', scheme: 'http', port: 3031 },
    shellOrigins: [SHELL_ORIGIN],
  })

  routes = createContributionRoutes({
    identity,
    contributions,
    drafts: new Drafts({ store: new MemoryDraftStore() }),
    shellOrigin: SHELL_ORIGIN,
    townId: TOWN,
    timezone: TZ,
  })

  reviewRoutes = createReviewRoutes({
    identity,
    review: new Review({
      submissions: new MemorySubmissionStore(),
      creations,
      recordTypes: new MemoryRecordTypeStore(),
      publisher,
    }),
    reports: new Reports({
      reports: reportStore,
      targets: {
        async creationBySlug() {
          return null
        },
      },
    }),
    moderation: new Moderation({
      creations,
      publisher,
      reports: reportStore,
      log: new MemoryModerationLogStore(),
    }),
    contributions,
    shellOrigin: SHELL_ORIGIN,
    townId: TOWN,
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
})

async function post(path: string, body: unknown, cookie?: string, origin = SHELL_ORIGIN) {
  return fetch(base + path, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(origin ? { Origin: origin } : {}),
      ...(cookie ? { Cookie: cookie } : {}),
    },
    body: JSON.stringify(body),
  })
}

async function get(path: string, cookie?: string) {
  return fetch(base + path, { headers: cookie ? { Cookie: cookie } : {} })
}

async function signedIn(
  handle: string,
  opts: { verified?: boolean; role?: 'moderator' | 'admin' } = {},
): Promise<string> {
  await post('/api/auth/signup', { handle, email: `${handle}@example.com` })
  const res = await post('/api/auth/confirm', { token: delivery.last })
  const patch: Record<string, unknown> = {}
  if (opts.verified) {
    patch['verifiedResident'] = true
    patch['verifiedMethod'] = 'vouch'
    patch['verifiedAt'] = Date.now()
  }
  if (opts.role) patch['role'] = opts.role
  if (Object.keys(patch).length > 0) {
    const user = (await store.userByHandle(handle))!
    await store.updateUser(user.id, patch, Date.now())
  }
  return res.headers.get('set-cookie')!.split(';')[0]!
}

const anEvent = () => ({
  title: 'Homecoming supper and singing',
  startsAt: Date.now() + WEEK,
  category: 'church',
  description: 'Fried catfish, hushpuppies and whatever the tables bring.',
  cost: 'free',
})

const aCorrection = () => ({
  targetRef: 'biz-fat-daddys',
  targetLabel: "Fat Daddy's Bar-B-Que",
  field: 'hours',
  beforeValue: '11am to 8pm',
  newValue: '11am to 3pm',
  reason: 'Sign taped to the door since May, lunch only on Saturdays now.',
})

describe('who may contribute at all', () => {
  it('turns away a request with no session', async () => {
    expect((await get('/api/contributions')).status).toBe(401)
    expect((await post('/api/contributions', { type: 'event', content: anEvent() })).status).toBe(
      401,
    )
  })

  it('refuses a write that did not come from the shell', async () => {
    const cookie = await signedIn('dana', { verified: true })
    const res = await post(
      '/api/contributions',
      { type: 'event', content: anEvent() },
      cookie,
      'http://evil.example',
    )
    expect(res.status).toBe(403)
  })

  it('publishes an event from a verified resident', async () => {
    const cookie = await signedIn('dana', { verified: true })
    const res = await post('/api/contributions', { type: 'event', content: anEvent() }, cookie)
    expect(res.status).toBe(200)

    const body = (await res.json()) as {
      outcome: string
      recordId: string | null
      contribution: Record<string, unknown>
    }
    expect(body.outcome).toBe('published')
    expect(body.recordId).toBeTruthy()
    expect(body.contribution['attribution']).toMatchObject({ kind: 'resident', handle: 'dana' })
    // Never on the wire. The digest is the pin a publish is checked against.
    expect(body.contribution['contentDigest']).toBeUndefined()
  })

  it('holds an event from someone who is not verified yet', async () => {
    const cookie = await signedIn('newcomer')
    const res = await post('/api/contributions', { type: 'event', content: anEvent() }, cookie)
    expect(res.status).toBe(200)
    expect(((await res.json()) as { outcome: string }).outcome).toBe('held_for_verification')
  })

  it('answers 501 for a photo, so nobody goes hunting for a typo in their caption', async () => {
    const cookie = await signedIn('dana', { verified: true })
    const res = await post(
      '/api/contributions',
      { type: 'photo', content: { imageRef: 'x', caption: 'Market morning' } },
      cookie,
    )
    expect(res.status).toBe(501)
    expect(((await res.json()) as { error: string }).error).toBe('unavailable')
  })
})

describe('reading a date', () => {
  it('reads it back rather than deciding', async () => {
    const cookie = await signedIn('dana', { verified: true })
    const res = await post('/api/contribute/when', { text: 'friday at 7' }, cookie)
    const body = (await res.json()) as { kind: string; readings?: Array<{ label: string }> }
    expect(body.kind).toBe('ambiguous')
    expect(body.readings).toHaveLength(2)
  })

  it('needs a session, like everything else that reads a cookie here', async () => {
    expect((await post('/api/contribute/when', { text: 'friday at 7' })).status).toBe(401)
  })
})

describe('drafts', () => {
  it('autosaves, resumes, and publishes through the same validation as anything else', async () => {
    const cookie = await signedIn('dana', { verified: true })

    const saved = await post(
      '/api/drafts',
      { type: 'event', content: { title: 'Half a thought' } },
      cookie,
    )
    const draft = ((await saved.json()) as { draft: { id: string; title: string } }).draft
    expect(draft.title).toBe('Half a thought')

    // A draft that would not validate cannot publish, even by draft id.
    const refused = await post('/api/contributions', { draftId: draft.id }, cookie)
    expect(refused.status).toBe(400)

    await post('/api/drafts', { id: draft.id, type: 'event', content: anEvent() }, cookie)
    const published = await post('/api/contributions', { draftId: draft.id }, cookie)
    expect(((await published.json()) as { outcome: string }).outcome).toBe('published')

    // The draft is gone only once the proposal exists.
    const list = (await (await get('/api/contributions', cookie)).json()) as { drafts: unknown[] }
    expect(list.drafts).toHaveLength(0)
  })

  it('is private: an id that is not yours is not found, not refused', async () => {
    const dana = await signedIn('dana', { verified: true })
    const luis = await signedIn('luis', { verified: true })
    const saved = await post('/api/drafts', { type: 'event', content: { title: 'Mine' } }, dana)
    const draft = ((await saved.json()) as { draft: { id: string } }).draft

    expect((await get(`/api/drafts/${draft.id}`, luis)).status).toBe(404)
    expect((await get(`/api/drafts/${draft.id}`, dana)).status).toBe(200)
  })
})

describe('a correction, from both sides', () => {
  it('queues, is read against the live value, and comes back with the note', async () => {
    const dana = await signedIn('dana', { verified: true })
    const mod = await signedIn('tswic', { verified: true, role: 'moderator' })

    const filed = await post(
      '/api/contributions',
      { type: 'correction', content: aCorrection() },
      dana,
    )
    const id = ((await filed.json()) as { contribution: { id: string } }).contribution.id

    // An ordinary resident is told the moderator queue does not exist.
    expect((await get('/api/review/contributions', dana)).status).toBe(404)

    const queue = (await (await get('/api/review/contributions', mod)).json()) as {
      items: Array<{ id: string }>
    }
    expect(queue.items.map((i) => i.id)).toEqual([id])

    const detail = (await (await get(`/api/review/contributions/${id}`, mod)).json()) as {
      currentValue: string
    }
    expect(detail.currentValue).toBe('11am to 8pm')

    const decided = await post(
      `/api/review/contributions/${id}/decide`,
      { decision: 'decline', note: 'Rang them, Saturday hours are unchanged.' },
      mod,
    )
    expect(decided.status).toBe(200)

    const mine = (await (await get('/api/contributions', dana)).json()) as {
      contributions: Array<{ status: string; decisionNote: string }>
    }
    expect(mine.contributions[0]!.status).toBe('declined')
    expect(mine.contributions[0]!.decisionNote).toContain('Saturday hours are unchanged')
  })

  it('hands back the original when Send correction is pressed twice', async () => {
    const dana = await signedIn('dana', { verified: true })
    const first = (await (
      await post('/api/contributions', { type: 'correction', content: aCorrection() }, dana)
    ).json()) as { contribution: { id: string }; duplicate: boolean }
    const second = (await (
      await post('/api/contributions', { type: 'correction', content: aCorrection() }, dana)
    ).json()) as { contribution: { id: string }; duplicate: boolean }

    expect(first.duplicate).toBe(false)
    expect(second.duplicate).toBe(true)
    expect(second.contribution.id).toBe(first.contribution.id)
  })

  it('refuses to publish over somebody who already fixed it', async () => {
    const dana = await signedIn('dana', { verified: true })
    const mod = await signedIn('tswic', { verified: true, role: 'moderator' })
    const filed = await post(
      '/api/contributions',
      { type: 'correction', content: aCorrection() },
      dana,
    )
    const id = ((await filed.json()) as { contribution: { id: string } }).contribution.id

    listing.hours = '11am to 2pm'
    const res = await post(
      `/api/review/contributions/${id}/decide`,
      { decision: 'approve', note: '' },
      mod,
    )
    expect(res.status).toBe(409)
    expect(((await res.json()) as { error: string }).error).toBe('stale')
  })

  it('will not take a decline with no reason', async () => {
    const dana = await signedIn('dana', { verified: true })
    const mod = await signedIn('tswic', { verified: true, role: 'moderator' })
    const filed = await post(
      '/api/contributions',
      { type: 'correction', content: aCorrection() },
      dana,
    )
    const id = ((await filed.json()) as { contribution: { id: string } }).contribution.id

    const res = await post(
      `/api/review/contributions/${id}/decide`,
      { decision: 'decline', note: ' ' },
      mod,
    )
    expect(res.status).toBe(400)
  })
})

describe('one resident cannot reach another', () => {
  it('answers 404 for a contribution that is not yours, never 403', async () => {
    const dana = await signedIn('dana', { verified: true })
    const luis = await signedIn('luis', { verified: true })
    const filed = await post('/api/contributions', { type: 'event', content: anEvent() }, dana)
    const id = ((await filed.json()) as { contribution: { id: string } }).contribution.id

    expect((await get(`/api/contributions/${id}`, luis)).status).toBe(404)
    expect((await get(`/api/contributions/${id}`, dana)).status).toBe(200)
  })

  it('will not let somebody else withdraw one', async () => {
    const dana = await signedIn('dana', { verified: true })
    const luis = await signedIn('luis', { verified: true })
    const filed = await post(
      '/api/contributions',
      { type: 'correction', content: aCorrection() },
      dana,
    )
    const id = ((await filed.json()) as { contribution: { id: string } }).contribution.id

    expect((await post(`/api/contributions/${id}/withdraw`, {}, luis)).status).toBe(404)
    expect((await post(`/api/contributions/${id}/withdraw`, {}, dana)).status).toBe(200)
  })
})

describe('the pause, over the wire', () => {
  it('answers 409 rather than 429, so no client library retries it in a loop', async () => {
    const cookie = await signedIn('dana', { verified: true })
    for (let n = 0; n < 9; n++) {
      await post('/api/contributions', { type: 'event', content: anEvent() }, cookie)
    }

    const res = await post('/api/contributions', { type: 'event', content: anEvent() }, cookie)
    expect(res.status).toBe(409)
    const body = (await res.json()) as { error: string; message: string }
    expect(body.error).toBe('paused')
    expect(body.message).toContain('pause')

    // And the composer can still see where it is, and when it lifts.
    const options = (await (await get('/api/contribute/options', cookie)).json()) as {
      pause: { level: string; retryAt: number }
    }
    expect(options.pause.level).toBe('paused')
    expect(options.pause.retryAt).toBeGreaterThan(Date.now())
  })

  it('still takes a correction while publishing is paused', async () => {
    const cookie = await signedIn('dana', { verified: true })
    for (let n = 0; n < 9; n++) {
      await post('/api/contributions', { type: 'event', content: anEvent() }, cookie)
    }
    const res = await post(
      '/api/contributions',
      { type: 'correction', content: aCorrection() },
      cookie,
    )
    expect(res.status).toBe(200)
    expect(((await res.json()) as { outcome: string }).outcome).toBe('queued')
  })
})

describe('the record, and its history', () => {
  it('keeps every version, and a revert is a new one', async () => {
    const dana = await signedIn('dana', { verified: true })
    const mod = await signedIn('tswic', { verified: true, role: 'moderator' })

    const filed = await post(
      '/api/contributions',
      { type: 'correction', content: aCorrection() },
      dana,
    )
    const id = ((await filed.json()) as { contribution: { id: string } }).contribution.id
    const decided = (await (
      await post(
        `/api/review/contributions/${id}/decide`,
        { decision: 'approve', note: 'Right.' },
        mod,
      )
    ).json()) as { record: { id: string } }

    const reverted = await post(
      `/api/review/records/${decided.record.id}/revert`,
      { version: 1, note: 'They rang: the old hours stand until June.' },
      mod,
    )
    expect(reverted.status).toBe(200)

    const history = (await (
      await get(`/api/records/${decided.record.id}/history`, dana)
    ).json()) as { versions: Array<{ version: number; revertedFrom: number | null }> }

    // Version 1 is the directory import, 2 is the resident, 3 is the revert.
    // Nothing was deleted to get there.
    expect(history.versions.map((v) => v.version)).toEqual([1, 2, 3])
    expect(history.versions[2]!.revertedFrom).toBe(1)
  })

  it('does not let an ordinary resident revert anything', async () => {
    const dana = await signedIn('dana', { verified: true })
    const res = await post('/api/review/records/whatever/revert', { version: 1, note: 'no' }, dana)
    // 404 rather than 403: the whole moderator surface answers that way.
    expect(res.status).toBe(404)
  })
})
