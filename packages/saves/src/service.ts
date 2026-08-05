/**
 * Saving: the one thing a resident's account holds about the town.
 *
 * `design/hifi` 5b is a screen about you, and almost everything on it — posts,
 * follows, how many people used the app you built — needs a table or a
 * telemetry pipeline that does not exist. Saving does not. It is the smallest
 * honest version of that screen and it is worth building on its own: a resident
 * who bookmarks the hardware store's hours has a reason to open Town Square
 * again tomorrow.
 *
 * ## Where the rules live, and why they live here
 *
 * In this class, not in the route. The same argument as `Reports.file` and
 * `Review.decide`: the cap, the closed set of kinds and the length limits are
 * rules about saving, not rules about HTTP, and the next door onto saving — the
 * SDK, a mobile client, a CLI — must not be able to arrive without them.
 *
 * ## What the scope is, and what it is not
 *
 * `(townId, userId)`, and the `userId` comes from the session the API resolved.
 * There is no parameter on any method here that would address another
 * resident's list, which is the same property `packages/storage` has and for
 * the same reason: cross-tenant access should be impossible to express, not
 * merely avoided.
 */

import { SAVE_KINDS, type NewSave, type Save, type SaveKind, type SaveStore } from './store.js'

export class SavesError extends Error {
  constructor(
    readonly code: 'invalid' | 'too_many',
    message: string,
  ) {
    super(message)
    this.name = 'SavesError'
  }
}

/**
 * A ceiling, not a business model.
 *
 * It exists so one account cannot turn a save button into an unbounded write
 * loop against the town's database. Two hundred is far past what anyone will
 * hit by using the app, and a resident who does hit it is told plainly rather
 * than having writes silently start failing.
 */
export const MAX_SAVES = 200

/** Long enough for the longest business name in the directory, and no longer. */
const MAX_TITLE = 140
const MAX_DETAIL = 200
const MAX_URL = 500
const MAX_REF = 200

export interface Saver {
  townId: string
  userId: string
}

export interface SaveInput {
  kind: unknown
  refId: unknown
  title: unknown
  detail?: unknown
  url?: unknown
}

export interface SaveResult {
  save: Save
  /**
   * True when this save already existed.
   *
   * Answered `200` with the original rather than a conflict. A bookmark button
   * pressed twice is a person checking whether it worked, and an error is a
   * worse answer to that than "yes, it is saved" — which is also the true one.
   */
  duplicate: boolean
}

export class Saves {
  private readonly store: SaveStore
  private readonly clock: () => number

  constructor(opts: { store: SaveStore; now?: () => number }) {
    this.store = opts.store
    this.clock = opts.now ?? (() => Date.now())
  }

  async list(who: Saver): Promise<Save[]> {
    return this.store.list(who.townId, who.userId)
  }

  async count(who: Saver): Promise<number> {
    return this.store.count(who.townId, who.userId)
  }

  async save(who: Saver, input: SaveInput): Promise<SaveResult> {
    const kind = input.kind
    if (typeof kind !== 'string' || !SAVE_KINDS.includes(kind as SaveKind)) {
      throw new SavesError('invalid', `kind must be one of ${SAVE_KINDS.join(', ')}`)
    }
    const refId = text(input.refId, MAX_REF, 'refId')
    if (!refId) throw new SavesError('invalid', 'refId is required')

    const title = text(input.title, MAX_TITLE, 'title')
    if (!title) throw new SavesError('invalid', 'title is required')

    const existing = await this.store.find(who.townId, who.userId, kind as SaveKind, refId)
    if (existing) return { save: existing, duplicate: true }

    // Counted after the duplicate check, so re-saving something you already
    // have never fails on the cap.
    if ((await this.store.count(who.townId, who.userId)) >= MAX_SAVES) {
      throw new SavesError(
        'too_many',
        `You have ${MAX_SAVES} saved things. Remove one to save another.`,
      )
    }

    const row: NewSave = {
      townId: who.townId,
      userId: who.userId,
      kind: kind as SaveKind,
      refId,
      title,
      detail: text(input.detail, MAX_DETAIL, 'detail') || null,
      url: link(input.url),
    }
    return { save: await this.store.create(row, this.clock()), duplicate: false }
  }

  /** Unsaving something you never saved is a success. It is already gone. */
  async remove(who: Saver, kind: unknown, refId: unknown): Promise<boolean> {
    if (typeof kind !== 'string' || !SAVE_KINDS.includes(kind as SaveKind)) {
      throw new SavesError('invalid', `kind must be one of ${SAVE_KINDS.join(', ')}`)
    }
    const ref = text(refId, MAX_REF, 'refId')
    if (!ref) throw new SavesError('invalid', 'refId is required')
    return this.store.remove(who.townId, who.userId, kind as SaveKind, ref)
  }
}

/** Trimmed, capped, and refused rather than truncated when it is over. */
function text(value: unknown, max: number, field: string): string {
  if (value === undefined || value === null) return ''
  if (typeof value !== 'string') throw new SavesError('invalid', `${field} must be a string`)
  const trimmed = value.trim()
  if (trimmed.length > max) {
    throw new SavesError('invalid', `${field} is longer than ${max} characters`)
  }
  return trimmed
}

/**
 * A saved link is rendered as an anchor on the Yours screen, so the scheme is
 * checked rather than trusted. `javascript:` in an `href` the shell renders is
 * script execution on the origin holding the session cookie, and the cheapest
 * place to refuse it is before it is ever stored.
 */
function link(value: unknown): string | null {
  const raw = text(value, MAX_URL, 'url')
  if (!raw) return null
  let parsed: URL
  try {
    parsed = new URL(raw)
  } catch {
    throw new SavesError('invalid', 'url must be absolute')
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new SavesError('invalid', 'url must be http or https')
  }
  return parsed.toString()
}
