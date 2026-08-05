/**
 * `GET /api/today` — the resident home, in one request.
 *
 * The screen is six sections from six unrelated sources, and the alternative is
 * six round trips that arrive out of order and paint the page in pieces. Today
 * is the one screen a resident opens and glances at, so it renders once.
 *
 * Nothing here reads a cookie. Today is the same for every resident in town,
 * which is the reason it can be cached at all — and the reason this route is
 * safe to sit beside the credentialed ones without inheriting their care.
 */

import type { IncomingMessage, ServerResponse } from 'node:http'
import { sources } from '../../../packages/feed/src/data/sources.js'
import {
  assembleToday,
  type TodayPayload,
  type TodaySource,
  type TownSquareItem,
} from './today.js'

export interface TodayCreationInput {
  slug: string
  name: string
  tagline: string
  description: string
  author?: string | null
  icon?: string | null
}

export interface TodayRoutesConfig {
  town: { id: string; name: string; timezone: string }
  /** Read at request time, so a creation approved a minute ago is on the screen. */
  listCreations: () => TodayCreationInput[]
  /**
   * Where the town's items come from.
   *
   * Injected rather than imported, for the same reason the types above take
   * the deep path: the scrapers live behind `tsconfig.ported.json` and must
   * not be dragged into this app's strict graph. It also means a test never
   * reaches the network.
   */
  loadItems: () => Promise<readonly TownSquareItem[]>
  now?: () => Date
}

/**
 * A minute.
 *
 * `getAllItemsAsync` already caches its scrapes for fifteen, so this is not
 * about upstream load — it is about the assembly, which walks eleven hundred
 * items and formats dates through `Intl` for each one. A minute is short enough
 * that "happening today" never shows something that has finished, and long
 * enough that a resident refreshing does not pay for it.
 */
const TTL_MS = 60_000

const SOURCE_INDEX: ReadonlyMap<string, TodaySource> = new Map(
  sources.map((s) => [s.id, { id: s.id, name: s.name, type: s.type }]),
)

export function createTodayRoutes(cfg: TodayRoutesConfig) {
  const load = cfg.loadItems
  const clock = cfg.now ?? (() => new Date())

  let cached: { at: number; payload: TodayPayload } | null = null
  /**
   * The in-flight promise, not just the result.
   *
   * A cold start takes as long as the slowest scraper, and without this a
   * dozen residents opening the app at 7am would each begin their own fetch of
   * every source in town. Sharing the promise makes the stampede one request.
   */
  let inFlight: Promise<TodayPayload> | null = null

  async function build(): Promise<TodayPayload> {
    const items = await load()
    return assembleToday({
      now: clock().toISOString(),
      town: cfg.town,
      items,
      creations: cfg.listCreations(),
      sources: SOURCE_INDEX,
    })
  }

  async function payload(): Promise<TodayPayload> {
    const now = clock().getTime()
    if (cached && now - cached.at < TTL_MS) return cached.payload
    if (inFlight) return inFlight

    inFlight = build()
      .then((p) => {
        cached = { at: clock().getTime(), payload: p }
        return p
      })
      .finally(() => {
        inFlight = null
      })

    /**
     * A failed scrape serves yesterday's screen rather than an error.
     *
     * Town Square is where someone checks whether the council meets tonight. A
     * stale answer to that is worth a great deal; a blank page is worth
     * nothing, and the staleness is visible on the screen itself because the
     * footer carries the time it was assembled.
     */
    return inFlight.catch((err: unknown) => {
      if (cached) return cached.payload
      throw err
    })
  }

  /** Warm the cache at boot so the first resident of the day does not wait. */
  function warm(): void {
    void payload().catch((err: unknown) => {
      console.warn('today: initial build failed, will retry on first request', err)
    })
  }

  async function handle(req: IncomingMessage, res: ServerResponse, url: URL): Promise<boolean> {
    if (url.pathname !== '/api/today' || req.method !== 'GET') return false

    try {
      const body = await payload()
      res.writeHead(200, {
        'Content-Type': 'application/json; charset=utf-8',
        // The shell may reuse it briefly; nothing in between may, because a
        // shared cache in front of a per-town screen is a per-town bug.
        'Cache-Control': 'private, max-age=30',
      })
      res.end(JSON.stringify(body))
    } catch (err) {
      console.error('today: could not assemble', err)
      res.writeHead(503, { 'Content-Type': 'application/json; charset=utf-8' })
      res.end(JSON.stringify({ error: 'unavailable' }))
    }
    return true
  }

  return Object.assign(handle, { warm })
}
