/**
 * The reviewer's door onto the queue, the report queue, and the live gallery.
 *
 * Session-authenticated and role-gated, and note which of those does the work:
 * the role check that actually decides lives in `Review.decide`, `Reports` and
 * `Moderation`, not here. This module refuses early so an unauthorised caller
 * gets a clean answer instead of a 500 from an exception thrown three layers
 * down, but a second door onto any of it later — a CLI, a script, a cron —
 * inherits the real check for free.
 *
 * Everything moderator-facing is behind one gate, on purpose. Three surfaces
 * with three gates is three places for one of them to be subtly different, and
 * the report queue is the most sensitive thing in the system: it names which
 * resident said what about which neighbour.
 *
 * Moderation is a **group-held role**, not an owner account. Tal is the only
 * member of the Russellville committee at launch, and nothing here assumes that
 * stays true: every check is `role in (moderator, admin)`, never "is the owner".
 */

import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Identity } from '@townsquare/identity'
import {
  ReviewError,
  type Decision,
  type Moderation,
  type Reports,
  type Review,
} from '@townsquare/review'
import { originAllowed, readCookie, readFields, sendJson, str } from './http.js'
import { cookieName } from './identityRoutes.js'

export interface ReviewRoutesConfig {
  identity: Identity
  review: Review
  reports: Reports
  moderation: Moderation
  shellOrigin: string
  townId: string
}

const STATUS: Record<ReviewError['code'], number> = {
  forbidden: 403,
  not_found: 404,
  conflict: 409,
  invalid: 400,
  stale: 409,
}

const DECISIONS: readonly Decision[] = ['approve', 'reject', 'request_changes']
const ACTIONS = ['hide', 'block', 'restore', 'revert'] as const
type Action = (typeof ACTIONS)[number]
const RESOLUTIONS = ['upheld', 'dismissed'] as const
type Resolution = (typeof RESOLUTIONS)[number]

/** Ids are uuids in production and short strings in tests; neither is a path. */
const ID = '([A-Za-z0-9-]{1,64})'

export function createReviewRoutes(cfg: ReviewRoutesConfig) {
  const SESSION_COOKIE = cookieName(cfg.shellOrigin)

  return async function handle(
    req: IncomingMessage,
    res: ServerResponse,
    url: URL,
  ): Promise<boolean> {
    const path = url.pathname
    if (!path.startsWith('/api/review/')) return false

    const method = req.method ?? 'GET'
    if (method !== 'GET' && !originAllowed(req, cfg.shellOrigin)) {
      sendJson(res, { error: 'forbidden', message: 'Bad origin.' }, 403)
      return true
    }

    const user = await cfg.identity.resolveSession(readCookie(req, SESSION_COOKIE))
    if (!user) {
      sendJson(res, { error: 'unauthenticated', message: 'Sign in first.' }, 401)
      return true
    }

    // A resident who is not on the committee is told this route does not exist
    // rather than that they are not allowed. The queue's shape — how much is
    // pending, whose work is in it — is not public information.
    if (user.role !== 'moderator' && user.role !== 'admin') {
      sendJson(res, { error: 'not_found' }, 404)
      return true
    }

    const reviewer = { userId: user.id, handle: user.handle, role: user.role }

    try {
      if (path === '/api/review/queue' && method === 'GET') {
        sendJson(res, { items: await cfg.review.queue(cfg.townId) })
        return true
      }

      const detail = /^\/api\/review\/submissions\/([A-Za-z0-9-]{1,64})$/.exec(path)
      if (detail && method === 'GET') {
        sendJson(res, await cfg.review.detail(detail[1]!))
        return true
      }

      const decide = /^\/api\/review\/submissions\/([A-Za-z0-9-]{1,64})\/decide$/.exec(path)
      if (decide && method === 'POST') {
        const body = await readFields(req)
        const decision = str(body, 'decision') as Decision
        if (!DECISIONS.includes(decision)) {
          sendJson(
            res,
            { error: 'invalid', message: `decision must be one of ${DECISIONS.join(', ')}` },
            400,
          )
          return true
        }
        // A rejection with no reason is a dead end for the builder, who then has
        // to guess. The one field the reviewer must type is the useful one.
        const note = str(body, 'note').slice(0, 4000)
        if (decision !== 'approve' && !note.trim()) {
          sendJson(
            res,
            { error: 'invalid', message: 'say why: this note is what the builder reads' },
            400,
          )
          return true
        }

        const result = await cfg.review.decide(reviewer, decide[1]!, decision, note)
        sendJson(res, result)
        return true
      }

      // ── reports ────────────────────────────────────────────────────────────

      if (path === '/api/review/reports' && method === 'GET') {
        sendJson(res, { items: await cfg.reports.open(reviewer, cfg.townId) })
        return true
      }

      const resolve = new RegExp(`^/api/review/reports/${ID}/resolve$`).exec(path)
      if (resolve && method === 'POST') {
        const body = await readFields(req)
        const resolution = str(body, 'resolution') as Resolution
        if (!RESOLUTIONS.includes(resolution)) {
          sendJson(
            res,
            { error: 'invalid', message: `resolution must be one of ${RESOLUTIONS.join(', ')}` },
            400,
          )
          return true
        }
        const note = str(body, 'note').slice(0, 4000)
        sendJson(res, await cfg.reports.resolve(reviewer, resolve[1]!, resolution, note))
        return true
      }

      // ── creations that are already live ────────────────────────────────────

      if (path === '/api/review/creations' && method === 'GET') {
        sendJson(res, { items: await cfg.moderation.creations(reviewer, cfg.townId) })
        return true
      }

      const creation = new RegExp(`^/api/review/creations/${ID}$`).exec(path)
      if (creation && method === 'GET') {
        sendJson(res, await cfg.moderation.detail(reviewer, creation[1]!))
        return true
      }

      const moderate = new RegExp(`^/api/review/creations/${ID}/moderate$`).exec(path)
      if (moderate && method === 'POST') {
        const body = await readFields(req)
        const action = str(body, 'action') as Action
        if (!ACTIONS.includes(action)) {
          sendJson(
            res,
            { error: 'invalid', message: `action must be one of ${ACTIONS.join(', ')}` },
            400,
          )
          return true
        }
        // Every one of these is visible to residents and lands in an audit row
        // that outlives the moderator, so the reason is not optional — including
        // for a restore, where "why was this put back" is the whole question
        // anyone will ask later.
        const note = str(body, 'note').slice(0, 4000)
        if (!note.trim()) {
          sendJson(
            res,
            { error: 'invalid', message: 'say why: this goes in the moderation log' },
            400,
          )
          return true
        }

        if (action === 'revert') {
          const versionId = str(body, 'versionId')
          if (!versionId) {
            sendJson(res, { error: 'invalid', message: 'reverting needs a versionId' }, 400)
            return true
          }
          sendJson(res, await cfg.moderation.revert(reviewer, moderate[1]!, versionId, note))
          return true
        }

        sendJson(res, await cfg.moderation.act(reviewer, moderate[1]!, action, note))
        return true
      }
    } catch (err) {
      if (err instanceof ReviewError) {
        sendJson(res, { error: err.code, message: err.message }, STATUS[err.code])
        return true
      }
      throw err
    }

    sendJson(res, { error: 'not_found' }, 404)
    return true
  }
}
