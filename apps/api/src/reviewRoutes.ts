/**
 * The reviewer's door onto the queue.
 *
 * Session-authenticated and role-gated, and note which of those does the work:
 * the role check that actually decides lives in `Review.decide`, not here. This
 * module refuses early so an unauthorised caller gets a clean 403 instead of a
 * 500 from an exception thrown three layers down, but a second door onto the
 * queue later — a CLI, a script, a cron — inherits the real check for free.
 *
 * Moderation is a **group-held role**, not an owner account. Tal is the only
 * member of the Russellville committee at launch, and nothing here assumes that
 * stays true: every check is `role in (moderator, admin)`, never "is the owner".
 */

import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Identity } from '@townsquare/identity'
import { ReviewError, type Decision, type Review } from '@townsquare/review'
import { originAllowed, readCookie, readFields, sendJson, str } from './http.js'
import { cookieName } from './identityRoutes.js'

export interface ReviewRoutesConfig {
  identity: Identity
  review: Review
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
