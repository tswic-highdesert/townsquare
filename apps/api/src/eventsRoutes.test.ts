/**
 * The events routes over a real socket.
 *
 * The properties worth proving here are HTTP properties, not assembly ones —
 * `events.test.ts` owns those. What a handler called directly cannot be wrong
 * about is whether a malformed day is refused, whether a missing event is a
 * 404, and whether a stampede of residents at 7am becomes one scrape.
 */

import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { createEventsRoutes } from './eventsRoutes.js'
import type { TownSquareItem } from './today.js'

const TOWN = { id: 'russellville-ar', name: 'Russellville', timezone: 'America/Chicago' }
const NOW = new Date('2026-08-05T14:14:00-05:00')

const ITEMS: TownSquareItem[] = [
  {
    type: 'event',
    id: 'council',
    title: 'City council, regular session',
    description: '',
    source: 'city-russellville',
    tags: [],
    community: 'Russellville',
    location: '203 S Commerce Ave, Russellville, AR 72801',
    startDate: '2026-08-05T17:30:00-05:00',
    createdAt: '2026-08-05T17:30:00-05:00',
    updatedAt: '2026-08-05T17:30:00-05:00',
  },
]

let server: Server
let base: string
let loads = 0

beforeAll(async () => {
  const routes = createEventsRoutes({
    town: TOWN,
    loadItems: async () => {
      loads += 1
      return ITEMS
    },
    now: () => NOW,
  })

  server = createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://localhost')
    void routes(req, res, url).then((handled) => {
      if (!handled) {
        res.writeHead(404)
        res.end()
      }
    })
  })
  await new Promise<void>((resolve) => server.listen(0, resolve))
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
})

afterAll(() => {
  server.close()
})

beforeEach(() => {
  loads = 0
})

describe('GET /api/events', () => {
  it('defaults to the town day, not the server day', async () => {
    const res = await fetch(`${base}/api/events`)
    expect(res.status).toBe(200)
    const body = (await res.json()) as { day: string; isToday: boolean; total: number }
    expect(body.day).toBe('2026-08-05')
    expect(body.isToday).toBe(true)
    expect(body.total).toBe(1)
  })

  it('serves a named day', async () => {
    const res = await fetch(`${base}/api/events?day=2026-08-04`)
    const body = (await res.json()) as { day: string; isToday: boolean; total: number }
    expect(body.day).toBe('2026-08-04')
    expect(body.isToday).toBe(false)
    expect(body.total).toBe(0)
  })

  it('refuses a malformed day rather than quietly showing today', async () => {
    // A resident who followed a broken link should be told, not handed a
    // different day that looks authoritative.
    const res = await fetch(`${base}/api/events?day=tomorrow`)
    expect(res.status).toBe(400)
  })

  it('is never cached by anything between us and the resident', async () => {
    // A shared cache in front of a per-town screen is a per-town bug the day
    // Town Square is more than one town.
    const res = await fetch(`${base}/api/events`)
    expect(res.headers.get('cache-control')).toBe('private, max-age=30')
  })
})

describe('GET /api/events/month', () => {
  it('defaults to the month the town is in', async () => {
    const res = await fetch(`${base}/api/events/month`)
    const body = (await res.json()) as { month: string; weeks: unknown[][] }
    expect(body.month).toBe('2026-08')
    for (const week of body.weeks) expect(week).toHaveLength(7)
  })

  it('refuses a malformed month', async () => {
    expect((await fetch(`${base}/api/events/month?month=august`)).status).toBe(400)
  })
})

describe('GET /api/events/detail', () => {
  it('answers with the event', async () => {
    const res = await fetch(`${base}/api/events/detail?id=council`)
    expect(res.status).toBe(200)
    const body = (await res.json()) as { title: string; whenPlain: string }
    expect(body.title).toBe('City council, regular session')
    expect(body.whenPlain).toBe('Today evening')
  })

  it('404s an event that has rolled off the feed', async () => {
    // Genuinely gone, and saying so beats a shell of a screen.
    expect((await fetch(`${base}/api/events/detail?id=nope`)).status).toBe(404)
  })

  it('refuses a request with no id', async () => {
    expect((await fetch(`${base}/api/events/detail`)).status).toBe(400)
  })
})

describe('the cache', () => {
  it('turns a stampede into one scrape', async () => {
    // A cold build takes as long as the slowest scraper. Without the shared
    // in-flight promise, a dozen residents opening the app at 7am each start
    // their own fetch of every source in town.
    let cold = 0
    const routes = createEventsRoutes({
      town: TOWN,
      loadItems: async () => {
        cold += 1
        await new Promise((r) => setTimeout(r, 20))
        return ITEMS
      },
      now: () => NOW,
    })
    const slow = createServer((req, res) => {
      void routes(req, res, new URL(req.url ?? '/', 'http://localhost'))
    })
    await new Promise<void>((resolve) => slow.listen(0, resolve))
    const at = `http://127.0.0.1:${(slow.address() as AddressInfo).port}`

    await Promise.all([
      fetch(`${at}/api/events`),
      fetch(`${at}/api/events/month`),
      fetch(`${at}/api/events/detail?id=council`),
    ])
    expect(cold).toBe(1)
    slow.close()
  })

  it('reuses the scrape across shapes for the length of the cache', async () => {
    await fetch(`${base}/api/events?day=2026-08-05`)
    await fetch(`${base}/api/events/month?month=2026-09`)
    expect(loads).toBe(0)
  })

  it('leaves anything that is not ours alone', async () => {
    expect((await fetch(`${base}/api/other`)).status).toBe(404)
  })
})
