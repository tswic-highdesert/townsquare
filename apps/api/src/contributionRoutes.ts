/**
 * The resident's door onto contributing.
 *
 * ```
 * GET  /api/contribute/options            the chooser, and where you are on the ladder
 * POST /api/contribute/when               read a date the way somebody would say it
 * GET  /api/contributions                 yours: proposals, drafts, the pause
 * GET  /api/contributions/:id             one of yours
 * POST /api/contributions                 propose something
 * POST /api/contributions/:id/withdraw    pull it back before anyone acts
 * GET  /api/drafts                        your drafts
 * POST /api/drafts                        autosave
 * POST /api/drafts/:id/discard            throw one away, for real
 * GET  /api/records/:id/history           every version there has ever been
 * ```
 *
 * Nothing here decides anything. The gate matrix, the standing checks, the
 * pause, the attribution and the re-validation at publish all live in
 * `@townsquare/contributions`, because they are rules about contributing rather
 * than rules about HTTP — the same split as `Reports.file` and `Saves.save`,
 * and it is what lets the MCP server grow a `contribute` tool later that
 * inherits every one of them instead of re-implementing four of them.
 *
 * What this file owns is the part that genuinely is HTTP: reading the session
 * cookie, refusing a cross-origin write, choosing a body limit, and mapping an
 * error code to a status.
 *
 * The moderator's side is deliberately *not* here. It is in `reviewRoutes.ts`,
 * behind the one role gate that already guards the submission queue and the
 * report queue, for the reason stated in that file: three surfaces with three
 * gates is three places for one of them to be subtly different.
 */

import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Identity } from '@townsquare/identity'
import {
  ContributionError,
  readWhen,
  type Contribution,
  type Contributions,
  type Contributor,
  type Drafts,
} from '@townsquare/contributions'
import { originAllowed, readCookie, readJson, sendJson, str } from './http.js'
import { cookieName } from './identityRoutes.js'

export interface ContributionRoutesConfig {
  identity: Identity
  contributions: Contributions
  drafts: Drafts
  shellOrigin: string
  townId: string
  timezone: string
}

const STATUS: Record<ContributionError['code'], number> = {
  invalid: 400,
  forbidden: 403,
  not_found: 404,
  conflict: 409,
  stale: 409,
  // Not 429. The design is explicit that this is a pause rather than a wall,
  // and 429 is the status a client library retries silently in a loop — which
  // is the one behaviour a limit built to make somebody *notice* cannot have.
  paused: 409,
  // The policy allows it, the plumbing does not exist. 501 rather than 400, so
  // nobody goes looking for the mistake in what they typed.
  unavailable: 501,
}

/**
 * A larger body than the 8 KB default.
 *
 * A collection can carry a hundred items and an event description runs to six
 * hundred characters, so the auth-shaped default would refuse legitimate work.
 * Still bounded, and still far below anything that would make this route worth
 * pointing at.
 */
const MAX_CONTRIBUTION_BYTES = 64 * 1024

const ID = /^[A-Za-z0-9-]{1,64}$/

export function createContributionRoutes(cfg: ContributionRoutesConfig) {
  const SESSION_COOKIE = cookieName(cfg.shellOrigin)

  return async function handle(
    req: IncomingMessage,
    res: ServerResponse,
    url: URL,
  ): Promise<boolean> {
    const path = url.pathname
    const mine =
      path === '/api/contributions' ||
      path.startsWith('/api/contributions/') ||
      path === '/api/contribute/options' ||
      path === '/api/contribute/when' ||
      path === '/api/drafts' ||
      path.startsWith('/api/drafts/') ||
      /^\/api\/records\/[^/]+\/history$/.test(path)
    if (!mine) return false

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

    // Read fresh on every call, never carried on a token: a vouch granted a
    // minute ago counts, and a revoked one stops counting immediately.
    const who: Contributor = {
      userId: user.id,
      handle: user.handle,
      verified: user.verifiedResident,
      role: user.role,
    }
    const draftScope = { townId: cfg.townId, userId: user.id }

    try {
      // ── the chooser ──────────────────────────────────────────────────────

      if (path === '/api/contribute/options' && method === 'GET') {
        sendJson(res, await cfg.contributions.options(who, cfg.townId))
        return true
      }

      /**
       * Reading a date, with no side effect of any kind.
       *
       * A POST because the text goes in a body rather than a query string, and
       * a date somebody is mid-way through typing has no business in an access
       * log or a browser history.
       */
      if (path === '/api/contribute/when' && method === 'POST') {
        const body = await bodyOf(req, res)
        if (!body) return true
        sendJson(res, readWhen(str(body, 'text'), { timezone: cfg.timezone, now: Date.now() }))
        return true
      }

      // ── the resident's own list ──────────────────────────────────────────

      if (path === '/api/contributions' && method === 'GET') {
        // Anything held on vouches is released here rather than by a cron,
        // because this is the screen where a resident finds out. It is
        // idempotent and it re-runs the full publish path, so a held event
        // whose date has passed is refused rather than posted into the past.
        await cfg.contributions.releaseHeld(who)
        const [contributions, drafts, options] = await Promise.all([
          cfg.contributions.mine(who),
          cfg.drafts.list(draftScope),
          cfg.contributions.options(who, cfg.townId),
        ])
        sendJson(res, {
          contributions: contributions.map(project),
          drafts,
          pause: options.pause,
          notice: options.notice,
        })
        return true
      }

      if (path === '/api/contributions' && method === 'POST') {
        const body = await bodyOf(req, res)
        if (!body) return true

        // A draft is not a submission. Publishing from one loads the content
        // and runs it through exactly the same validation as anything else,
        // and the draft is only thrown away once the proposal exists.
        const draftId = str(body, 'draftId')
        const source = draftId
          ? await cfg.drafts.get(draftScope, draftId)
          : { type: body['type'], content: body['content'] }

        const result = await cfg.contributions.submit(who, {
          townId: cfg.townId,
          type: source.type,
          content: source.content,
          // No `via` from a body by design. A creation writing on somebody's
          // behalf arrives through the bridge carrying an act token, which
          // names one user and one creation; there is no field here a client
          // could use to claim to be one.
          asOrg: str(body, 'asOrg') || null,
        })

        if (draftId) await cfg.drafts.discard(draftScope, draftId)

        sendJson(res, {
          contribution: project(result.contribution),
          outcome: result.outcome,
          duplicate: result.duplicate,
          recordId: result.record?.id ?? null,
          pause: result.pause,
        })
        return true
      }

      const one = /^\/api\/contributions\/([A-Za-z0-9-]{1,64})$/.exec(path)
      if (one?.[1] && method === 'GET') {
        sendJson(res, { contribution: project(await cfg.contributions.mineById(who, one[1])) })
        return true
      }

      const withdraw = /^\/api\/contributions\/([A-Za-z0-9-]{1,64})\/withdraw$/.exec(path)
      if (withdraw?.[1] && method === 'POST') {
        sendJson(res, { contribution: project(await cfg.contributions.withdraw(who, withdraw[1])) })
        return true
      }

      // ── drafts ───────────────────────────────────────────────────────────

      if (path === '/api/drafts' && method === 'GET') {
        sendJson(res, { drafts: await cfg.drafts.list(draftScope) })
        return true
      }

      if (path === '/api/drafts' && method === 'POST') {
        const body = await bodyOf(req, res)
        if (!body) return true
        const id = str(body, 'id')
        sendJson(res, {
          draft: await cfg.drafts.save(draftScope, {
            id: id && ID.test(id) ? id : null,
            type: body['type'],
            content: body['content'],
          }),
        })
        return true
      }

      const draft = /^\/api\/drafts\/([A-Za-z0-9-]{1,64})$/.exec(path)
      if (draft?.[1] && method === 'GET') {
        sendJson(res, { draft: await cfg.drafts.get(draftScope, draft[1]) })
        return true
      }

      const discard = /^\/api\/drafts\/([A-Za-z0-9-]{1,64})\/discard$/.exec(path)
      if (discard?.[1] && method === 'POST') {
        sendJson(res, { discarded: await cfg.drafts.discard(draftScope, discard[1]) })
        return true
      }

      // ── history ──────────────────────────────────────────────────────────

      /**
       * The town's record of itself, which is not private.
       *
       * A session is still required, because everything else on this service
       * that reads a cookie is, and a history names the residents who edited
       * something. Signed in is the same bar as seeing their name in the feed.
       */
      const history = /^\/api\/records\/([A-Za-z0-9-]{1,64})\/history$/.exec(path)
      if (history?.[1] && method === 'GET') {
        sendJson(res, await cfg.contributions.history(history[1]))
        return true
      }
    } catch (err) {
      if (err instanceof ContributionError) {
        sendJson(res, { error: err.code, message: err.message }, STATUS[err.code])
        return true
      }
      throw err
    }

    sendJson(res, { error: 'not_found' }, 404)
    return true
  }
}

/**
 * Read a body, with the contribution-sized cap, answering the two failures
 * differently.
 *
 * Overflow and malformed mean different things to whoever sent it: one is "that
 * is over a documented limit" and the other is "that was not JSON", and telling
 * somebody their collection was invalid when it was simply large sends them
 * looking for a typo that is not there.
 */
async function bodyOf(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<Record<string, unknown> | null> {
  const result = await readJson(req, MAX_CONTRIBUTION_BYTES)
  if (result.ok) return result.body
  if (result.reason === 'too_large') {
    sendJson(res, { error: 'invalid', message: 'That is larger than a contribution may be.' }, 413)
    return null
  }
  sendJson(res, { error: 'invalid', message: 'That was not JSON.' }, 400)
  return null
}

/**
 * The wire shape.
 *
 * Projected rather than spread, the same as a save: `townId` is on the row and
 * the shell has no use for it, and returning a record as stored is how an
 * internal field ends up in a client's state and then in a request somebody
 * trusts. `contentDigest` stays server-side for the same reason — it is the pin
 * a publish is checked against, not a thing to hand a client and take back.
 *
 * `decidedBy` is left off deliberately. The contributor gets the note in full
 * and signed "a moderator", because in a town of 29,000 a named moderator gets
 * stopped in the Kroger car park and that is how you lose your only moderator.
 */
function project(row: Contribution) {
  return {
    id: row.id,
    type: row.type,
    content: row.content,
    attribution: row.attribution,
    status: row.status,
    route: row.route,
    recordId: row.recordId,
    recordVersion: row.recordVersion,
    scheduledFor: row.scheduledFor,
    decisionNote: row.decisionNote,
    decidedAt: row.decidedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }
}
