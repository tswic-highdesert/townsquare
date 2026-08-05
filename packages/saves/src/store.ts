/**
 * What saving needs from the database, and an in-memory implementation.
 *
 * Every method takes `(townId, userId)` first and there is no way to address a
 * row without them — the same shape as `packages/storage`, for the same reason.
 * A `byId(id)` that did not also take the owner would eventually be called with
 * an id a client chose, and the scoping bug would be one careless route away
 * rather than structurally impossible.
 */

/**
 * The closed set, and it stays closed.
 *
 * `story` was added when the news reader got a bookmark. It is the first kind
 * that points at something Town Square does not host: a business, an event and
 * a creation all resolve to something in the town's own data, and a story
 * resolves to a page on somebody else's website. That is exactly why the
 * snapshot below matters more for this kind than for the others — a saved
 * story outlives the feed it came from by design, and often outlives the
 * publisher's URL too.
 */
export const SAVE_KINDS = ['business', 'event', 'creation', 'story'] as const
export type SaveKind = (typeof SAVE_KINDS)[number]

export interface Save {
  id: string
  townId: string
  userId: string
  kind: SaveKind
  /**
   * The id in whatever the thing came from — a directory listing, a calendar
   * entry, a creation slug. Not a foreign key: the feed is re-scraped and ids
   * come and go, so this is how a save is recognised, not how it is resolved.
   */
  refId: string
  /**
   * A snapshot of what was saved, taken at the moment it was saved.
   *
   * The alternative is resolving the title from the feed on every read, and a
   * saved event that vanishes from your list the morning after it happened is
   * a list that quietly deletes your things. A stale title is honest: it is
   * what you saved.
   */
  title: string
  detail: string | null
  url: string | null
  savedAt: number
}

export interface NewSave {
  townId: string
  userId: string
  kind: SaveKind
  refId: string
  title: string
  detail: string | null
  url: string | null
}

export interface SaveStore {
  /** Newest first. The only read, and it is always scoped to one resident. */
  list(townId: string, userId: string): Promise<Save[]>
  /** The uniqueness probe. `saves_user_target_uq` in Postgres. */
  find(townId: string, userId: string, kind: SaveKind, refId: string): Promise<Save | null>
  count(townId: string, userId: string): Promise<number>
  create(input: NewSave, now: number): Promise<Save>
  /** Scoped remove. Returns false when the row is not this resident's. */
  remove(townId: string, userId: string, kind: SaveKind, refId: string): Promise<boolean>
}

export class MemorySaveStore implements SaveStore {
  private readonly rows = new Map<string, Save[]>()
  private seq = 0

  /** Built here and nowhere else, so a scoping mistake has one place to live. */
  private key(townId: string, userId: string): string {
    return `${townId} ${userId}`
  }

  async list(townId: string, userId: string): Promise<Save[]> {
    const mine = this.rows.get(this.key(townId, userId)) ?? []
    return [...mine].sort((a, b) => b.savedAt - a.savedAt).map((s) => ({ ...s }))
  }

  async find(
    townId: string,
    userId: string,
    kind: SaveKind,
    refId: string,
  ): Promise<Save | null> {
    const mine = this.rows.get(this.key(townId, userId)) ?? []
    const found = mine.find((s) => s.kind === kind && s.refId === refId)
    return found ? { ...found } : null
  }

  async count(townId: string, userId: string): Promise<number> {
    return (this.rows.get(this.key(townId, userId)) ?? []).length
  }

  async create(input: NewSave, now: number): Promise<Save> {
    const key = this.key(input.townId, input.userId)
    const mine = this.rows.get(key) ?? []
    const save: Save = { id: `save_${++this.seq}`, ...input, savedAt: now }
    mine.push(save)
    this.rows.set(key, mine)
    return { ...save }
  }

  async remove(
    townId: string,
    userId: string,
    kind: SaveKind,
    refId: string,
  ): Promise<boolean> {
    const key = this.key(townId, userId)
    const mine = this.rows.get(key) ?? []
    const at = mine.findIndex((s) => s.kind === kind && s.refId === refId)
    if (at === -1) return false
    mine.splice(at, 1)
    this.rows.set(key, mine)
    return true
  }
}
