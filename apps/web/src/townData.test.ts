/**
 * The shell's side of `town.*`: which URL each call reaches, and what a
 * creation is told when the API says no.
 *
 * The case that matters most is the error mapping. A malformed cursor must
 * reach the creation as `invalid_request`, which generated code knows not to
 * retry, rather than as `unavailable`, which it will retry forever.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { BridgeCallError } from '@townsquare/host'
import { createTownData } from './townData.js'

const calls: string[] = []
let reply: { status: number; body: unknown } = { status: 200, body: { items: [], nextCursor: null } }

beforeEach(() => {
  calls.length = 0
  reply = { status: 200, body: { items: [], nextCursor: null } }
  vi.stubGlobal('window', { location: { origin: 'http://townsquare.localhost:5173' } })
  vi.stubGlobal('fetch', async (url: URL, init: RequestInit) => {
    calls.push(`${init.credentials} ${url.pathname}${url.search}`)
    return new Response(JSON.stringify(reply.body), { status: reply.status })
  })
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('createTownData', () => {
  const town = createTownData('russellville-ar')

  it('reads businesses and items from the Tier 1 routes, anonymously', async () => {
    await town.businesses({ tag: 'senior', limit: 200 })
    await town.items({ type: 'event', since: '2026-08-01' })
    expect(calls).toEqual([
      'omit /api/v1/towns/russellville-ar/businesses?tag=senior&limit=200',
      'omit /api/v1/towns/russellville-ar/items?type=event&since=2026-08-01',
    ])
  })

  it('answers null for an item the API cannot find', async () => {
    reply = { status: 404, body: { error: 'not_found' } }
    await expect(town.item('council/2026-08-05')).resolves.toBeNull()
    expect(calls).toEqual(['omit /api/v1/towns/russellville-ar/items/council%2F2026-08-05'])
  })

  it('passes an SDK error code through, and flattens anything else to unavailable', async () => {
    reply = { status: 400, body: { error: 'invalid_request', message: 'bad cursor' } }
    const bad = await town.businesses({ cursor: 'x' }).catch((e: unknown) => e)
    expect(bad).toBeInstanceOf(BridgeCallError)
    expect((bad as BridgeCallError).wire).toMatchObject({ code: 'invalid_request', message: 'bad cursor' })

    reply = { status: 500, body: { error: 'postgres exploded at 10.0.0.4' } }
    const down = await town.items({}).catch((e: unknown) => e)
    expect((down as BridgeCallError).wire).toMatchObject({ code: 'unavailable' })
    expect((down as BridgeCallError).wire.message).not.toContain('10.0.0.4')
  })
})
