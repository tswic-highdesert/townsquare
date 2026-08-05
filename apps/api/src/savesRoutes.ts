/**
 * Yours — `design/hifi` 5b, and the writes behind it.
 *
 * ```
 * GET  /api/yours     the screen, in one request
 * POST /api/saves     save something, or unsave it with { remove: true }
 * ```
 *
 * `remove` rides on the same POST rather than becoming a `DELETE`, following
 * the vouch route: this service advertises `GET, POST, OPTIONS` in its CORS
 * preflight, and widening that for one verb would relax the whole surface to
 * make one button read a little nicer in a log.
 *
 * Nothing here decides anything. The cap, the closed set of kinds, the length
 * limits and the url scheme check all live in `Saves`, because they are rules
 * about saving rather than rules about HTTP — the same split as `Reports.file`.
 * What this file owns is the part that genuinely is HTTP: reading the session
 * cookie, refusing a cross-origin write, and mapping a code to a status.
 */

import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Identity } from '@townsquare/identity'
import { SavesError, type Save, type Saves } from '@townsquare/saves'
import { originAllowed, readCookie, readFields, sendJson, str } from './http.js'
import { cookieName } from './identityRoutes.js'

/** What a resident built, as this screen needs it. */
export interface BuiltCreation {
  slug: string
  name: string
  tagline: string
  status: 'active' | 'hidden' | 'blocked'
  updatedAt: number
}

export interface SavesRoutesConfig {
  identity: Identity
  saves: Saves
  /**
   * Creations this resident owns.
   *
   * Injected as a function rather than reached for through the review package,
   * so this route does not grow an import on the moderation surface to render a
   * list of somebody's own apps.
   */
  listBuilt: (userId: string) => Promise<BuiltCreation[]>
  shellOrigin: string
  townId: string
}

const STATUS: Record<SavesError['code'], number> = { invalid: 400, too_many: 409 }

export function createSavesRoutes(cfg: SavesRoutesConfig) {
  const SESSION_COOKIE = cookieName(cfg.shellOrigin)

  return async function handle(
    req: IncomingMessage,
    res: ServerResponse,
    url: URL,
  ): Promise<boolean> {
    const isYours = url.pathname === '/api/yours'
    const isSaves = url.pathname === '/api/saves'
    if (!isYours && !isSaves) return false

    const method = req.method ?? 'GET'
    if ((isYours && method !== 'GET') || (isSaves && method !== 'POST')) {
      sendJson(res, { error: 'not_found' }, 404)
      return true
    }
    if (isSaves && !originAllowed(req, cfg.shellOrigin)) {
      sendJson(res, { error: 'forbidden', message: 'Bad origin.' }, 403)
      return true
    }

    const user = await cfg.identity.resolveSession(readCookie(req, SESSION_COOKIE))
    if (!user) {
      sendJson(res, { error: 'unauthenticated', message: 'Sign in first.' }, 401)
      return true
    }

    // The scope, assembled from the session and from nothing the client sent.
    // There is no field in any body below that could redirect a read or a
    // write at another resident's list.
    const who = { townId: cfg.townId, userId: user.id }

    if (isYours) {
      const [saves, built] = await Promise.all([cfg.saves.list(who), cfg.listBuilt(user.id)])
      sendJson(res, { saves: saves.map(project), built })
      return true
    }

    const body = await readFields(req)
    try {
      if (body['remove'] === true) {
        const removed = await cfg.saves.remove(who, body['kind'], body['refId'])
        sendJson(res, { removed })
        return true
      }

      const result = await cfg.saves.save(who, {
        kind: body['kind'],
        refId: body['refId'],
        title: str(body, 'title'),
        detail: str(body, 'detail'),
        url: str(body, 'url'),
      })
      sendJson(res, { save: project(result.save), duplicate: result.duplicate })
      return true
    } catch (err) {
      if (err instanceof SavesError) {
        sendJson(res, { error: err.code, message: err.message }, STATUS[err.code])
        return true
      }
      throw err
    }
  }
}

/**
 * The wire shape, projected rather than spread.
 *
 * `userId` and `townId` are on the row and neither is anything the shell needs
 * to hold. Returning the record as stored is how an internal id ends up in a
 * client's state and, eventually, in a request somebody trusts.
 */
function project(save: Save) {
  return {
    id: save.id,
    kind: save.kind,
    refId: save.refId,
    title: save.title,
    detail: save.detail,
    url: save.url,
    savedAt: save.savedAt,
  }
}
