/**
 * Drafts: scratch space, with recovery.
 *
 * A draft is not a small contribution. It is a different thing with different
 * rules, and the three that matter are:
 *
 * **A draft is private, always.** Not to a moderator, not to an organisation
 * the author helps run, not to anybody. Every method here is scoped by
 * `(townId, userId)` and there is no argument on any of them that could address
 * somebody else's, which is the same property `packages/storage` and
 * `packages/saves` have and for the same reason: cross-tenant reads should be
 * impossible to express rather than carefully avoided.
 *
 * **A draft holds whatever is in the composer, including nonsense.** Autosave
 * that refused half-finished work would fire on every keystroke and lose the
 * race every time. So nothing here validates content — and consequently
 * **nothing here can publish.** Going live means going through
 * `Contributions.submit`, which runs the same validation as everything else. A
 * draft is never a way around the gate.
 *
 * **Discard is a real delete.** The only one in this package. Everything
 * published is versioned forever because the town has a stake in it; a draft
 * was never published, so there is no history to keep and pretending otherwise
 * would mean quietly retaining something a resident asked us to throw away.
 */

import { ContributionError } from './errors.js'
import { CONTRIBUTION_TYPES, type ContributionType } from './model.js'

/** Long enough to be generous, short enough that the list stays a list. */
export const MAX_DRAFTS = 50

/**
 * How long an untouched draft survives.
 *
 * Ninety days, and the drafts list says so on any draft old enough for it to
 * matter. A store that silently kept everything forever would be holding a
 * resident's half-written thoughts about their neighbours indefinitely, which
 * is not a thing to do by accident.
 */
export const DRAFT_TTL_DAYS = 90

export interface Draft {
  id: string
  townId: string
  userId: string
  type: ContributionType
  /** Unvalidated, by design. Exactly what the composer had. */
  content: Record<string, unknown>
  /** What the drafts list prints. Derived, never asked for separately. */
  title: string
  createdAt: number
  updatedAt: number
}

export interface DraftStore {
  list(townId: string, userId: string): Promise<Draft[]>
  byId(townId: string, userId: string, id: string): Promise<Draft | null>
  count(townId: string, userId: string): Promise<number>
  create(
    input: { townId: string; userId: string; type: ContributionType; content: Record<string, unknown>; title: string },
    now: number,
  ): Promise<Draft>
  update(
    townId: string,
    userId: string,
    id: string,
    patch: { content: Record<string, unknown>; title: string },
    now: number,
  ): Promise<Draft | null>
  remove(townId: string, userId: string, id: string): Promise<boolean>
  /** Everything untouched for longer than the TTL. The tidy-away pass. */
  expired(before: number): Promise<Draft[]>
}

export interface DraftOwner {
  townId: string
  userId: string
}

export class Drafts {
  private readonly store: DraftStore
  private readonly clock: () => number

  constructor(opts: { store: DraftStore; now?: () => number }) {
    this.store = opts.store
    this.clock = opts.now ?? (() => Date.now())
  }

  async list(who: DraftOwner): Promise<Draft[]> {
    return this.store.list(who.townId, who.userId)
  }

  async get(who: DraftOwner, id: string): Promise<Draft> {
    const draft = await this.store.byId(who.townId, who.userId, id)
    // Somebody else's draft and a draft that never existed answer identically.
    // Whether a given id is a real draft is not something to learn by asking.
    if (!draft) throw new ContributionError('not_found', 'no such draft')
    return draft
  }

  /**
   * Autosave.
   *
   * One method for create and update, because the composer does not know which
   * it is doing — it has been typing for four seconds and wants the current
   * state kept. An id it does not recognise is a fresh draft rather than an
   * error, so a client that lost its id mid-session saves the work anyway.
   */
  async save(
    who: DraftOwner,
    input: { id?: string | null; type: unknown; content: unknown },
  ): Promise<Draft> {
    const type = input.type
    if (typeof type !== 'string' || !CONTRIBUTION_TYPES.includes(type as ContributionType)) {
      throw new ContributionError('invalid', `type must be one of ${CONTRIBUTION_TYPES.join(', ')}`)
    }
    const content =
      typeof input.content === 'object' && input.content !== null && !Array.isArray(input.content)
        ? (input.content as Record<string, unknown>)
        : {}

    const title = draftTitle(type as ContributionType, content)
    const now = this.clock()

    if (input.id) {
      const updated = await this.store.update(who.townId, who.userId, input.id, { content, title }, now)
      if (updated) return updated
    }

    if ((await this.store.count(who.townId, who.userId)) >= MAX_DRAFTS) {
      throw new ContributionError(
        'conflict',
        `You have ${MAX_DRAFTS} drafts. Finish one or throw one away to start another.`,
      )
    }

    return this.store.create(
      { townId: who.townId, userId: who.userId, type: type as ContributionType, content, title },
      now,
    )
  }

  /** The one real delete in this package. Silent on something already gone. */
  async discard(who: DraftOwner, id: string): Promise<boolean> {
    return this.store.remove(who.townId, who.userId, id)
  }

  /** Whatever eventually runs the tidy-away. Exposed so it is testable now. */
  async tidy(now = this.clock()): Promise<Draft[]> {
    return this.store.expired(now - DRAFT_TTL_DAYS * 24 * 60 * 60 * 1000)
  }
}

/**
 * What the drafts list calls something with no title yet.
 *
 * "Untitled photo" rather than a blank row, and the type name rather than a
 * guess at the content: autosave is worth nothing if a resident cannot
 * recognise the thing it saved.
 */
export function draftTitle(type: ContributionType, content: Record<string, unknown>): string {
  for (const key of ['title', 'name', 'caption', 'targetLabel']) {
    const value = content[key]
    if (typeof value === 'string' && value.trim()) return value.trim().slice(0, 140)
  }
  return `Untitled ${type}`
}
