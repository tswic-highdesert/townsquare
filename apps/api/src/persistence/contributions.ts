import { LocalDatabase, SqliteMap } from './database.js'
import { randomUUID } from 'node:crypto'
import type { Draft, DraftStore } from '@townsquare/contributions'
import type {
  AttemptLog,
  Attribution,
  Contribution,
  ContributionPatch,
  ContributionStore,
  ContributionType,
  NewContribution,
  NewRecord,
  RecordStore,
  RecordType,
  RecordVersion,
  ReviewRoute,
  TownRecord,
} from '@townsquare/contributions'
import { attributedUserId } from '@townsquare/contributions'

export class SqliteContributionStore implements ContributionStore {
  private readonly rows: SqliteMap<Contribution>
  constructor(database: LocalDatabase) { this.rows = new SqliteMap(database, 'contributions') }

  async create(input: NewContribution, now: number): Promise<Contribution> {
    const row: Contribution = {
      id: randomUUID(),
      townId: input.townId,
      type: input.type,
      content: input.content,
      contentDigest: input.contentDigest,
      attribution: input.attribution,
      status: input.status,
      route: input.route,
      countsTowardPause: input.countsTowardPause,
      recordId: null,
      recordVersion: null,
      scheduledFor: input.scheduledFor,
      decidedBy: null,
      decisionNote: null,
      decidedAt: null,
      createdAt: now,
      updatedAt: now,
    }
    this.rows.set(row.id, row)
    return { ...row }
  }

  async byId(id: string): Promise<Contribution | null> {
    const row = this.rows.get(id)
    return row ? { ...row } : null
  }

  async forUser(userId: string): Promise<Contribution[]> {
    return [...this.rows.values()]
      .filter((r) => attributedUserId(r.attribution) === userId)
      .sort((a, b) => b.createdAt - a.createdAt)
      .map((r) => ({ ...r }))
  }

  async queued(townId: string, route: ReviewRoute): Promise<Contribution[]> {
    return [...this.rows.values()]
      .filter((r) => r.townId === townId && r.status === 'queued' && r.route === route)
      // Oldest first. A queue that surfaces the newest is a queue where the
      // person who waited longest waits longer still.
      .sort((a, b) => a.createdAt - b.createdAt)
      .map((r) => ({ ...r }))
  }

  async heldForUser(userId: string): Promise<Contribution[]> {
    return [...this.rows.values()]
      .filter(
        (r) => r.status === 'held_for_verification' && attributedUserId(r.attribution) === userId,
      )
      .sort((a, b) => a.createdAt - b.createdAt)
      .map((r) => ({ ...r }))
  }

  async dueScheduled(townId: string, asOf: number): Promise<Contribution[]> {
    return [...this.rows.values()]
      .filter(
        (r) =>
          r.townId === townId &&
          r.status === 'scheduled' &&
          r.scheduledFor !== null &&
          r.scheduledFor <= asOf,
      )
      .sort((a, b) => (a.scheduledFor ?? 0) - (b.scheduledFor ?? 0))
      .map((r) => ({ ...r }))
  }

  async countedSince(userId: string, since: number): Promise<number[]> {
    return [...this.rows.values()]
      .filter(
        (r) =>
          attributedUserId(r.attribution) === userId &&
          r.countsTowardPause &&
          r.createdAt > since &&
          // Withdrawn work is not something a resident should be charged for,
          // and a declined one has already cost them enough.
          r.status !== 'withdrawn' &&
          r.status !== 'declined' &&
          r.status !== 'held_for_verification',
      )
      .map((r) => r.createdAt)
      .sort((a, b) => a - b)
  }

  async openCorrectionBy(
    userId: string,
    townId: string,
    targetRef: string,
    field: string,
  ): Promise<Contribution | null> {
    // Partial, the same way the index is: only rows nobody has decided on
    // count. A resident whose first correction was turned down may file again,
    // because that is a new claim rather than a second copy of the old one.
    const found = [...this.rows.values()].find(
      (r) =>
        r.townId === townId &&
        attributedUserId(r.attribution) === userId &&
        (r.status === 'queued' || r.status === 'held_for_verification') &&
        r.content.kind === 'correction' &&
        r.content.targetRef === targetRef &&
        r.content.field === field,
    )
    return found ? { ...found } : null
  }

  async update(id: string, patch: ContributionPatch, now: number): Promise<Contribution> {
    const row = this.rows.get(id)
    if (!row) throw new Error(`no contribution ${id}`)
    const next: Contribution = { ...row, ...patch, updatedAt: now }
    this.rows.set(id, next)
    return { ...next }
  }
}

export class SqliteRecordStore implements RecordStore {
  private readonly records: SqliteMap<TownRecord>
  private readonly history: SqliteMap<RecordVersion[]>
  constructor(private readonly database: LocalDatabase) {
    this.records = new SqliteMap(database, 'records')
    this.history = new SqliteMap(database, 'recordVersions')
  }

  async byId(id: string): Promise<TownRecord | null> {
    const row = this.records.get(id)
    return row ? clone(row) : null
  }

  async bySourceRef(townId: string, sourceRef: string): Promise<TownRecord | null> {
    for (const row of this.records.values()) {
      if (row.townId === townId && row.sourceRef === sourceRef) return clone(row)
    }
    return null
  }

  async create(
    input: NewRecord,
    now: number,
  ): Promise<{ record: TownRecord; version: RecordVersion }> {
    const record: TownRecord = {
      id: randomUUID(),
      townId: input.townId,
      type: input.type,
      data: input.data,
      currentVersion: 1,
      status: 'active',
      sourceRef: input.sourceRef,
      createdAt: now,
      updatedAt: now,
    }
    const version: RecordVersion = {
      id: randomUUID(),
      recordId: record.id,
      version: 1,
      data: input.data,
      author: input.author,
      revertedFrom: null,
      contributionId: input.contributionId,
      createdAt: now,
    }
    this.database.transaction(() => {
      this.records.set(record.id, record)
      this.history.set(record.id, [version])
    })
    return { record: clone(record), version: { ...version } }
  }

  async addVersion(
    recordId: string,
    input: {
      data: Record<string, unknown>
      author: Attribution
      revertedFrom: number | null
      contributionId: string | null
    },
    now: number,
  ): Promise<RecordVersion> {
    const record = this.records.get(recordId)
    if (!record) throw new Error(`no record ${recordId}`)
    const versions = this.history.get(recordId) ?? []

    const version: RecordVersion = {
      id: randomUUID(),
      recordId,
      version: record.currentVersion + 1,
      data: input.data,
      author: input.author,
      revertedFrom: input.revertedFrom,
      contributionId: input.contributionId,
      createdAt: now,
    }
    // Appended. The one before it stays exactly where it is, which is the
    // difference between a history and a current value with a rumour attached.
    versions.push(version)
    this.database.transaction(() => {
    this.history.set(recordId, versions)
    this.records.set(recordId, {
      ...record,
      data: input.data,
      currentVersion: version.version,
      updatedAt: now,
    })
    })
    return { ...version }
  }

  async versions(recordId: string): Promise<RecordVersion[]> {
    return (this.history.get(recordId) ?? []).map((v) => ({ ...v }))
  }

  async list(townId: string, type: RecordType): Promise<TownRecord[]> {
    return [...this.records.values()]
      .filter((r) => r.townId === townId && r.type === type && r.status === 'active')
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .map(clone)
  }
}

export class SqliteDraftStore implements DraftStore {
  private readonly rows: SqliteMap<Draft[]>
  constructor(database: LocalDatabase) { this.rows = new SqliteMap(database, 'drafts') }

  private key(townId: string, userId: string): string {
    return `${townId} ${userId}`
  }

  async list(townId: string, userId: string): Promise<Draft[]> {
    return [...(this.rows.get(this.key(townId, userId)) ?? [])]
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .map((d) => ({ ...d }))
  }

  async byId(townId: string, userId: string, id: string): Promise<Draft | null> {
    const found = (this.rows.get(this.key(townId, userId)) ?? []).find((d) => d.id === id)
    return found ? { ...found } : null
  }

  async count(townId: string, userId: string): Promise<number> {
    return (this.rows.get(this.key(townId, userId)) ?? []).length
  }

  async create(
    input: {
      townId: string
      userId: string
      type: ContributionType
      content: Record<string, unknown>
      title: string
    },
    now: number,
  ): Promise<Draft> {
    const key = this.key(input.townId, input.userId)
    const mine = this.rows.get(key) ?? []
    const draft: Draft = { id: randomUUID(), ...input, createdAt: now, updatedAt: now }
    mine.push(draft)
    this.rows.set(key, mine)
    return { ...draft }
  }

  async update(
    townId: string,
    userId: string,
    id: string,
    patch: { content: Record<string, unknown>; title: string },
    now: number,
  ): Promise<Draft | null> {
    const mine = this.rows.get(this.key(townId, userId)) ?? []
    const at = mine.findIndex((d) => d.id === id)
    // Scoped by owner, so an id belonging to somebody else is simply not found
    // rather than found and refused.
    if (at === -1) return null
    const existing = mine[at]
    if (!existing) return null
    const next: Draft = { ...existing, ...patch, updatedAt: now }
    mine[at] = next
    this.rows.set(this.key(townId, userId), mine)
    return { ...next }
  }

  async remove(townId: string, userId: string, id: string): Promise<boolean> {
    const key = this.key(townId, userId)
    const mine = this.rows.get(key) ?? []
    const at = mine.findIndex((d) => d.id === id)
    if (at === -1) return false
    mine.splice(at, 1)
    this.rows.set(key, mine)
    return true
  }

  async expired(before: number): Promise<Draft[]> {
    const out: Draft[] = []
    for (const mine of this.rows.values()) {
      for (const draft of mine) if (draft.updatedAt < before) out.push({ ...draft })
    }
    return out
  }
}

export class SqliteAttemptLog implements AttemptLog {
  private readonly rows: SqliteMap<{ userId: string; allowed: boolean; at: number }>
  constructor(database: LocalDatabase) { this.rows = new SqliteMap(database, 'contributionAttempts') }

  async record(userId: string, allowed: boolean, now: number): Promise<void> {
    this.rows.set(randomUUID(), { userId, allowed, at: now })
  }

  async countSince(userId: string, since: number): Promise<number> {
    return [...this.rows.values()].filter((r) => r.userId === userId && r.at > since).length
  }
}

function clone(record: TownRecord): TownRecord { return { ...record, data: { ...record.data } } }
