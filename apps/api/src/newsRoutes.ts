/**
 * `GET /api/news` and `GET /api/news/stories/:id` — the news surface.
 *
 * Same shape as `todayRoutes.ts` and for the same reasons: the assembly is a
 * pure function in `news.ts`, this file is the wrapper that caches it and
 * writes it down a socket. Nothing here reads a cookie. The news is the same
 * for every resident in town, which is what makes it cacheable at all.
 *
 * The topic filter is applied inside the assembler rather than by slicing the
 * response, so a filtered screen is assembled by the same rules as the whole
 * one — the lead of `?topic=sports` is `pickLead` over the sports stories, not
 * the town's lead with the wrong stories under it.
 */

import type { IncomingMessage, ServerResponse } from 'node:http'
import { sources } from '../../../packages/feed/src/data/sources.js'
import {
  assembleNews,
  assembleStory,
  type NewsPayload,
  type NewsSourceInfo,
  type ReaderPayload,
} from './news.js'
import type { TownSquareItem } from './today.js'

export interface NewsRoutesConfig {
  town: { id: string; name: string; timezone: string }
  /**
   * Injected, not imported, for the same reason `todayRoutes` injects it: the
   * scrapers live behind `tsconfig.ported.json` and must not be dragged into
   * this app's strict graph. It also means a test never reaches the network.
   */
  loadItems: () => Promise<readonly TownSquareItem[]>
  now?: () => Date
}

/**
 * A minute, matching Today.
 *
 * `getAllItemsAsync` caches its scrapes for fifteen, so this is not about
 * upstream load. It is about the assembly, which walks eleven hundred items,
 * formats a date through `Intl` for every story and compares every headline
 * against every other one. Two screens built off the same items disagreeing
 * about what time it is would be worse than either being a minute stale.
 */
const TTL_MS = 60_000

const SOURCE_INDEX: ReadonlyMap<string, NewsSourceInfo> = new Map(
  sources.map((s) => [s.id, { id: s.id, name: s.name, type: s.type }]),
)

/**
 * A story id, as it may appear in a path.
 *
 * The scrapers mint ids like `courier-www-couriernews-com-news-pcso-r-198ms42`
 * — lowercase, dashes, digits. Anything outside that never reaches the
 * assembler: the id is only ever compared against ids we already hold, but a
 * path segment is attacker-controlled input and the cheapest place to say what
 * it is allowed to be is before it is used for anything.
 */
const STORY_ID = /^[A-Za-z0-9._-]{1,200}$/

export function createNewsRoutes(cfg: NewsRoutesConfig) {
  const clock = cfg.now ?? (() => new Date())

  /** One cache slot per topic, because the payload differs by topic. */
  const cached = new Map<string, { at: number; payload: NewsPayload }>()
  const inFlight = new Map<string, Promise<NewsPayload>>()

  /**
   * The items, shared across every topic and both routes.
   *
   * Without this, opening a story after filtering the feed rebuilds the town
   * from the scrapers twice. Same in-flight sharing as Today: a cold start
   * takes as long as the slowest source, and a dozen residents at 7am should
   * be one fetch.
   */
  let itemsCache: { at: number; items: readonly TownSquareItem[] } | null = null
  let itemsInFlight: Promise<readonly TownSquareItem[]> | null = null

  async function items(): Promise<readonly TownSquareItem[]> {
    const now = clock().getTime()
    if (itemsCache && now - itemsCache.at < TTL_MS) return itemsCache.items
    if (itemsInFlight) return itemsInFlight

    itemsInFlight = cfg
      .loadItems()
      .then((loaded) => {
        itemsCache = { at: clock().getTime(), items: loaded }
        return loaded
      })
      .finally(() => {
        itemsInFlight = null
      })

    /**
     * A failed scrape serves the last good screen, not an error.
     *
     * The same trade Today makes. Stale news that says how stale it is beats a
     * blank page, and the sign-off carries the time the payload was assembled
     * so a resident can see it.
     */
    return itemsInFlight.catch((err: unknown) => {
      if (itemsCache) return itemsCache.items
      throw err
    })
  }

  async function feed(topic: string | null): Promise<NewsPayload> {
    const key = topic ?? '*'
    const now = clock().getTime()
    const hit = cached.get(key)
    if (hit && now - hit.at < TTL_MS) return hit.payload
    const pending = inFlight.get(key)
    if (pending) return pending

    const build = items()
      .then((loaded) =>
        assembleNews({
          now: clock().toISOString(),
          town: cfg.town,
          items: loaded,
          sources: SOURCE_INDEX,
          topic,
        }),
      )
      .then((payload) => {
        cached.set(key, { at: clock().getTime(), payload })
        return payload
      })
      .finally(() => {
        inFlight.delete(key)
      })

    inFlight.set(key, build)
    return build
  }

  async function story(id: string): Promise<ReaderPayload | null> {
    return assembleStory({
      now: clock().toISOString(),
      town: cfg.town,
      items: await items(),
      sources: SOURCE_INDEX,
      storyId: id,
    })
  }

  function send(res: ServerResponse, status: number, body: unknown): void {
    res.writeHead(status, {
      'Content-Type': 'application/json; charset=utf-8',
      // The shell may reuse it briefly; nothing in between may. A shared cache
      // in front of a per-town screen is a per-town bug.
      ...(status === 200 ? { 'Cache-Control': 'private, max-age=30' } : {}),
    })
    res.end(JSON.stringify(body))
  }

  async function handle(req: IncomingMessage, res: ServerResponse, url: URL): Promise<boolean> {
    if (req.method !== 'GET') return false

    if (url.pathname === '/api/news') {
      try {
        send(res, 200, await feed(url.searchParams.get('topic')))
      } catch (err) {
        console.error('news: could not assemble the feed', err)
        send(res, 503, { error: 'unavailable' })
      }
      return true
    }

    const match = /^\/api\/news\/stories\/([^/]+)$/.exec(url.pathname)
    if (match) {
      const id = decodeURIComponent(match[1] ?? '')
      if (!STORY_ID.test(id)) {
        send(res, 404, { error: 'not_found' })
        return true
      }
      try {
        const found = await story(id)
        if (!found) send(res, 404, { error: 'not_found' })
        else send(res, 200, found)
      } catch (err) {
        console.error('news: could not assemble a story', err)
        send(res, 503, { error: 'unavailable' })
      }
      return true
    }

    return false
  }

  /** Warm the unfiltered feed at boot, so the first resident does not wait. */
  function warm(): void {
    void feed(null).catch((err: unknown) => {
      console.warn('news: initial build failed, will retry on first request', err)
    })
  }

  return Object.assign(handle, { warm })
}
