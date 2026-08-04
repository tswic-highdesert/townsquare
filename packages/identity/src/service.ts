/**
 * Every identity rule, in one place, with storage and transport held at arm's
 * length.
 *
 * The API routes below this are thin on purpose: parse, call one method here,
 * serialize. Rules that live in route handlers get reimplemented slightly
 * differently by the next surface that needs them — the MCP server and the CLI
 * are both coming — and "slightly differently" in an authentication path is
 * how a town ends up with two answers to who someone is.
 *
 * Three things this file refuses to do, all of them deliberate:
 *
 *   It never returns an email to a caller. `email` exists to sign in and to
 *   reach someone about a report, and the projection functions here are the
 *   only shapes anything else ever sees.
 *
 *   It never confirms whether an email is registered. Sign-up and sign-in
 *   return the same thing either way, because a town is small enough that
 *   "is my neighbour on here" is a question worth not answering to whoever
 *   asks.
 *
 *   It never writes a verification field from anywhere but `applyVerification`.
 *   Providers return a boolean; core decides what that means.
 */

import { emailKey, normalizeEmail, normalizeHandle } from './handles.js'
import { ProviderUnavailableError, type VerificationMethod } from './providers.js'
import { hashSecret, newSecret } from './tokens.js'
import {
  DuplicateError,
  type ChallengePurpose,
  type IdentityStore,
  type User,
} from './store.js'
import { canVouch, vouchBudget, type VouchBudget } from './vouch.js'

export const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000
export const CHALLENGE_TTL_MS = 20 * 60 * 1000
/** Per user, per hour. Enough for a mistyped address, not enough to be a mailer. */
export const CHALLENGE_RATE_LIMIT = 5

/**
 * How a challenge reaches a person.
 *
 * An interface rather than an email client, because the delivery mechanism is
 * the one part of authentication that changes per deployment and the one part
 * that should never be able to break a test.
 */
export interface ChallengeDelivery {
  deliver(input: {
    email: string
    handle: string
    purpose: ChallengePurpose
    token: string
    expiresAt: number
  }): Promise<void>
}

/** What the signed-in resident sees about themselves. Never anyone else. */
export interface AccountView {
  handle: string
  emailConfirmed: boolean
  role: User['role']
  verified: boolean
  verifiedMethod: VerificationMethod | null
  /** Can this account submit an embedded creation for review. */
  canSubmit: boolean
  vouches: { available: number; budget: number; used: number; windowDays: number }
}

/** What a creation is ever told about the person using it. The whole surface. */
export interface PublicUser {
  handle: string
  verified: boolean
}

export interface IdentityConfig {
  sessionTtlMs?: number
  challengeTtlMs?: number
  challengeRateLimit?: number
  vouchWindowDays?: number
}

export type IdentityFailure =
  | { ok: false; code: 'invalid'; message: string }
  | { ok: false; code: 'handle_taken'; message: string }
  | { ok: false; code: 'rate_limited'; message: string }
  | { ok: false; code: 'bad_challenge'; message: string }
  | { ok: false; code: 'unauthenticated'; message: string }
  | { ok: false; code: 'forbidden'; message: string }
  | { ok: false; code: 'not_found'; message: string }
  | { ok: false; code: 'refused'; message: string }

export type Result<T> = ({ ok: true } & T) | IdentityFailure

export class Identity {
  private readonly store: IdentityStore
  private readonly delivery: ChallengeDelivery
  private readonly clock: () => number
  private readonly cfg: Required<IdentityConfig>

  constructor(opts: {
    store: IdentityStore
    delivery: ChallengeDelivery
    now?: () => number
    config?: IdentityConfig
  }) {
    this.store = opts.store
    this.delivery = opts.delivery
    this.clock = opts.now ?? (() => Date.now())
    this.cfg = {
      sessionTtlMs: opts.config?.sessionTtlMs ?? SESSION_TTL_MS,
      challengeTtlMs: opts.config?.challengeTtlMs ?? CHALLENGE_TTL_MS,
      challengeRateLimit: opts.config?.challengeRateLimit ?? CHALLENGE_RATE_LIMIT,
      vouchWindowDays: opts.config?.vouchWindowDays ?? 90,
    }
  }

  // ── sign up and sign in ───────────────────────────────────────────────────

  /**
   * Create an account and send the confirmation.
   *
   * A handle collision is reported plainly: handles are public, so refusing to
   * say one is taken protects nothing and produces a form nobody can complete.
   * An *email* collision is not reported at all — it quietly becomes a sign-in
   * link for the account that already exists, which is both the right outcome
   * for the person (they get in) and no answer at all for a stranger probing
   * addresses.
   */
  async signUp(input: { email: string; handle: string }): Promise<Result<{ sent: true }>> {
    const email = normalizeEmail(input.email)
    if (!email.ok) return { ok: false, code: 'invalid', message: email.message }

    const handle = normalizeHandle(input.handle)
    if (!handle.ok) return { ok: false, code: 'invalid', message: handle.message }

    const now = this.clock()
    const existingByEmail = await this.store.userByEmail(email.email)
    if (existingByEmail) {
      const limited = await this.rateLimit(existingByEmail.id, now)
      if (limited) return limited
      await this.issueChallenge(existingByEmail, existingByEmail.emailConfirmed ? 'signin' : 'confirm', now)
      return { ok: true, sent: true }
    }

    if (await this.store.userByHandle(handle.handle)) {
      return { ok: false, code: 'handle_taken', message: 'That handle is taken.' }
    }

    let user: User
    try {
      user = await this.store.createUser({ handle: handle.handle, email: email.email }, now)
    } catch (err) {
      // Lost the race against a concurrent signup. The unique index is the
      // authority; the check above is only there to give a better message.
      if (err instanceof DuplicateError) {
        return err.field === 'handle'
          ? { ok: false, code: 'handle_taken', message: 'That handle is taken.' }
          : { ok: true, sent: true }
      }
      throw err
    }

    await this.issueChallenge(user, 'confirm', now)
    return { ok: true, sent: true }
  }

  /**
   * Send a sign-in link.
   *
   * Returns `sent: true` for an address that has never been seen. There is no
   * account to sign into and no mail goes out, and that is exactly what the
   * caller is told either way.
   */
  async requestSignIn(input: { email: string }): Promise<Result<{ sent: true }>> {
    const email = normalizeEmail(input.email)
    if (!email.ok) return { ok: false, code: 'invalid', message: email.message }

    const now = this.clock()
    const user = await this.store.userByEmail(email.email)
    if (!user) return { ok: true, sent: true }

    const limited = await this.rateLimit(user.id, now)
    if (limited) return limited

    await this.issueChallenge(user, user.emailConfirmed ? 'signin' : 'confirm', now)
    return { ok: true, sent: true }
  }

  /**
   * Redeem a challenge token and open a session.
   *
   * Single use, and expiry is checked against the row rather than trusted from
   * the token, so a link that sat in an inbox for a week is dead even if it is
   * intact. A consumed or expired token gets the same message as a wrong one:
   * the difference is not useful to the person and is useful to an attacker.
   */
  async confirmChallenge(token: string): Promise<Result<{ session: string; user: User }>> {
    const now = this.clock()
    const bad: IdentityFailure = {
      ok: false,
      code: 'bad_challenge',
      message: 'That link has expired or has already been used. Ask for a new one.',
    }

    if (typeof token !== 'string' || token.length < 16) return bad

    const challenge = await this.store.challengeByHash(hashSecret(token))
    if (!challenge) return bad
    if (challenge.consumedAt !== null) return bad
    if (challenge.expiresAt <= now) return bad

    const user = await this.store.userById(challenge.userId)
    if (!user) return bad

    await this.store.consumeChallenge(challenge.id, now)

    const confirmed =
      challenge.purpose === 'confirm' && !user.emailConfirmed
        ? await this.store.updateUser(user.id, { emailConfirmed: true }, now)
        : user

    const secret = newSecret()
    await this.store.createSession(
      { userId: user.id, tokenHash: hashSecret(secret), expiresAt: now + this.cfg.sessionTtlMs },
      now,
    )

    return { ok: true, session: secret, user: confirmed }
  }

  /**
   * Resolve a session cookie to a user.
   *
   * Returns null rather than throwing, because anonymous is the common case
   * and not an error: most people reading a town square are not signed in, and
   * every caller here has to handle that anyway.
   */
  async resolveSession(token: string | null | undefined): Promise<User | null> {
    if (!token) return null
    const now = this.clock()
    const session = await this.store.sessionByHash(hashSecret(token))
    if (!session) return null
    if (session.revokedAt !== null || session.expiresAt <= now) return null

    const user = await this.store.userById(session.userId)
    if (!user) return null

    await this.store.touchSession(session.id, now)
    return user
  }

  async signOut(token: string | null | undefined): Promise<void> {
    if (!token) return
    const session = await this.store.sessionByHash(hashSecret(token))
    if (session) await this.store.revokeSession(session.id, this.clock())
  }

  /** Sign out everywhere. The one account control a pseudonymous user has. */
  async signOutEverywhere(userId: string): Promise<number> {
    return (await this.store.revokeSessionsForUser(userId, this.clock())).length
  }

  // ── vouching and verification ─────────────────────────────────────────────

  /**
   * Vouch for someone by handle.
   *
   * The provider shape is honoured rather than inlined: `canVouch` decides,
   * the vouch row is the grant, and `applyVerification` is the only thing that
   * writes a verification field. Keeping that path single means adding the
   * postcard provider later changes one call site, not the model.
   */
  async vouchFor(
    actorId: string,
    handle: string,
    note?: string,
  ): Promise<Result<{ vouchee: PublicUser; budget: VouchBudget }>> {
    const now = this.clock()
    const voucher = await this.store.userById(actorId)
    if (!voucher) return { ok: false, code: 'unauthenticated', message: 'Sign in first.' }

    const target = normalizeHandle(handle)
    if (!target.ok) return { ok: false, code: 'invalid', message: target.message }

    const vouchee = await this.store.userByHandle(target.handle)
    if (!vouchee) return { ok: false, code: 'not_found', message: 'Nobody here has that handle.' }

    const issued = await this.store.vouchesIssuedBy(voucher.id)
    const decision = canVouch(voucher, vouchee, issued, {
      now,
      windowDays: this.cfg.vouchWindowDays,
    })
    if (!decision.ok) {
      return decision.refusal === 'not_verified'
        ? { ok: false, code: 'forbidden', message: decision.message }
        : { ok: false, code: 'refused', message: decision.message }
    }

    await this.store.createVouch(
      { voucherId: voucher.id, voucheeId: vouchee.id, note: note?.trim() || null },
      now,
    )
    const verified = await this.applyVerification(vouchee.id, 'vouch', now)

    const budget = vouchBudget(await this.store.vouchesIssuedBy(voucher.id), {
      now,
      override: voucher.vouchBudgetOverride,
      windowDays: this.cfg.vouchWindowDays,
    })

    return { ok: true, vouchee: publicUser(verified), budget }
  }

  /**
   * Withdraw a vouch.
   *
   * Does not cascade and does not un-verify anyone. That is the spec's call
   * and it is the right one: a bad actor's vouches are mostly legitimate, and
   * auto-nuking the subtree costs a small town more than it saves. What it
   * does is put the branch in front of a moderator.
   */
  async revokeVouch(actorId: string, handle: string): Promise<Result<{ flagged: string }>> {
    const now = this.clock()
    const actor = await this.store.userById(actorId)
    if (!actor) return { ok: false, code: 'unauthenticated', message: 'Sign in first.' }

    const target = normalizeHandle(handle)
    if (!target.ok) return { ok: false, code: 'invalid', message: target.message }

    const vouchee = await this.store.userByHandle(target.handle)
    if (!vouchee) return { ok: false, code: 'not_found', message: 'Nobody here has that handle.' }

    const vouch = (await this.store.vouchesIssuedBy(actor.id)).find(
      (v) => v.voucheeId === vouchee.id && v.revokedAt === null,
    )
    if (!vouch) {
      return { ok: false, code: 'not_found', message: 'You have no active vouch for them.' }
    }

    await this.store.revokeVouch(vouch.id, actor.id, now)
    return { ok: true, flagged: vouchee.handle }
  }

  /**
   * Admin verification. How the seed cohort exists at all.
   *
   * Someone has to be verified before anyone can be vouched for, and this is
   * that someone. Restricted to `admin` rather than `moderator`: a moderator
   * drains the report queue, and minting residents is a different power.
   */
  async manualVerify(actorId: string, handle: string): Promise<Result<{ user: PublicUser }>> {
    const now = this.clock()
    const actor = await this.store.userById(actorId)
    if (!actor) return { ok: false, code: 'unauthenticated', message: 'Sign in first.' }
    if (actor.role !== 'admin') {
      return { ok: false, code: 'forbidden', message: 'Only an admin can verify someone directly.' }
    }

    const target = normalizeHandle(handle)
    if (!target.ok) return { ok: false, code: 'invalid', message: target.message }

    const subject = await this.store.userByHandle(target.handle)
    if (!subject) return { ok: false, code: 'not_found', message: 'Nobody here has that handle.' }
    if (subject.verifiedResident) return { ok: true, user: publicUser(subject) }

    return { ok: true, user: publicUser(await this.applyVerification(subject.id, 'manual', now)) }
  }

  /**
   * The single writer of verification state.
   *
   * A provider returns a boolean and this decides what it means. Nothing a
   * provider handled — an address, a document, a code — reaches this function,
   * which is what makes "store the result, discard the evidence" structural.
   */
  private async applyVerification(
    userId: string,
    method: VerificationMethod,
    now: number,
  ): Promise<User> {
    return this.store.updateUser(
      userId,
      { verifiedResident: true, verifiedMethod: method, verifiedAt: now },
      now,
    )
  }

  /** Present so the challenge-shaped provider has a call path. See providers.ts. */
  async startPostcardVerification(): Promise<never> {
    throw new ProviderUnavailableError(
      'postcard',
      'Postcard verification is not enabled in this town yet.',
    )
  }

  // ── projections ───────────────────────────────────────────────────────────

  async accountView(user: User): Promise<AccountView> {
    const budget = vouchBudget(await this.store.vouchesIssuedBy(user.id), {
      now: this.clock(),
      override: user.vouchBudgetOverride,
      windowDays: this.cfg.vouchWindowDays,
    })
    return {
      handle: user.handle,
      emailConfirmed: user.emailConfirmed,
      role: user.role,
      verified: user.verifiedResident,
      verifiedMethod: user.verifiedMethod,
      // Building and previewing needs only a confirmed email. Submitting
      // executable code that runs in every resident's browser needs a person.
      canSubmit: user.emailConfirmed && user.verifiedResident,
      vouches: {
        available: user.verifiedResident ? budget.available : 0,
        budget: budget.budget,
        used: budget.used,
        windowDays: budget.windowDays,
      },
    }
  }

  // ── internals ─────────────────────────────────────────────────────────────

  private async issueChallenge(user: User, purpose: ChallengePurpose, now: number): Promise<void> {
    // A new link supersedes the old one. Two live links to one inbox is a
    // support question ("which one?") and a wider window for a leaked one.
    await this.store.expireChallenges(user.id, purpose, now)

    const token = newSecret()
    const expiresAt = now + this.cfg.challengeTtlMs
    await this.store.createChallenge(
      { userId: user.id, purpose, tokenHash: hashSecret(token), expiresAt },
      now,
    )
    await this.delivery.deliver({
      email: user.email,
      handle: user.handle,
      purpose,
      token,
      expiresAt,
    })
  }

  private async rateLimit(userId: string, now: number): Promise<IdentityFailure | null> {
    const recent = await this.store.countRecentChallenges(userId, now - 60 * 60 * 1000)
    if (recent >= this.cfg.challengeRateLimit) {
      return {
        ok: false,
        code: 'rate_limited',
        message: 'Too many sign-in emails. Try again in an hour.',
      }
    }
    return null
  }
}

/** The whole of what a creation may learn about a person. */
export function publicUser(user: User): PublicUser {
  return { handle: user.handle, verified: user.verifiedResident }
}

export { emailKey }
