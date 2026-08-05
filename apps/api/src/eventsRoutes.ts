/**
 * `GET /api/events`, `/api/events/month` and `/api/events/detail`.
 *
 * Shaped like `todayRoutes.ts` and `nearbyRoutes.ts`, and for the same reasons:
 * no cookie, the same answer for everyone in town, and therefore cacheable.
 *
 * One difference worth naming. Today and Nearby cache the *assembled payload*,
 * because each has exactly one of them. The calendar has 151 days and nine
 * months of them, so caching every shape would be a cache that never hits.
 * What is cached here is the expensive half — the scrape — behind one shared
 * in-flight promise. Assembly walks 343 events and is a fraction of a
 * millisecond; the fetch it sits on is seconds on a cold start.
 */

import type { IncomingMessage, ServerResponse } from 'node:http'
import { sources } from '../../../packages/feed/src/data/sources.js'
import {
  assembleDay,
  assembleDetail,
  assembleMonth,
  type EventTown,
  type SourceInfo,
} from './events.js'
import type { TownSquareItem } from './today.js'

export interface EventsRoutesConfig {
  town: EventTown
  /**
   * Injected rather than imported, so a test never reaches the network and the
   * scrapers stay behind `tsconfig.ported.json`. Same reason as Today.
   */
  loadItems: () => Promise<readonly TownSquareItem[]>
  now?: () => Date
}

/** A minute, matching Today and Nearby. */
const TTL_MS = 60_000

const SOURCE_INDEX: ReadonlyMap<string, SourceInfo> = new Map(
  sources.map((s) => [s.id, { id: s.id, name: s.name, ...(s.url ? { url: s.url } : {}) }]),
)

/** `2026-08-05`, and nothing that merely looks like it. */
const DAY = /^\d{4}-\d{2}-\d{2}$/
/** `2026-08` */
const MONTH = /^\d{4}-\d{2}$/

export function createEventsRoutes(cfg: EventsRoutesConfig) {
  const clock = cfg.now ?? (() => new Date())

  let cached: { at: number; items: readonly TownSquareItem[] } | null = null
  let inFlight: Promise<readonly TownSquareItem[]> | null = null

  async function items(): Promise<readonly TownSquareItem[]> {
    const now = clock().getTime()
    if (cached && now - cached.at < TTL_MS) return cached.items
    if (inFlight) return inFlight

    inFlight = cfg
      .loadItems()
      .then((loaded) => {
        cached = { at: clock().getTime(), items: loaded }
        return loaded
      })
      .finally(() => {
        inFlight = null
      })

    /**
     * A failed scrape serves the last good calendar rather than an error.
     *
     * This is where somebody checks whether the council meets tonight. A stale
     * answer to that is worth a great deal and a blank page is worth nothing,
     * and the staleness is on the screen because every payload carries
     * `generatedAt`.
     */
    return inFlight.catch((err: unknown) => {
      if (cached) return cached.items
      throw err
    })
  }

  /** Warm the cache at boot so the first resident of the day does not wait. */
  function warm(): void {
    void items().catch((err: unknown) => {
      console.warn('events: initial load failed, will retry on first request', err)
    })
  }

  async function handle(req: IncomingMessage, res: ServerResponse, url: URL): Promise<boolean> {
    if (req.method !== 'GET') return false
    if (!url.pathname.startsWith('/api/events')) return false

    const send = (body: unknown, status = 200): void => {
      res.writeHead(status, {
        'Content-Type': 'application/json; charset=utf-8',
        // Private, not public: a shared cache in front of a per-town screen is
        // a per-town bug the day Town Square is more than one town.
        'Cache-Control': status === 200 ? 'private, max-age=30' : 'no-store',
      })
      res.end(JSON.stringify(body))
    }

    try {
      const now = clock().toISOString()
      const base = { now, town: cfg.town, sources: SOURCE_INDEX }

      if (url.pathname === '/api/events') {
        const day = url.searchParams.get('day')
        // A malformed day is refused rather than silently treated as today. A
        // resident who followed a broken link should be told, not shown a
        // different day that looks authoritative.
        if (day !== null && !DAY.test(day)) {
          send({ error: 'bad_day' }, 400)
          return true
        }
        send(assembleDay({ ...base, items: await items(), ...(day ? { day } : {}) }))
        return true
      }

      if (url.pathname === '/api/events/month') {
        const month = url.searchParams.get('month')
        if (month !== null && !MONTH.test(month)) {
          send({ error: 'bad_month' }, 400)
          return true
        }
        send(assembleMonth({ ...base, items: await items(), ...(month ? { month } : {}) }))
        return true
      }

      if (url.pathname === '/api/events/detail') {
        const id = url.searchParams.get('id')
        if (!id) {
          send({ error: 'bad_id' }, 400)
          return true
        }
        const detail = assembleDetail({ ...base, items: await items(), id })
        // An event that has rolled off the feed is genuinely gone, and 404 is
        // the honest answer. The screen says so rather than showing a shell.
        send(detail ?? { error: 'not_found' }, detail ? 200 : 404)
        return true
      }

      return false
    } catch (err) {
      console.error('events: could not assemble', err)
      res.writeHead(503, { 'Content-Type': 'application/json; charset=utf-8' })
      res.end(JSON.stringify({ error: 'unavailable' }))
      return true
    }
  }

  return Object.assign(handle, { warm })
}
