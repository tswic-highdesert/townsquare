/**
 * The resident's door onto moderation, and the only one they have.
 *
 * One route, deliberately. A resident can say "a human should look at this" and
 * that is the whole surface: there is no list of other people's reports to read,
 * no count of how many a creation has, and no way to learn whether anything came
 * of one. All three would turn a report into a public signal, and a public
 * signal is a thing worth manufacturing.
 *
 * Note what this route does *not* check. Verification, duplicates and the daily
 * cap are all enforced in `Reports.file`, because they are rules about reporting
 * rather than rules about HTTP, and the next door onto reporting — a mobile
 * client, a CLI — must not be able to arrive without them.
 */

import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Identity } from '@townsquare/identity'
import {
  REPORT_REASONS,
  ReviewError,
  type ReportReason,
  type Reports,
} from '@townsquare/review'
import { originAllowed, readCookie, readFields, sendJson, str } from './http.js'
import { cookieName } from './identityRoutes.js'

export interface ReportRoutesConfig {
  identity: Identity
  reports: Reports
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

export function createReportRoutes(cfg: ReportRoutesConfig) {
  const SESSION_COOKIE = cookieName(cfg.shellOrigin)

  return async function handle(
    req: IncomingMessage,
    res: ServerResponse,
    url: URL,
  ): Promise<boolean> {
    if (url.pathname !== '/api/reports') return false

    if (req.method !== 'POST') {
      sendJson(res, { error: 'not_found' }, 404)
      return true
    }
    if (!originAllowed(req, cfg.shellOrigin)) {
      sendJson(res, { error: 'forbidden', message: 'Bad origin.' }, 403)
      return true
    }

    const user = await cfg.identity.resolveSession(readCookie(req, SESSION_COOKIE))
    if (!user) {
      sendJson(res, { error: 'unauthenticated', message: 'Sign in first.' }, 401)
      return true
    }

    const body = await readFields(req)
    const reason = str(body, 'reason') as ReportReason
    if (!REPORT_REASONS.includes(reason)) {
      sendJson(
        res,
        { error: 'invalid', message: `reason must be one of ${REPORT_REASONS.join(', ')}` },
        400,
      )
      return true
    }

    try {
      // Verification is read from the session's user on every call rather than
      // trusted from anything the client sent, so a vouch granted a minute ago
      // counts and a revoked one stops counting immediately.
      const filed = await cfg.reports.file(
        { userId: user.id, handle: user.handle, verified: user.verifiedResident },
        {
          townId: cfg.townId,
          slug: str(body, 'slug'),
          reason,
          detail: str(body, 'detail'),
          version: str(body, 'version'),
        },
      )

      // The reporter gets their own report back and nothing else — not the
      // queue position, not how many others reported the same thing.
      sendJson(res, {
        report: {
          id: filed.report.id,
          reason: filed.report.reason,
          targetLabel: filed.report.targetLabel,
          createdAt: filed.report.createdAt,
        },
        duplicate: filed.duplicate,
      })
      return true
    } catch (err) {
      if (err instanceof ReviewError) {
        sendJson(res, { error: err.code, message: err.message }, STATUS[err.code])
        return true
      }
      throw err
    }
  }
}
