/**
 * The credential a resident connects their AI tool with.
 *
 * Static bearer tokens, minted at `/settings/connect` in the shell and pasted
 * into Claude Code's MCP config. **OAuth 2.1 with dynamic client registration
 * is deliberately not built**: Claude Code is the launch audience and it takes
 * a bearer header happily, while the clients that require the OAuth dance
 * (claude.ai web, ChatGPT connectors) are not who a Russellville resident is
 * using to build a Flock camera map this month. When they matter, this module
 * grows a second issuer and every rule below stays true.
 *
 * Three properties, and none of them is optional:
 *
 *   1. **Only the hash is stored.** Same rule as sessions in
 *      `@townsquare/identity`. A database dump must not be a set of working
 *      credentials.
 *   2. **The prefix is public and searchable.** `ts_live_` exists so that
 *      GitHub's secret scanner, a `grep` in a code review, and the bundle
 *      validator's pasted-secret check can all recognise one on sight. A token
 *      that looks like random base64 gets committed and never noticed.
 *   3. **The lookup id is not the secret.** Every token carries a public `id`
 *      segment so the store can find one row rather than scanning every row and
 *      comparing hashes, and so `/settings/connect` can list and revoke tokens
 *      by something safe to show in a UI.
 *
 * Shape: `ts_live_<id><secret>`, where `id` is 12 base64url chars and `secret`
 * is 43 (32 bytes). Fixed widths, so parsing is a slice rather than a delimiter
 * hunt through attacker-supplied text.
 */

import { randomBytes, timingSafeEqual } from 'node:crypto'
import { hashSecret } from '@townsquare/identity'

/** Public, greppable, and the thing a secret scanner keys on. */
export const TOKEN_PREFIX = 'ts_live_'

export const TOKEN_ID_CHARS = 12
export const TOKEN_SECRET_BYTES = 32
/** base64url of 32 bytes is always 43 characters with no padding. */
export const TOKEN_SECRET_CHARS = 43

/**
 * How long an unused token survives.
 *
 * Long, because this is a build credential a resident pastes into a config file
 * once and forgets. Short-lived tokens on this path buy nothing: the failure
 * mode they prevent (a leaked token used months later) is better handled by
 * revocation and by the fact that the token can only reach the MCP surface,
 * which cannot read anyone's email, cannot publish without review, and cannot
 * touch another resident's draft.
 */
export const TOKEN_TTL_MS = 365 * 24 * 60 * 60 * 1000

export interface McpToken {
  /** The public segment. Safe to log, list and show in a UI. */
  id: string
  userId: string
  /** What the resident called it, so they can tell two machines apart. */
  label: string
  secretHash: string
  createdAt: number
  expiresAt: number
  /** Coarse: updated at most once an hour, so auth is not a write per call. */
  lastUsedAt: number | null
  revokedAt: number | null
}

export interface McpTokenStore {
  createToken(
    input: { id: string; userId: string; label: string; secretHash: string; expiresAt: number },
    now: number,
  ): Promise<McpToken>
  tokenById(id: string): Promise<McpToken | null>
  tokensForUser(userId: string): Promise<McpToken[]>
  touchToken(id: string, now: number): Promise<void>
  revokeToken(id: string, now: number): Promise<void>
}

export interface MintedToken {
  /** The full credential. Returned exactly once, never recoverable. */
  token: string
  record: McpToken
}

/**
 * Mint a token for one resident.
 *
 * The plaintext is returned once and then unrecoverable, which is why the
 * connect page has to say "copy this now" rather than offering to show it
 * again later.
 */
export async function mintToken(
  store: McpTokenStore,
  input: { userId: string; label: string },
  now: number,
): Promise<MintedToken> {
  const id = randomBytes(9).toString('base64url') // 9 bytes → exactly 12 chars
  const secret = randomBytes(TOKEN_SECRET_BYTES).toString('base64url')
  const record = await store.createToken(
    {
      id,
      userId: input.userId,
      label: input.label.slice(0, 80) || 'unnamed',
      secretHash: hashSecret(secret),
      expiresAt: now + TOKEN_TTL_MS,
    },
    now,
  )
  return { token: `${TOKEN_PREFIX}${id}${secret}`, record }
}

export type ParsedToken = { id: string; secret: string } | null

/**
 * Split a presented credential without trusting any of it.
 *
 * Length and alphabet are checked before the store is ever consulted, so a
 * malformed `Authorization` header costs a regex rather than a query. Returns
 * null for everything that is not exactly the shape we mint.
 */
export function parseToken(raw: string): ParsedToken {
  if (!raw.startsWith(TOKEN_PREFIX)) return null
  const body = raw.slice(TOKEN_PREFIX.length)
  if (body.length !== TOKEN_ID_CHARS + TOKEN_SECRET_CHARS) return null
  if (!/^[A-Za-z0-9_-]+$/.test(body)) return null
  return { id: body.slice(0, TOKEN_ID_CHARS), secret: body.slice(TOKEN_ID_CHARS) }
}

export type AuthFailure =
  | 'missing'
  | 'malformed'
  | 'unknown'
  | 'revoked'
  | 'expired'
  | 'no_such_user'

export type AuthResult =
  | { ok: true; token: McpToken }
  | { ok: false; reason: AuthFailure }

/**
 * Authenticate a presented credential against the store.
 *
 * The hash comparison is constant time even though the token id was already
 * matched exactly: an attacker who knows a valid id (they are listed in the
 * connect UI and could leak through a screenshot) would otherwise get a timing
 * oracle on the secret, which is the only part that was ever secret.
 */
export async function authenticateToken(
  store: McpTokenStore,
  raw: string | undefined,
  now: number,
): Promise<AuthResult> {
  if (!raw) return { ok: false, reason: 'missing' }
  const parsed = parseToken(raw)
  if (!parsed) return { ok: false, reason: 'malformed' }

  const record = await store.tokenById(parsed.id)
  if (!record) return { ok: false, reason: 'unknown' }

  const presented = Buffer.from(hashSecret(parsed.secret), 'utf8')
  const stored = Buffer.from(record.secretHash, 'utf8')
  if (presented.length !== stored.length || !timingSafeEqual(presented, stored)) {
    return { ok: false, reason: 'unknown' }
  }

  if (record.revokedAt !== null) return { ok: false, reason: 'revoked' }
  if (record.expiresAt <= now) return { ok: false, reason: 'expired' }

  return { ok: true, token: record }
}

/** An hour of granularity is plenty for "when did this machine last build". */
export const TOUCH_INTERVAL_MS = 60 * 60 * 1000

export function shouldTouch(token: McpToken, now: number): boolean {
  return token.lastUsedAt === null || now - token.lastUsedAt > TOUCH_INTERVAL_MS
}

export class MemoryMcpTokenStore implements McpTokenStore {
  private readonly tokens = new Map<string, McpToken>()

  async createToken(
    input: { id: string; userId: string; label: string; secretHash: string; expiresAt: number },
    now: number,
  ): Promise<McpToken> {
    const token: McpToken = {
      id: input.id,
      userId: input.userId,
      label: input.label,
      secretHash: input.secretHash,
      createdAt: now,
      expiresAt: input.expiresAt,
      lastUsedAt: null,
      revokedAt: null,
    }
    this.tokens.set(token.id, token)
    return { ...token }
  }

  async tokenById(id: string): Promise<McpToken | null> {
    const t = this.tokens.get(id)
    return t ? { ...t } : null
  }

  async tokensForUser(userId: string): Promise<McpToken[]> {
    return [...this.tokens.values()].filter((t) => t.userId === userId).map((t) => ({ ...t }))
  }

  async touchToken(id: string, now: number): Promise<void> {
    const t = this.tokens.get(id)
    if (t) this.tokens.set(id, { ...t, lastUsedAt: now })
  }

  async revokeToken(id: string, now: number): Promise<void> {
    const t = this.tokens.get(id)
    if (t && t.revokedAt === null) this.tokens.set(id, { ...t, revokedAt: now })
  }
}
