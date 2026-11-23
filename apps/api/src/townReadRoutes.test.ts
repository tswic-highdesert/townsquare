/**
 * The Tier 1 read routes over a real socket.
 *
 * `townRead.test.ts` owns the paging and projection rules. What this proves is
 * the HTTP contract the shell's bridge depends on: a malformed query is a 400
 * carrying `invalid_request`, a missing item is a 404 carrying `not_found`,
 * and the query string reaches the list intact.
 */

import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createTownReadRoutes } from './townReadRoutes.js'
import type { TownSquareItem } from './today.js'

const TOWN = { id: 'russellville-ar' }
const NOW = new Date('2026-08-05T14:00:00-05:00')
const common = { description: '', source: 'city-russellville', tags: [], community: 'Russellville' }

const ITEMS: TownSquareItem[] = [
  {
    ...common,
    type: 'event',
    id: 'council/2026-08-05',
    title: 'City council',
    location: 'City hall',
    startDate: '2026-08-05T17:30:00-05:00',
    createdAt: '2026-08-03T00:00:00Z',
    updatedAt: '2026-08-03T00:00:00Z',
  },
  {
    ...common,
    type: 'business',
    id: 'b1',
    title: 'Senior Center',
    name: 'Senior Center',
    category: 'Senior citizen center',
    address: '1 Main St',
    createdAt: '2026-07-01T00:00:00Z',
    updatedAt: '2026-07-01T00:00:00Z',
  },
  {
    ...common,
    type: 'business',
    id: 'b2',
    title: 'Pharmacy',
    name: 'Pharmacy',
    category: 'Pharmacy',
    address: '2 Main St',
    createdAt: '2026-07-01T00:00:00Z',
    updatedAt: '2026-07-01T00:00:00Z',
  },
]

let server: Server
let base: string

beforeAll(async () => {
  const routes = createTownReadRoutes({ town: TOWN, loadItems: async () => ITEMS, now: () => NOW })
  server = createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://localhost')
    void routes(req, res, url).then((handled) => {
      if (!handled) {
        res.writeHead(418)
        res.end()
      }
    })
  })
  await new Promise<void>((resolve) => server.listen(0, resolve))
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/v1/towns/russellville-ar`
})

afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())))

async function get(path: string): Promise<{ status: number; body: any }> {
  const res = await fetch(`${base}${path}`)
  return { status: res.status, body: await res.json() }
}

describe('GET /api/v1/towns/:townId/businesses', () => {
  it('filters by tag and pages with a cursor', async () => {
    const first = await get('/businesses?limit=1')
    expect(first.status).toBe(200)
    expect(first.body.items.map((b: { id: string }) => b.id)).toEqual(['b2'])

    const second = await get(`/businesses?limit=1&cursor=${encodeURIComponent(first.body.nextCursor)}`)
    expect(second.body).toEqual({ items: [expect.objectContaining({ id: 'b1' })], nextCursor: null })

    const senior = await get('/businesses?tag=senior&limit=200')
    expect(senior.body.items.map((b: { id: string }) => b.id)).toEqual(['b1'])
  })

  it('answers a malformed query with invalid_request', async () => {
    for (const q of ['limit=abc', 'limit=0', 'limit=500', 'cursor=junk', 'since=soon', `tag=${'x'.repeat(61)}`]) {
      const res = await get(`/businesses?${q}`)
      expect(res.status, q).toBe(400)
      expect(res.body.error, q).toBe('invalid_request')
    }
  })
})

describe('GET /api/v1/towns/:townId/items', () => {
  it('lists items and refuses an unknown type', async () => {
    const ok = await get('/items?type=event')
    expect(ok.body.items.map((i: { id: string }) => i.id)).toEqual(['council/2026-08-05'])

    const bad = await get('/items?type=business')
    expect(bad.status).toBe(400)
    expect(bad.body.error).toBe('invalid_request')
  })

  it('fetches one item by an encoded id, and 404s a missing one', async () => {
    const one = await get(`/items/${encodeURIComponent('council/2026-08-05')}`)
    expect(one.status).toBe(200)
    expect(one.body).toMatchObject({ id: 'council/2026-08-05', type: 'event' })

    const missing = await get('/items/nope')
    expect(missing.status).toBe(404)
    expect(missing.body.error).toBe('not_found')

    // A business is not an item, here as in the list.
    expect((await get('/items/b1')).status).toBe(404)
  })
})

describe('routing', () => {
  it('404s another town with not_found', async () => {
    const res = await fetch(base.replace('russellville-ar', 'fort-smith-ar') + '/items')
    expect(res.status).toBe(404)
    expect((await res.json()).error).toBe('not_found')
  })

  it('leaves paths it does not own to the next handler', async () => {
    const port = (server.address() as AddressInfo).port
    expect((await fetch(`http://127.0.0.1:${port}/api/businesses`)).status).toBe(418)
    expect((await fetch(`${base}/types`)).status).toBe(418)
  })
})
