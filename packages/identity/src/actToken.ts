/**
 * The act token: the only credential that ever travels on a bridge call.
 *
 * It is not an account credential and the difference is the point. It names
 * one user, one creation, one approved version, and the exact grants that
 * version was approved with, and it dies in fifteen minutes. A total leak of
 * one — including into the guest frame, which is the case the whole sandbox
 * exists to prevent — yields only what that creation was already approved to
 * do, as that user, for the rest of the quarter hour.
 *
 * Signed and stateless rather than a database row, because the bridge mints
 * one per mount and refreshes it every thirteen minutes; a row per mount is a
 * write on every page view for a value that expires anyway. Revocation is the
 * exception list (`act_token_revocations`), consulted on verify, because the
 * cases that need it — a creation blocked mid-run, a signed-out session — are
 * rare and worth a lookup.
 *
 * Not JWT. There is one issuer, one verifier, one algorithm, and no need to
 * negotiate any of them; `alg` as a parseable input field is a footgun this
 * does not need to carry to talk to itself.
 */

import { createHmac, timingSafeEqual } from 'node:crypto'

export const ACT_TOKEN_VERSION = 'ts1'
export const ACT_TOKEN_TTL_MS = 15 * 60 * 1000
/** The host refreshes at T-2m, so a token is replaced well before it lapses. */
export const ACT_TOKEN_REFRESH_MS = ACT_TOKEN_TTL_MS - 2 * 60 * 1000

/** Exactly the grants shape the bridge checks against. Nothing wider. */
export interface ActGrants {
  identity: 'none' | 'handle'
  read: string[]
  write: string[]
  storage: boolean
}

export interface ActClaims {
  iss: 'townsquare'
  aud: 'bridge'
  /** The acting user, or null when nobody is signed in. */
  sub: string | null
  /** The acting creation. Attribution derives from here, never from params. */
  cre: string
  /** The approved version whose frozen manifest produced `gr`. */
  cv: string
  town: string
  /** Verified resident, resolved at mint time. */
  vr: boolean
  gr: ActGrants
  /** Milliseconds since the epoch, both of them. */
  iat: number
  exp: number
  jti: string
}

export interface MintInput {
  sub: string | null
  cre: string
  cv: string
  town: string
  vr: boolean
  grants: ActGrants
  jti: string
  now: number
  ttlMs?: number
}

export interface MintedActToken {
  token: string
  claims: ActClaims
  expiresAt: number
}

export function mintActToken(secret: string, input: MintInput): MintedActToken {
  if (!secret) throw new Error('act token secret is required')

  const claims: ActClaims = {
    iss: 'townsquare',
    aud: 'bridge',
    sub: input.sub,
    cre: input.cre,
    cv: input.cv,
    town: input.town,
    vr: input.vr,
    gr: {
      identity: input.grants.identity,
      read: [...input.grants.read],
      write: [...input.grants.write],
      storage: input.grants.storage,
    },
    iat: input.now,
    exp: input.now + (input.ttlMs ?? ACT_TOKEN_TTL_MS),
    jti: input.jti,
  }

  const body = Buffer.from(JSON.stringify(claims), 'utf8').toString('base64url')
  const token = `${ACT_TOKEN_VERSION}.${body}.${sign(secret, body)}`
  return { token, claims, expiresAt: claims.exp }
}

export type ActVerifyFailure =
  | 'malformed'
  | 'bad_version'
  | 'bad_signature'
  | 'expired'
  | 'not_yet_valid'
  | 'wrong_audience'
  | 'revoked'

export type ActVerifyResult =
  | { ok: true; claims: ActClaims }
  | { ok: false; reason: ActVerifyFailure }

export interface VerifyOptions {
  now: number
  /** Consulted only after the signature holds, so it cannot be a probe oracle. */
  isRevoked?(jti: string): boolean
  /** Tolerance for clock skew between the shell's clock and ours. */
  skewMs?: number
}

/**
 * Order matters: shape, then version, then signature, then claims.
 *
 * Nothing inside the payload is read before the signature is checked. Deciding
 * anything — even which key to use — from unverified content is how token
 * verifiers get broken, and there is no reason to invite it.
 */
export function verifyActToken(
  secret: string,
  token: string,
  opts: VerifyOptions,
): ActVerifyResult {
  const parts = token.split('.')
  if (parts.length !== 3) return { ok: false, reason: 'malformed' }
  const [version, body, mac] = parts as [string, string, string]

  if (version !== ACT_TOKEN_VERSION) return { ok: false, reason: 'bad_version' }
  if (!body || !mac) return { ok: false, reason: 'malformed' }
  if (!macMatches(sign(secret, body), mac)) return { ok: false, reason: 'bad_signature' }

  let claims: ActClaims
  try {
    claims = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as ActClaims
  } catch {
    return { ok: false, reason: 'malformed' }
  }
  if (!wellFormed(claims)) return { ok: false, reason: 'malformed' }

  const skew = opts.skewMs ?? 30_000
  if (claims.aud !== 'bridge' || claims.iss !== 'townsquare') {
    return { ok: false, reason: 'wrong_audience' }
  }
  if (opts.now > claims.exp + skew) return { ok: false, reason: 'expired' }
  if (opts.now + skew < claims.iat) return { ok: false, reason: 'not_yet_valid' }
  if (opts.isRevoked?.(claims.jti)) return { ok: false, reason: 'revoked' }

  return { ok: true, claims }
}

/** True once the host should ask for a fresh one. */
export function shouldRefresh(claims: ActClaims, now: number): boolean {
  return now >= claims.exp - 2 * 60 * 1000
}

function sign(secret: string, body: string): string {
  return createHmac('sha256', secret).update(body, 'utf8').digest('base64url')
}

function macMatches(expected: string, actual: string): boolean {
  const a = Buffer.from(expected, 'utf8')
  const b = Buffer.from(actual, 'utf8')
  // A length mismatch is already a mismatch; returning early on it leaks only
  // the length, which the format fixes anyway.
  if (a.length !== b.length) return false
  return timingSafeEqual(a, b)
}

/**
 * Structural check on the decoded payload.
 *
 * The signature already proves we minted it, so this is not a trust boundary —
 * it is a guard against an old token shape surviving a deploy and being read
 * as though it had the new fields. Failing closed there is much better than a
 * missing `gr.write` reading as an empty allowlist by accident.
 */
function wellFormed(c: unknown): c is ActClaims {
  if (typeof c !== 'object' || c === null) return false
  const v = c as Record<string, unknown>
  const gr = v['gr'] as Record<string, unknown> | undefined
  return (
    (typeof v['sub'] === 'string' || v['sub'] === null) &&
    typeof v['cre'] === 'string' &&
    typeof v['cv'] === 'string' &&
    typeof v['town'] === 'string' &&
    typeof v['vr'] === 'boolean' &&
    typeof v['iat'] === 'number' &&
    typeof v['exp'] === 'number' &&
    typeof v['jti'] === 'string' &&
    !!gr &&
    (gr['identity'] === 'none' || gr['identity'] === 'handle') &&
    Array.isArray(gr['read']) &&
    Array.isArray(gr['write']) &&
    typeof gr['storage'] === 'boolean'
  )
}
