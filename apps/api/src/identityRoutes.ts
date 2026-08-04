/**
 * Every route that touches a credential.
 *
 * Two kinds of request arrive here and they are kept rigorously apart:
 *
 *   **Shell routes** (`/api/auth/*`, `/api/creations/:slug/act`) are called by
 *   the shell with the session cookie. They are the only routes that resolve a
 *   session at all.
 *
 *   **Bridge routes** (`/api/bridge/*`) are called by the shell *on behalf of a
 *   creation*, with an act token in `Authorization` and no cookie. They never
 *   read a cookie, and the guard below enforces that rather than trusting the
 *   caller to have set `credentials: 'omit'`.
 *
 * The separation is the whole of §2.5 of the sandbox design. A bridge route
 * that quietly accepted a cookie would still work, would look fine in every
 * test, and would have turned a creation-scoped fifteen-minute grant back into
 * an account session.
 */

import { randomUUID } from 'node:crypto'
import type { IncomingMessage, ServerResponse } from 'node:http'
import {
  Identity,
  mintActToken,
  publicUser,
  verifyActToken,
  ACT_TOKEN_TTL_MS,
  SESSION_TTL_MS,
  type ActGrants,
  type IdentityStore,
  type User,
} from '@townsquare/identity'
import { advisoryGrants } from '@townsquare/sdk'
import type { CatalogueEntry } from '@townsquare/sandbox'
import { originAllowed, readCookie, readJson, sendJson, serializeCookie, str } from './http.js'

/** HTTP status per failure code. One table, so no route invents its own. */
const STATUS: Record<string, number> = {
  invalid: 400,
  handle_taken: 409,
  rate_limited: 429,
  bad_challenge: 400,
  unauthenticated: 401,
  forbidden: 403,
  not_found: 404,
  refused: 409,
}

export interface IdentityRoutesConfig {
  identity: Identity
  store: IdentityStore
  /** Looked up for the act endpoint. In production this is a database read. */
  creations: () => CatalogueEntry[]
  shellOrigin: string
  townId: string
  actSecret: string
  /** Development only, and refused outright when the shell is https. */
  echoChallenge?: (email: string) => { url: string } | null
}

export function cookieName(shellOrigin: string): string {
  // `__Host-` requires Secure, which plain-http development cannot satisfy.
  // The prefix is dropped there and only there.
  return shellOrigin.startsWith('https://') ? '__Host-tsq_session' : 'tsq_session'
}

export function createIdentityRoutes(cfg: IdentityRoutesConfig) {
  const { identity, store } = cfg
  const SESSION_COOKIE = cookieName(cfg.shellOrigin)
  const secure = cfg.shellOrigin.startsWith('https://')

  /** The session, or null. The only place a cookie is read. */
  async function currentUser(req: IncomingMessage): Promise<User | null> {
    return identity.resolveSession(readCookie(req, SESSION_COOKIE))
  }

  function fail(res: ServerResponse, result: { code: string; message: string }): void {
    sendJson(res, { error: result.code, message: result.message }, STATUS[result.code] ?? 400)
  }

  /**
   * Handle one request.
   *
   * @returns true when this module owned the route, so the caller can fall
   *   through to the read API rather than guessing from a 404.
   */
  return async function handle(
    req: IncomingMessage,
    res: ServerResponse,
    url: URL,
  ): Promise<boolean> {
    const path = url.pathname
    const method = req.method ?? 'GET'

    const isActRoute = path.startsWith('/api/creations/') && path.endsWith('/act')
    if (!path.startsWith('/api/auth/') && !path.startsWith('/api/bridge/') && !isActRoute) {
      return false
    }

    // Every mutation is a POST from the shell's own origin. `SameSite=Lax`
    // already refuses the cross-site form post; this refuses a wrong `Origin`
    // outright, and the two together are cheaper than a CSRF token round trip
    // for a surface this small.
    if (method !== 'GET' && !originAllowed(req, cfg.shellOrigin)) {
      sendJson(res, { error: 'forbidden', message: 'Bad origin.' }, 403)
      return true
    }

    // ── bridge: act token only, never a cookie ──────────────────────────────

    if (path.startsWith('/api/bridge/')) {
      const auth = req.headers.authorization ?? ''
      const token = auth.startsWith('Bearer ') ? auth.slice(7) : ''
      const verified = verifyActToken(cfg.actSecret, token, {
        now: Date.now(),
        isRevoked: () => false,
      })

      if (!verified.ok) {
        // The reason is deliberately not returned. "expired" versus
        // "bad_signature" is useful to someone grinding tokens and useless to
        // the shell, which refreshes on any failure regardless.
        sendJson(res, { error: 'unauthenticated', message: 'No valid act token.' }, 401)
        return true
      }

      const claims = verified.claims
      // Revocation is a store lookup, and only after the signature holds.
      if (await store.isActTokenRevoked(claims.jti)) {
        sendJson(res, { error: 'unauthenticated', message: 'No valid act token.' }, 401)
        return true
      }

      if (path === '/api/bridge/me' && method === 'GET') {
        // The server re-checks the grant from the token's own claims. The
        // host checked it too; that check is UX, this one is the boundary.
        if (claims.gr.identity !== 'handle') {
          sendJson(
            res,
            { error: 'permission_denied', message: 'This creation cannot see who you are.' },
            403,
          )
          return true
        }
        if (claims.sub === null) {
          sendJson(res, null)
          return true
        }
        const user = await store.userById(claims.sub)
        // Projected here, server side, so the shell never holds an email or a
        // user id in a shape it could accidentally forward into a frame.
        sendJson(res, user ? publicUser(user) : null)
        return true
      }

      sendJson(res, { error: 'not_found' }, 404)
      return true
    }

    // ── the act token endpoint ──────────────────────────────────────────────

    if (isActRoute && method === 'POST') {
      const slug = path.slice('/api/creations/'.length, -'/act'.length)
      const creation = cfg.creations().find((c) => c.slug === slug || c.originKey === slug)
      if (!creation || creation.status !== 'active') {
        sendJson(res, { error: 'not_found', message: 'No such creation.' }, 404)
        return true
      }

      // `sub` is null for a signed-out visitor, which is the common case and
      // not an error: a creation still runs, it simply acts for nobody.
      const user = await currentUser(req)
      const minted = mintActToken(cfg.actSecret, {
        sub: user?.id ?? null,
        cre: creation.creationId,
        cv: creation.versionId,
        town: cfg.townId,
        vr: user?.verifiedResident ?? false,
        // From the frozen manifest on the version row — never from the
        // `townsquare.json` as served, and never from anything the guest sent.
        grants: advisoryGrants(creation.manifest) as ActGrants,
        jti: randomUUID(),
        now: Date.now(),
      })

      sendJson(res, {
        token: minted.token,
        expiresAt: minted.expiresAt,
        ttlMs: ACT_TOKEN_TTL_MS,
      })
      return true
    }

    // ── shell auth routes ───────────────────────────────────────────────────

    if (path === '/api/auth/me' && method === 'GET') {
      const user = await currentUser(req)
      sendJson(res, user ? await identity.accountView(user) : null)
      return true
    }

    if (path === '/api/auth/signup' && method === 'POST') {
      const body = await readJson(req)
      const result = await identity.signUp({
        email: str(body, 'email'),
        handle: str(body, 'handle'),
      })
      if (!result.ok) return fail(res, result), true
      sendJson(res, { sent: true, ...devEcho(cfg, str(body, 'email')) })
      return true
    }

    if (path === '/api/auth/signin' && method === 'POST') {
      const body = await readJson(req)
      const result = await identity.requestSignIn({ email: str(body, 'email') })
      if (!result.ok) return fail(res, result), true
      sendJson(res, { sent: true, ...devEcho(cfg, str(body, 'email')) })
      return true
    }

    if (path === '/api/auth/confirm' && method === 'POST') {
      const body = await readJson(req)
      const result = await identity.confirmChallenge(str(body, 'token'))
      if (!result.ok) return fail(res, result), true

      res.setHeader(
        'Set-Cookie',
        serializeCookie({
          name: SESSION_COOKIE,
          value: result.session,
          maxAgeSeconds: Math.floor(SESSION_TTL_MS / 1000),
          secure,
        }),
      )
      sendJson(res, await identity.accountView(result.user))
      return true
    }

    if (path === '/api/auth/signout' && method === 'POST') {
      const token = readCookie(req, SESSION_COOKIE)
      const body = await readJson(req)
      if (body?.['everywhere'] === true) {
        const user = await identity.resolveSession(token)
        if (user) await identity.signOutEverywhere(user.id)
      } else {
        await identity.signOut(token)
      }
      // Cleared with the same attributes it was set with, or the browser keeps
      // the original alongside the empty one.
      res.setHeader(
        'Set-Cookie',
        serializeCookie({ name: SESSION_COOKIE, value: '', maxAgeSeconds: 0, secure }),
      )
      sendJson(res, null)
      return true
    }

    if (path === '/api/auth/vouch' && method === 'POST') {
      const user = await currentUser(req)
      if (!user) {
        sendJson(res, { error: 'unauthenticated', message: 'Sign in first.' }, 401)
        return true
      }
      const body = await readJson(req)
      const revoking = body?.['revoke'] === true
      const result = revoking
        ? await identity.revokeVouch(user.id, str(body, 'handle'))
        : await identity.vouchFor(user.id, str(body, 'handle'), str(body, 'note'))
      if (!result.ok) return fail(res, result), true

      // The account view goes back with it so the shell's vouch counter comes
      // from the same read that changed it, rather than a follow-up request
      // that can disagree.
      const fresh = await store.userById(user.id)
      sendJson(res, {
        vouchee: 'vouchee' in result ? result.vouchee : null,
        revoked: 'flagged' in result ? result.flagged : null,
        account: await identity.accountView(fresh ?? user),
      })
      return true
    }

    if (path === '/api/auth/verify' && method === 'POST') {
      const user = await currentUser(req)
      if (!user) {
        sendJson(res, { error: 'unauthenticated', message: 'Sign in first.' }, 401)
        return true
      }
      const body = await readJson(req)
      const result = await identity.manualVerify(user.id, str(body, 'handle'))
      if (!result.ok) return fail(res, result), true
      sendJson(res, result.user)
      return true
    }

    sendJson(res, { error: 'not_found' }, 404)
    return true
  }
}

/**
 * The development convenience of getting the sign-in link back in the
 * response, and the reason it cannot leak into production.
 *
 * `echoChallenge` is only ever constructed by `main.ts` when the shell origin
 * is plain http, so this is dead code the moment anything is deployed. An
 * echoed link is a complete account takeover for whoever can guess an email.
 */
function devEcho(cfg: IdentityRoutesConfig, email: string): Record<string, unknown> {
  const echoed = cfg.echoChallenge?.(email)
  return echoed ? { devLink: echoed.url } : {}
}
