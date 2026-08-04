/**
 * What identity needs from storage, and an in-memory implementation of it.
 *
 * The interface is here so the rules in `service.ts` can be tested against
 * something real rather than against mocks that agree with whatever the code
 * does. The Postgres implementation lands on the same interface when the API
 * stops running on fixtures; the memory one is what development and the test
 * suite run on today, and it is genuine — expiry, single use, attempt counts
 * and case-insensitive uniqueness all behave here the way the schema makes
 * them behave there.
 *
 * All timestamps are milliseconds since the epoch. `Date` objects at the
 * boundary invite one side to compare a `Date` with a number and get `false`
 * forever.
 */

import { randomUUID } from 'node:crypto'
import { emailKey } from './handles.js'
import type { VerificationMethod } from './providers.js'

export interface User {
  id: string
  handle: string
  email: string
  emailConfirmed: boolean
  role: 'user' | 'moderator' | 'admin'
  verifiedResident: boolean
  verifiedMethod: VerificationMethod | null
  verifiedAt: number | null
  vouchBudgetOverride: number | null
  createdAt: number
  updatedAt: number
}

export interface Session {
  id: string
  userId: string
  tokenHash: string
  createdAt: number
  lastSeenAt: number
  expiresAt: number
  revokedAt: number | null
}

export type ChallengePurpose = 'confirm' | 'signin'

export interface Challenge {
  id: string
  userId: string
  purpose: ChallengePurpose
  tokenHash: string
  createdAt: number
  expiresAt: number
  consumedAt: number | null
  attempts: number
}

export interface Vouch {
  id: string
  voucherId: string
  voucheeId: string
  note: string | null
  createdAt: number
  revokedAt: number | null
  revokedBy: string | null
}

export interface NewUser {
  handle: string
  email: string
  role?: User['role']
  emailConfirmed?: boolean
}

export interface IdentityStore {
  createUser(input: NewUser, now: number): Promise<User>
  userById(id: string): Promise<User | null>
  userByEmail(email: string): Promise<User | null>
  userByHandle(handle: string): Promise<User | null>
  updateUser(id: string, patch: Partial<Omit<User, 'id'>>, now: number): Promise<User>

  createChallenge(
    input: { userId: string; purpose: ChallengePurpose; tokenHash: string; expiresAt: number },
    now: number,
  ): Promise<Challenge>
  challengeByHash(tokenHash: string): Promise<Challenge | null>
  consumeChallenge(id: string, now: number): Promise<void>
  countRecentChallenges(userId: string, since: number): Promise<number>
  /** Supersede a user's outstanding challenges when a new one is issued. */
  expireChallenges(userId: string, purpose: ChallengePurpose, now: number): Promise<void>

  createSession(
    input: { userId: string; tokenHash: string; expiresAt: number },
    now: number,
  ): Promise<Session>
  sessionByHash(tokenHash: string): Promise<Session | null>
  touchSession(id: string, now: number): Promise<void>
  revokeSession(id: string, now: number): Promise<void>
  revokeSessionsForUser(userId: string, now: number): Promise<string[]>

  createVouch(
    input: { voucherId: string; voucheeId: string; note: string | null },
    now: number,
  ): Promise<Vouch>
  vouchesIssuedBy(voucherId: string): Promise<Vouch[]>
  vouchesReceivedBy(voucheeId: string): Promise<Vouch[]>
  revokeVouch(id: string, revokedBy: string, now: number): Promise<void>

  revokeActToken(jti: string, reason: string, expiresAt: number, now: number): Promise<void>
  isActTokenRevoked(jti: string): Promise<boolean>
}

/** Thrown when a uniqueness constraint would be violated. Mirrors the index. */
export class DuplicateError extends Error {
  constructor(readonly field: 'handle' | 'email') {
    super(`${field} already exists`)
    this.name = 'DuplicateError'
  }
}

export class MemoryIdentityStore implements IdentityStore {
  private readonly users = new Map<string, User>()
  private readonly sessions = new Map<string, Session>()
  private readonly challenges = new Map<string, Challenge>()
  private readonly vouches = new Map<string, Vouch>()
  private readonly revokedJtis = new Map<string, number>()

  async createUser(input: NewUser, now: number): Promise<User> {
    const handleKey = input.handle.toLowerCase()
    for (const existing of this.users.values()) {
      if (existing.handle.toLowerCase() === handleKey) throw new DuplicateError('handle')
      if (emailKey(existing.email) === emailKey(input.email)) throw new DuplicateError('email')
    }
    const user: User = {
      id: randomUUID(),
      handle: input.handle,
      email: input.email,
      emailConfirmed: input.emailConfirmed ?? false,
      role: input.role ?? 'user',
      verifiedResident: false,
      verifiedMethod: null,
      verifiedAt: null,
      vouchBudgetOverride: null,
      createdAt: now,
      updatedAt: now,
    }
    this.users.set(user.id, user)
    return { ...user }
  }

  async userById(id: string): Promise<User | null> {
    const u = this.users.get(id)
    return u ? { ...u } : null
  }

  async userByEmail(email: string): Promise<User | null> {
    const key = emailKey(email)
    for (const u of this.users.values()) if (emailKey(u.email) === key) return { ...u }
    return null
  }

  async userByHandle(handle: string): Promise<User | null> {
    const key = handle.toLowerCase()
    for (const u of this.users.values()) if (u.handle.toLowerCase() === key) return { ...u }
    return null
  }

  async updateUser(id: string, patch: Partial<Omit<User, 'id'>>, now: number): Promise<User> {
    const current = this.users.get(id)
    if (!current) throw new Error(`no such user: ${id}`)
    const next: User = { ...current, ...patch, id: current.id, updatedAt: now }
    this.users.set(id, next)
    return { ...next }
  }

  async createChallenge(
    input: { userId: string; purpose: ChallengePurpose; tokenHash: string; expiresAt: number },
    now: number,
  ): Promise<Challenge> {
    const challenge: Challenge = {
      id: randomUUID(),
      userId: input.userId,
      purpose: input.purpose,
      tokenHash: input.tokenHash,
      createdAt: now,
      expiresAt: input.expiresAt,
      consumedAt: null,
      attempts: 0,
    }
    this.challenges.set(challenge.id, challenge)
    return { ...challenge }
  }

  async challengeByHash(tokenHash: string): Promise<Challenge | null> {
    for (const c of this.challenges.values()) if (c.tokenHash === tokenHash) return { ...c }
    return null
  }

  async consumeChallenge(id: string, now: number): Promise<void> {
    const c = this.challenges.get(id)
    if (c) this.challenges.set(id, { ...c, consumedAt: now })
  }

  async countRecentChallenges(userId: string, since: number): Promise<number> {
    let n = 0
    for (const c of this.challenges.values()) {
      if (c.userId === userId && c.createdAt >= since) n++
    }
    return n
  }

  async expireChallenges(userId: string, purpose: ChallengePurpose, now: number): Promise<void> {
    for (const [id, c] of this.challenges) {
      if (c.userId === userId && c.purpose === purpose && c.consumedAt === null) {
        this.challenges.set(id, { ...c, expiresAt: Math.min(c.expiresAt, now) })
      }
    }
  }

  async createSession(
    input: { userId: string; tokenHash: string; expiresAt: number },
    now: number,
  ): Promise<Session> {
    const session: Session = {
      id: randomUUID(),
      userId: input.userId,
      tokenHash: input.tokenHash,
      createdAt: now,
      lastSeenAt: now,
      expiresAt: input.expiresAt,
      revokedAt: null,
    }
    this.sessions.set(session.id, session)
    return { ...session }
  }

  async sessionByHash(tokenHash: string): Promise<Session | null> {
    for (const s of this.sessions.values()) if (s.tokenHash === tokenHash) return { ...s }
    return null
  }

  async touchSession(id: string, now: number): Promise<void> {
    const s = this.sessions.get(id)
    if (s) this.sessions.set(id, { ...s, lastSeenAt: now })
  }

  async revokeSession(id: string, now: number): Promise<void> {
    const s = this.sessions.get(id)
    if (s) this.sessions.set(id, { ...s, revokedAt: now })
  }

  async revokeSessionsForUser(userId: string, now: number): Promise<string[]> {
    const ids: string[] = []
    for (const [id, s] of this.sessions) {
      if (s.userId === userId && s.revokedAt === null) {
        this.sessions.set(id, { ...s, revokedAt: now })
        ids.push(id)
      }
    }
    return ids
  }

  async createVouch(
    input: { voucherId: string; voucheeId: string; note: string | null },
    now: number,
  ): Promise<Vouch> {
    for (const v of this.vouches.values()) {
      if (v.voucherId === input.voucherId && v.voucheeId === input.voucheeId && v.revokedAt === null) {
        throw new Error('vouch already exists')
      }
    }
    const vouch: Vouch = {
      id: randomUUID(),
      voucherId: input.voucherId,
      voucheeId: input.voucheeId,
      note: input.note,
      createdAt: now,
      revokedAt: null,
      revokedBy: null,
    }
    this.vouches.set(vouch.id, vouch)
    return { ...vouch }
  }

  async vouchesIssuedBy(voucherId: string): Promise<Vouch[]> {
    return [...this.vouches.values()].filter((v) => v.voucherId === voucherId).map((v) => ({ ...v }))
  }

  async vouchesReceivedBy(voucheeId: string): Promise<Vouch[]> {
    return [...this.vouches.values()].filter((v) => v.voucheeId === voucheeId).map((v) => ({ ...v }))
  }

  async revokeVouch(id: string, revokedBy: string, now: number): Promise<void> {
    const v = this.vouches.get(id)
    if (v) this.vouches.set(id, { ...v, revokedAt: now, revokedBy })
  }

  async revokeActToken(
    jti: string,
    _reason: string,
    expiresAt: number,
    _now?: number,
  ): Promise<void> {
    this.revokedJtis.set(jti, expiresAt)
  }

  async isActTokenRevoked(jti: string): Promise<boolean> {
    return this.revokedJtis.has(jti)
  }
}
