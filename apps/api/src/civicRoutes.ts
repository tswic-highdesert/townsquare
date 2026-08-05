/**
 * Civic: notices, city hall, and what a resident agreed to be woken up for.
 *
 * ```
 * GET  /api/civic                      the town's civic screen
 * POST /api/civic/notices/:id/seen     mark one read
 * POST /api/civic/notices/:id/hide     hide it until the source changes it
 * GET  /api/civic/alerts               the subscription settings
 * POST /api/civic/alerts               change them
 * ```
 *
 * **`GET /api/civic` does not require a session, and that is the most important
 * line in this file.** A tornado warning has to reach somebody who installed
 * the app an hour ago and never signed in, somebody whose session expired
 * while they were asleep, and somebody holding a phone that is not theirs. An
 * emergency surface behind an auth wall is an emergency surface that fails on
 * the night it matters. So the stream is public, exactly as `today` and
 * `nearby` are, and a cookie only ever *adds* the resident's own read and
 * hidden state on top of it.
 *
 * The rules are all in `@townsquare/civic`: the ladder, the decay from takeover
 * to bar to line, which rung may push, and the fact that an emergency ignores
 * every threshold. This file reads a cookie when there is one, maps an error
 * code to a status, and nothing else.
 */

import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Identity } from '@townsquare/identity'
import {
  Alerts,
  AlertsError,
  assembleMeetings,
  assembleNotices,
  presentFor,
  quietState,
  type AuthoredNotice,
  type IngestedEvent,
  type IngestedNotice,
  type NoticeStateStore,
} from '@townsquare/civic'
import { originAllowed, readCookie, readFields, sendJson, str } from './http.js'
import { cookieName } from './identityRoutes.js'

export interface CivicRoutesConfig {
  identity: Identity
  alerts: Alerts
  noticeStates: NoticeStateStore
  /**
   * The town's ingested items, loaded through the same runtime-only path
   * `main.ts` uses. Injected as a function so this module never names
   * `@townsquare/feed` and cannot drag the scrapers into the strict typecheck.
   */
  loadItems: () => Promise<readonly unknown[]>
  /** Source id to printable name, from the feed's registry. */
  sourceNames: Readonly<Record<string, string>>
  /**
   * The sources that actually produce notices, by printable name.
   *
   * Passed in rather than derived from whatever happened to arrive, because the
   * quiet state has to name what we checked on a day when nothing came back,
   * and a list derived from an empty result is an empty list. This is the one
   * place the surface asserts something on a screen with no data on it, so it
   * must come from the registry rather than from the payload.
   */
  noticeSources: readonly string[]
  /** What the town is called, for the sentence on a quiet day. */
  townName: string
  /**
   * Notices residents' organisations published, from the contribution service.
   *
   * A function rather than a direct dependency, so the civic read surface does
   * not import the write side to render a card.
   */
  authoredNotices: () => Promise<readonly AuthoredNotice[]>
  /**
   * How long an assembled payload is reused. Sixty seconds unless overridden.
   *
   * Matched to the upstream poll rather than chosen for load: section 9's own
   * provenance line says the National Weather Service alert feed is checked
   * every sixty seconds, so a minute of cache here adds no staleness that the
   * source did not already have. Injectable because a test asserting how a
   * notice decays should not have to wait out an unrelated optimisation.
   */
  cacheMs?: number
  shellOrigin: string
  townId: string
}

const STATUS: Record<AlertsError['code'], number> = { invalid: 400, not_found: 404 }

/**
 * The in-flight promise is shared for the same reason `today` shares one: a
 * cold build takes as long as the slowest scraper, and a whole town opening the
 * app at once during a storm is exactly when that must not happen once per
 * resident.
 */
const DEFAULT_CACHE_MS = 60_000

export function createCivicRoutes(cfg: CivicRoutesConfig) {
  const SESSION_COOKIE = cookieName(cfg.shellOrigin)
  const cacheMs = cfg.cacheMs ?? DEFAULT_CACHE_MS

  interface TownWide {
    notices: ReturnType<typeof assembleNotices>
    meetings: ReturnType<typeof assembleMeetings>
    fetchedAt: number
  }

  let cachedAt = 0
  let cached: TownWide | null = null
  let inFlight: Promise<TownWide> | null = null

  async function townWide(): Promise<TownWide> {
    const now = Date.now()
    if (cached && now - cachedAt < cacheMs) return cached
    if (inFlight) return inFlight

    inFlight = (async () => {
      const items = await cfg.loadItems()
      const notices: IngestedNotice[] = []
      const events: IngestedEvent[] = []
      for (const raw of items) {
        const item = raw as { type?: string }
        if (item.type === 'notice') notices.push(raw as IngestedNotice)
        else if (item.type === 'event') events.push(raw as IngestedEvent)
      }

      // One fetch time for every source in this pass. Per-source timing would
      // need the loader to report it, and claiming a more precise number than
      // we actually have is the opposite of what a provenance line is for.
      const at = Date.now()
      const fetchedAt: Record<string, number> = {}
      for (const notice of notices) fetchedAt[notice.source] = at

      const built: TownWide = {
        notices: assembleNotices({
          ingested: notices,
          authored: await cfg.authoredNotices(),
          sourceNames: cfg.sourceNames,
          fetchedAt,
          now: at,
        }),
        meetings: assembleMeetings(events, at),
        fetchedAt: at,
      }
      cached = built
      cachedAt = Date.now()
      return built
    })().finally(() => {
      inFlight = null
    })

    return inFlight
  }

  return async function handle(
    req: IncomingMessage,
    res: ServerResponse,
    url: URL,
  ): Promise<boolean> {
    const path = url.pathname
    if (path !== '/api/civic' && !path.startsWith('/api/civic/')) return false

    const method = req.method ?? 'GET'
    if (method !== 'GET' && !originAllowed(req, cfg.shellOrigin)) {
      sendJson(res, { error: 'forbidden', message: 'Bad origin.' }, 403)
      return true
    }

    // Read once, and never required for the screen itself.
    const user =
      method === 'GET' && path === '/api/civic'
        ? await cfg.identity.resolveSession(readCookie(req, SESSION_COOKIE)).catch(() => null)
        : await cfg.identity.resolveSession(readCookie(req, SESSION_COOKIE))

    try {
      if (path === '/api/civic' && method === 'GET') {
        const town = await townWide()
        const states = user ? await cfg.noticeStates.forUser(cfg.townId, user.id) : []
        const now = Date.now()

        sendJson(res, {
          // Presented for whoever is asking. Signed out, nothing has been seen
          // and nothing is hidden, so an emergency takes over the screen —
          // which is the correct behaviour for a stranger's phone.
          notices: presentFor(town.notices, states, now),
          meetings: town.meetings,
          /**
           * The designed silence, not a null.
           *
           * A blank civic screen and a civic screen whose scrapers all died
           * look identical to a resident, and telling those apart is the whole
           * value of this surface on the morning somebody is wondering whether
           * the water is safe. So a quiet day ships the sources we polled and
           * when, which is the same provenance a notice would have carried.
           */
          quiet:
            town.notices.length === 0
              ? quietState({
                  townName: cfg.townName,
                  watching: cfg.noticeSources,
                  checkedAt: town.fetchedAt,
                })
              : null,
          assembledAt: town.fetchedAt,
        })
        return true
      }

      if (!user) {
        sendJson(res, { error: 'unauthenticated', message: 'Sign in first.' }, 401)
        return true
      }

      const seen = /^\/api\/civic\/notices\/([A-Za-z0-9._-]{1,128})\/seen$/.exec(path)
      if (seen?.[1] && method === 'POST') {
        const body = await readFields(req)
        await cfg.noticeStates.put(cfg.townId, user.id, {
          noticeId: seen[1],
          // Against the digest the resident actually read, so an update from
          // the source makes this stale and the notice comes back at full
          // weight rather than arriving already collapsed.
          seenAtDigest: str(body, 'digest') || null,
          hiddenAtDigest: str(body, 'hiddenAtDigest') || null,
        })
        sendJson(res, { ok: true })
        return true
      }

      const hide = /^\/api\/civic\/notices\/([A-Za-z0-9._-]{1,128})\/hide$/.exec(path)
      if (hide?.[1] && method === 'POST') {
        const body = await readFields(req)
        const digest = str(body, 'digest')
        if (!digest) {
          // Hiding without naming what was hidden would be a permanent
          // dismissal wearing the words of a temporary one.
          sendJson(res, { error: 'invalid', message: 'hiding needs the digest you saw' }, 400)
          return true
        }
        await cfg.noticeStates.put(cfg.townId, user.id, {
          noticeId: hide[1],
          seenAtDigest: digest,
          hiddenAtDigest: digest,
        })
        sendJson(res, { ok: true })
        return true
      }

      if (path === '/api/civic/alerts' && method === 'GET') {
        sendJson(res, await cfg.alerts.view(cfg.townId, user.id))
        return true
      }

      if (path === '/api/civic/alerts' && method === 'POST') {
        const body = await readFields(req)
        const patch: Parameters<Alerts['update']>[2] = {}
        if (body['threshold'] !== undefined) patch.threshold = body['threshold']
        if (body['topics'] !== undefined) patch.topics = body['topics']
        if (typeof body['quietHours'] === 'object' && body['quietHours'] !== null) {
          patch.quietHours = body['quietHours'] as Record<string, unknown>
        }
        sendJson(res, { preferences: await cfg.alerts.update(cfg.townId, user.id, patch) })
        return true
      }
    } catch (err) {
      if (err instanceof AlertsError) {
        sendJson(res, { error: err.code, message: err.message }, STATUS[err.code])
        return true
      }
      throw err
    }

    sendJson(res, { error: 'not_found' }, 404)
    return true
  }
}
