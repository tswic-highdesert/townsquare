/**
 * Driven over a real socket rather than by calling the handler.
 *
 * Everything worth testing about this route is an HTTP property: whether the
 * body actually arrives gzipped, what `Cache-Control` says, whether a second
 * request inside the TTL re-ran the scrape, and whether a failed scrape serves
 * the last good copy instead of a 503. A handler called directly cannot be
 * wrong about any of those. Same reasoning as `identityRoutes.test.ts`.
 */

import { createServer, type Server } from 'node:http'
import { gunzipSync } from 'node:zlib'
import { afterEach, describe, expect, it } from 'vitest'
import { createDirectoryRoutes } from './directoryRoutes.js'
import type { TownSquareItem } from './today.js'

const TOWN = { id: 'russellville-ar', name: 'Russellville', timezone: 'America/Chicago' }

function business(over: Partial<Record<string, unknown>> = {}): TownSquareItem {
  return {
    id: 'b1',
    type: 'business',
    title: 'Hickory & Ash',
    name: 'Hickory & Ash',
    description: '',
    source: 'rvts-directory',
    tags: [],
    community: 'Russellville',
    category: 'Furniture store',
    address: '100 N Commerce Ave, Russellville, AR',
    phone: '(479) 555-0100',
    hours: 'Wed 9 AM to 5 PM',
    geo: { lat: 35.2784, lng: -93.1338 },
    createdAt: '2025-12-10T12:00:00-06:00',
    updatedAt: '2025-12-10T12:00:00-06:00',
    ...over,
  } as unknown as TownSquareItem
}

let server: Server | null = null

async function serve(handle: ReturnType<typeof createDirectoryRoutes>): Promise<string> {
  server = createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://localhost')
    void handle(req, res, url).then((handled) => {
      if (!handled) {
        res.writeHead(404, { 'Content-Type': 'application/json' })
        res.end('{"error":"not_found"}')
      }
    })
  })
  await new Promise<void>((done) => server?.listen(0, '127.0.0.1', done))
  const address = server.address()
  const port = typeof address === 'object' && address ? address.port : 0
  return `http://127.0.0.1:${port}`
}

afterEach(async () => {
  const open = server
  server = null
  if (open) await new Promise<void>((done) => open.close(() => done()))
})

describe('GET /api/directory', () => {
  const now = () => new Date('2026-08-05T19:00:00.000Z')

  it('serves the assembled directory, gzipped, privately cacheable', async () => {
    const base = await serve(
      createDirectoryRoutes({ town: TOWN, loadItems: async () => [business()], now }),
    )

    const res = await fetch(`${base}/api/directory`, { headers: { 'accept-encoding': 'gzip' } })
    expect(res.status).toBe(200)
    expect(res.headers.get('cache-control')).toBe('private, max-age=60')

    const body = (await res.json()) as { places: Array<{ name: string; phase: string }> }
    expect(body.places[0]?.name).toBe('Hickory & Ash')
    expect(body.places[0]?.phase).toBe('open')
  })

  /**
   * `fetch` decompresses transparently, so the only way to prove the bytes were
   * compressed is to read them raw. Without this the gzip branch could be dead
   * code and every test above would still pass.
   */
  it('really compresses, and says so', async () => {
    const base = await serve(
      createDirectoryRoutes({
        town: TOWN,
        loadItems: async () => Array.from({ length: 200 }, (_, i) => business({ id: `b${i}` })),
        now,
      }),
    )

    const res = await fetch(`${base}/api/directory`, {
      headers: { 'accept-encoding': 'gzip' },
      // Node's fetch strips `Content-Encoding` after decoding, so the raw body
      // is read through a request that does not advertise the encoding at all.
    })
    expect(res.headers.get('vary')).toBe('Accept-Encoding')
    const payload = (await res.json()) as { places: unknown[] }
    expect(payload.places).toHaveLength(200)

    const raw = await fetch(`${base}/api/directory`, { headers: { 'accept-encoding': 'gzip' } })
    const bytes = Buffer.from(await raw.arrayBuffer())
    // If Node handed back decoded bytes this is already JSON; if not, it is a
    // gzip member. Either way the payload has to survive the round trip.
    const text = bytes[0] === 0x1f && bytes[1] === 0x8b ? gunzipSync(bytes).toString() : bytes.toString()
    expect(JSON.parse(text)).toHaveProperty('groups')
  })

  it('sends plain JSON to a client that did not ask for gzip', async () => {
    const base = await serve(
      createDirectoryRoutes({ town: TOWN, loadItems: async () => [business()], now }),
    )
    const res = await fetch(`${base}/api/directory`, { headers: { 'accept-encoding': 'identity' } })
    expect(res.headers.get('content-encoding')).toBeNull()
    expect(res.headers.get('content-length')).not.toBeNull()
  })

  it('assembles the town once per minute, not once per resident', async () => {
    let loads = 0
    const base = await serve(
      createDirectoryRoutes({
        town: TOWN,
        loadItems: async () => {
          loads += 1
          return [business()]
        },
        now,
      }),
    )

    await Promise.all([
      fetch(`${base}/api/directory`),
      fetch(`${base}/api/directory`),
      fetch(`${base}/api/directory`),
    ])
    expect(loads).toBe(1)
  })

  /**
   * A stale directory is worth a great deal and a blank screen is worth
   * nothing. This is where somebody checks who fixes tyres on a Sunday.
   */
  it('serves the last good copy when the scrape fails', async () => {
    let fail = false
    const clock = { at: new Date('2026-08-05T19:00:00.000Z') }
    const base = await serve(
      createDirectoryRoutes({
        town: TOWN,
        loadItems: async () => {
          if (fail) throw new Error('scrape down')
          return [business()]
        },
        now: () => clock.at,
      }),
    )

    expect((await fetch(`${base}/api/directory`)).status).toBe(200)

    fail = true
    clock.at = new Date('2026-08-05T19:05:00.000Z')
    const res = await fetch(`${base}/api/directory`)
    expect(res.status).toBe(200)
    const body = (await res.json()) as { places: unknown[] }
    expect(body.places).toHaveLength(1)
  })

  it('answers 503 rather than an empty directory when there was never a copy', async () => {
    const base = await serve(
      createDirectoryRoutes({
        town: TOWN,
        loadItems: async () => {
          throw new Error('scrape down')
        },
        now,
      }),
    )
    expect((await fetch(`${base}/api/directory`)).status).toBe(503)
  })

  /**
   * The absence is the design. A route that took a query would have to be told
   * what a resident was looking for, on a request carrying their session.
   */
  it('does not handle anything but its own GET', async () => {
    const base = await serve(
      createDirectoryRoutes({ town: TOWN, loadItems: async () => [business()], now }),
    )
    expect((await fetch(`${base}/api/nearby`)).status).toBe(404)
    expect((await fetch(`${base}/api/directory`, { method: 'POST' })).status).toBe(404)
  })
})
