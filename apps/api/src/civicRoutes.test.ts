/**
 * The civic routes over a real socket.
 *
 * The property this suite exists for cannot be checked any other way: **the
 * civic screen answers without a cookie.** A tornado warning has to reach a
 * phone that has never signed in, and an auth wall in front of that is a
 * failure that only shows up on the one night it matters. A handler called
 * directly cannot be wrong about whether a route read a cookie; a real request
 * with no `Cookie` header can.
 */

import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { Identity, MemoryIdentityStore, type ChallengeDelivery } from '@townsquare/identity'
import {
  Alerts,
  MemoryAlertPreferenceStore,
  MemoryNoticeStateStore,
  type AuthoredNotice,
} from '@townsquare/civic'
import { createCivicRoutes } from './civicRoutes.js'
import { createIdentityRoutes } from './identityRoutes.js'
import { CreationStorage, MemoryStorageStore } from '@townsquare/storage'

const SHELL_ORIGIN = 'http://townsquare.localhost:5173'
const TOWN = 'russellville-ar'
const HOUR = 60 * 60 * 1000

class Captured implements ChallengeDelivery {
  tokens: string[] = []
  async deliver(input: { token: string }): Promise<void> {
    this.tokens.push(input.token)
  }
  get last(): string {
    return this.tokens[this.tokens.length - 1]!
  }
}

/** The town's ingested items, supplied by each test. Real shapes, no scrapers. */
let items: unknown[]
let authored: AuthoredNotice[]

let server: Server
let base: string
let store: MemoryIdentityStore
let delivery: Captured
let routes: ReturnType<typeof createCivicRoutes>
let auth: ReturnType<typeof createIdentityRoutes>

const tornado = (over: Record<string, unknown> = {}) => ({
  id: 'nws-tornado-1',
  type: 'notice',
  title: 'Tornado warning for Russellville and central Pope County until 11:45 pm',
  description: 'Take shelter now. Interior room, lowest floor, away from windows.',
  source: 'nws-weather',
  severity: 'emergency',
  isActive: true,
  url: 'https://alerts.weather.gov',
  createdAt: new Date(Date.now() - 60_000).toISOString(),
  updatedAt: new Date(Date.now() - 60_000).toISOString(),
  ...over,
})

const council = () => ({
  id: 'ev-council-1',
  type: 'event',
  title: 'City Council Meeting',
  source: 'city-russellville',
  startDate: new Date(Date.now() + 2 * 24 * HOUR).toISOString(),
  url: 'https://www.russellvillear.gov/calendar',
})

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
  items = []
  authored = []
  store = new MemoryIdentityStore()
  delivery = new Captured()
  const identity = new Identity({ store, delivery })

  routes = createCivicRoutes({
    identity,
    alerts: new Alerts({ store: new MemoryAlertPreferenceStore() }),
    noticeStates: new MemoryNoticeStateStore(),
    loadItems: async () => items,
    sourceNames: { 'nws-weather': 'NWS Little Rock', 'city-russellville': 'City of Russellville' },
    authoredNotices: async () => authored,
    noticeSources: ['NWS Little Rock', 'City of Russellville'],
    townName: 'Russellville',
    // No cache in the suite: these tests are about how a notice decays, not
    // about how long a payload is reused. The cache has its own test below.
    cacheMs: 0,
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

async function get(path: string, cookie?: string) {
  return fetch(base + path, { headers: cookie ? { Cookie: cookie } : {} })
}

async function signedIn(handle: string): Promise<string> {
  await post('/api/auth/signup', { handle, email: `${handle}@example.com` })
  const res = await post('/api/auth/confirm', { token: delivery.last })
  return res.headers.get('set-cookie')!.split(';')[0]!
}

interface CivicBody {
  notices: Array<{ id: string; severity: string; presentation: string; digest: string; provenance: Record<string, unknown> }>
  meetings: { thisWeek: Array<{ bodyName: string }>; notCarried: string[] }
  quiet: { line: string; sub: string; watching: string[]; action: string } | null
}

describe('the civic screen answers without a session', () => {
  it('serves a signed-out phone', async () => {
    items = [tornado(), council()]
    const res = await get('/api/civic')
    expect(res.status).toBe(200)

    const body = (await res.json()) as CivicBody
    expect(body.notices).toHaveLength(1)
    expect(body.meetings.thisWeek.map((m) => m.bodyName)).toEqual(['City Council'])
  })

  it('takes over the screen of a stranger who has seen nothing', async () => {
    items = [tornado()]
    const body = (await (await get('/api/civic')).json()) as CivicBody
    // Signed out, nothing has been read and nothing is hidden, so the loudest
    // thing in town gets the whole screen. That is the correct behaviour on a
    // phone that has never signed in.
    expect(body.notices[0]!.presentation).toBe('takeover')
  })

  it('ships a designed silence rather than looking like a failed fetch', async () => {
    const body = (await (await get('/api/civic')).json()) as CivicBody
    expect(body.notices).toEqual([])
    // Four slots from section 10's anatomy: a line that states the fact and
    // never apologises, a sub-line naming what we actually checked, and an
    // action only because there is genuinely somewhere better to be.
    expect(body.quiet!.line).toBe('Nothing is going on in Russellville right now.')
    expect(body.quiet!.sub).toContain('Nothing from City of Russellville or NWS Little Rock')
    expect(body.quiet!.watching).toEqual(['City of Russellville', 'NWS Little Rock'])
    expect(body.quiet!.action).toBe('What we check, and how often')
  })

  it('has no quiet state at all when something is actually happening', async () => {
    items = [tornado()]
    const body = (await (await get('/api/civic')).json()) as CivicBody
    expect(body.quiet).toBeNull()
  })

  it('names what it does not carry, on the payload', async () => {
    items = [council()]
    const body = (await (await get('/api/civic')).json()) as CivicBody
    expect(body.meetings.notCarried).toContain('agendas')
  })
})

describe('provenance survives the wire', () => {
  it('keeps the two shapes distinct', async () => {
    items = [tornado()]
    authored = [
      {
        id: 'c-1',
        title: 'Wednesday supper moves to 5:30',
        body: 'The hall is being refinished.',
        severity: 'informational',
        orgName: 'First United Methodist Church',
        handle: 'rev.tillman',
        publishedAt: Date.now() - HOUR,
      },
    ]
    const body = (await (await get('/api/civic')).json()) as CivicBody

    const ingested = body.notices.find((n) => n.id === 'nws-tornado-1')!
    const written = body.notices.find((n) => n.id === 'c-1')!
    expect(ingested.provenance['kind']).toBe('ingested')
    expect(ingested.provenance['sourceName']).toBe('NWS Little Rock')
    expect(written.provenance['kind']).toBe('authored')
    expect(written.provenance['orgName']).toBe('First United Methodist Church')
    // Neither can honestly say the other's sentence.
    expect(written.provenance).not.toHaveProperty('fetchedAt')
    expect(ingested.provenance).not.toHaveProperty('orgName')
  })
})

describe('what a resident has done with a notice', () => {
  it('needs a session to record anything', async () => {
    items = [tornado()]
    expect((await post('/api/civic/notices/nws-tornado-1/seen', { digest: 'x' })).status).toBe(401)
    expect((await post('/api/civic/notices/nws-tornado-1/hide', { digest: 'x' })).status).toBe(401)
  })

  it('collapses to a bar once it has been read', async () => {
    items = [tornado()]
    const cookie = await signedIn('dana')
    const before = (await (await get('/api/civic', cookie)).json()) as CivicBody
    expect(before.notices[0]!.presentation).toBe('takeover')

    await post(
      '/api/civic/notices/nws-tornado-1/seen',
      { digest: before.notices[0]!.digest },
      cookie,
    )
    const after = (await (await get('/api/civic', cookie)).json()) as CivicBody
    expect(after.notices[0]!.presentation).toBe('bar')
  })

  it('refuses to hide something without being told what was hidden', async () => {
    items = [tornado()]
    const cookie = await signedIn('dana')
    const res = await post('/api/civic/notices/nws-tornado-1/hide', {}, cookie)
    // Hiding without naming the version would be a permanent dismissal wearing
    // the words of a temporary one.
    expect(res.status).toBe(400)
  })

  it('brings a hidden notice straight back when the source changes it', async () => {
    items = [tornado()]
    const cookie = await signedIn('dana')
    const first = (await (await get('/api/civic', cookie)).json()) as CivicBody
    await post(
      '/api/civic/notices/nws-tornado-1/hide',
      { digest: first.notices[0]!.digest },
      cookie,
    )

    const hidden = (await (await get('/api/civic', cookie)).json()) as CivicBody
    expect(hidden.notices[0]!.presentation).toBe('line')

    // The warning is narrowed at 11:19pm. Same alert, different information.
    items = [tornado({ description: 'Warning narrowed to east of Highway 7.' })]
    const updated = (await (await get('/api/civic', cookie)).json()) as CivicBody
    expect(updated.notices[0]!.presentation).toBe('takeover')
  })

  it('does not let one resident see another resident state', async () => {
    items = [tornado()]
    const dana = await signedIn('dana')
    const luis = await signedIn('luis')
    const seen = (await (await get('/api/civic', dana)).json()) as CivicBody
    await post('/api/civic/notices/nws-tornado-1/seen', { digest: seen.notices[0]!.digest }, dana)

    const forLuis = (await (await get('/api/civic', luis)).json()) as CivicBody
    expect(forLuis.notices[0]!.presentation).toBe('takeover')
  })
})

describe('the assembled payload is shared', () => {
  it('reuses one build within the window rather than per resident', async () => {
    let builds = 0
    const identity = new Identity({ store, delivery })
    const cached = createCivicRoutes({
      identity,
      alerts: new Alerts({ store: new MemoryAlertPreferenceStore() }),
      noticeStates: new MemoryNoticeStateStore(),
      loadItems: async () => {
        builds += 1
        return [tornado()]
      },
      sourceNames: { 'nws-weather': 'NWS Little Rock' },
      authoredNotices: async () => [],
      noticeSources: ['NWS Little Rock'],
      townName: 'Russellville',
      cacheMs: 60_000,
      shellOrigin: SHELL_ORIGIN,
      townId: TOWN,
    })

    const server2 = createServer((req, res) => {
      void cached(req, res, new URL(req.url ?? '/', 'http://localhost')).then((handled) => {
        if (!handled) {
          res.writeHead(404)
          res.end()
        }
      })
    })
    await new Promise<void>((resolve) => server2.listen(0, '127.0.0.1', resolve))
    const at = `http://127.0.0.1:${(server2.address() as AddressInfo).port}`

    // A storm is the moment a town opens the app all at once, and it is the
    // moment a per-request scrape would be most expensive.
    await Promise.all(Array.from({ length: 20 }, () => fetch(at + '/api/civic')))
    await fetch(at + '/api/civic')
    expect(builds).toBe(1)
    server2.close()
  })
})

describe('the alert settings', () => {
  it('need a session', async () => {
    expect((await get('/api/civic/alerts')).status).toBe(401)
    expect((await post('/api/civic/alerts', { threshold: 'advisory' })).status).toBe(401)
  })

  it('hand back the default for somebody who has never opened them', async () => {
    const cookie = await signedIn('dana')
    const view = (await (await get('/api/civic/alerts', cookie)).json()) as {
      preferences: { threshold: string; quietHours: { enabled: boolean } }
      rungs: Array<{ severity: string; locked: boolean }>
      emergencyNote: string
    }
    expect(view.preferences.threshold).toBe('urgent')
    expect(view.preferences.quietHours.enabled).toBe(true)
    expect(view.rungs.filter((r) => r.locked).map((r) => r.severity)).toEqual(['emergency'])
    expect(view.emergencyNote).toContain('no setting that turns that off')
  })

  it('save a change and read it back', async () => {
    const cookie = await signedIn('dana')
    await post('/api/civic/alerts', { threshold: 'advisory', topics: ['planning'] }, cookie)
    const view = (await (await get('/api/civic/alerts', cookie)).json()) as {
      preferences: { threshold: string; topics: string[] }
    }
    expect(view.preferences.threshold).toBe('advisory')
    expect(view.preferences.topics).toEqual(['planning'])
  })

  it('refuse a threshold that is not on the ladder', async () => {
    const cookie = await signedIn('dana')
    const res = await post('/api/civic/alerts', { threshold: 'catastrophic' }, cookie)
    expect(res.status).toBe(400)
  })

  it('refuse a cross-origin write', async () => {
    const cookie = await signedIn('dana')
    const res = await fetch(base + '/api/civic/alerts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: 'http://evil.example', Cookie: cookie },
      body: JSON.stringify({ threshold: 'advisory' }),
    })
    expect(res.status).toBe(403)
  })
})
