/**
 * Memory implementations of the review stores.
 *
 * Genuine, not simplified: the uniqueness the schema enforces with indexes is
 * enforced here too, so a test that passes is testing the rules rather than a
 * store that agrees with them. They land on the same interfaces the Drizzle
 * implementations will, and nothing above them changes when they do.
 */

import { randomUUID } from 'node:crypto'
import type { Manifest } from '@townsquare/manifest'
import type {
  Creation,
  CreationStore,
  CreationVersion,
  NewSubmission,
  RecordTypeRow,
  RecordTypeStore,
  Submission,
  SubmissionStatus,
  SubmissionStore,
} from './model.js'

export class MemorySubmissionStore implements SubmissionStore {
  private readonly rows = new Map<string, Submission>()
  private readonly bundles = new Map<string, ReadonlyMap<string, Uint8Array>>()

  async create(input: NewSubmission, now: number): Promise<Submission> {
    let byteSize = 0
    for (const bytes of input.files.values()) byteSize += bytes.byteLength

    const submission: Submission = {
      id: randomUUID(),
      townId: input.townId,
      userId: input.userId,
      handle: input.handle,
      creationId: input.creationId,
      proposedSlug: input.proposedSlug,
      name: input.name,
      version: input.version,
      manifest: input.manifest,
      entry: input.entry,
      bundleDigest: input.bundleDigest,
      fileCount: input.files.size,
      byteSize,
      warnings: input.warnings.map((w) => ({ ...w })),
      status: 'queued',
      note: null,
      decidedBy: null,
      submittedAt: now,
      decidedAt: null,
    }
    this.rows.set(submission.id, submission)
    // Copied, so the draft store cannot mutate what the reviewer will read.
    this.bundles.set(submission.id, new Map(input.files))
    return { ...submission }
  }

  async byId(id: string): Promise<Submission | null> {
    const row = this.rows.get(id)
    return row ? { ...row } : null
  }

  async filesFor(id: string): Promise<ReadonlyMap<string, Uint8Array> | null> {
    return this.bundles.get(id) ?? null
  }

  async queued(townId: string): Promise<Submission[]> {
    return [...this.rows.values()]
      .filter((s) => s.townId === townId && s.status === 'queued')
      .map((s) => ({ ...s }))
  }

  async forUser(userId: string): Promise<Submission[]> {
    return [...this.rows.values()]
      .filter((s) => s.userId === userId)
      .sort((a, b) => b.submittedAt - a.submittedAt)
      .map((s) => ({ ...s }))
  }

  async decide(
    id: string,
    patch: { status: SubmissionStatus; note: string | null; decidedBy: string; decidedAt: number },
  ): Promise<Submission> {
    const row = this.rows.get(id)
    if (!row) throw new Error(`no such submission: ${id}`)
    const next: Submission = { ...row, ...patch }
    this.rows.set(id, next)
    return { ...next }
  }
}

export class MemoryCreationStore implements CreationStore {
  private readonly creations = new Map<string, Creation>()
  private readonly versions = new Map<string, CreationVersion[]>()

  async byId(id: string): Promise<Creation | null> {
    const row = this.creations.get(id)
    return row ? { ...row } : null
  }

  async bySlug(townId: string, slug: string): Promise<Creation | null> {
    for (const row of this.creations.values()) {
      if (row.townId === townId && row.slug === slug) return { ...row }
    }
    return null
  }

  async listForOwner(ownerId: string): Promise<Creation[]> {
    return [...this.creations.values()].filter((c) => c.ownerId === ownerId).map((c) => ({ ...c }))
  }

  async list(townId: string): Promise<Creation[]> {
    return [...this.creations.values()].filter((c) => c.townId === townId).map((c) => ({ ...c }))
  }

  async create(
    input: Omit<Creation, 'createdAt' | 'updatedAt' | 'activeVersionId'>,
    now: number,
  ): Promise<Creation> {
    // Mirrors `creations_town_slug_uq` and `creations_origin_key_uq`. An origin
    // key that could be issued twice would hand one creation's localStorage to
    // another, which is the one collision that is not merely untidy.
    for (const row of this.creations.values()) {
      if (row.townId === input.townId && row.slug === input.slug) {
        throw new Error(`slug already taken: ${input.slug}`)
      }
      if (row.originKey === input.originKey) {
        throw new Error(`origin key already allocated: ${input.originKey}`)
      }
    }
    const creation: Creation = { ...input, activeVersionId: null, createdAt: now, updatedAt: now }
    this.creations.set(creation.id, creation)
    this.versions.set(creation.id, [])
    return { ...creation }
  }

  async update(id: string, patch: Partial<Creation>, now: number): Promise<Creation> {
    const row = this.creations.get(id)
    if (!row) throw new Error(`no such creation: ${id}`)
    // `id` and `originKey` are immutable by construction, not by discipline.
    const next: Creation = { ...row, ...patch, id: row.id, originKey: row.originKey, updatedAt: now }
    this.creations.set(id, next)
    return { ...next }
  }

  async addVersion(
    version: Omit<CreationVersion, 'createdAt'>,
    now: number,
  ): Promise<CreationVersion> {
    const list = this.versions.get(version.creationId) ?? []
    if (list.some((v) => v.version === version.version)) {
      throw new Error(`version already exists: ${version.version}`)
    }
    // The previous approved version is superseded, never deleted: it is what a
    // rollback restores and what a report is filed against.
    const superseded = list.map((v) =>
      v.status === 'approved' ? { ...v, status: 'superseded' as const } : v,
    )
    const row: CreationVersion = { ...version, createdAt: now }
    this.versions.set(version.creationId, [...superseded, row])
    return { ...row }
  }

  async versionsFor(creationId: string): Promise<CreationVersion[]> {
    return (this.versions.get(creationId) ?? []).map((v) => ({ ...v }))
  }

  async activeManifest(creationId: string): Promise<Manifest | null> {
    const creation = this.creations.get(creationId)
    if (!creation?.activeVersionId) return null
    const version = (this.versions.get(creationId) ?? []).find(
      (v) => v.id === creation.activeVersionId,
    )
    return version?.manifest ?? null
  }
}

export class MemoryRecordTypeStore implements RecordTypeStore {
  private readonly rows = new Map<string, RecordTypeRow>()

  private key(townId: string, type: string): string {
    return `${townId}:${type}`
  }

  async list(townId: string): Promise<RecordTypeRow[]> {
    return [...this.rows.values()].filter((r) => r.townId === townId).map((r) => ({ ...r }))
  }

  async define(row: Omit<RecordTypeRow, 'recordCount'>, _now: number): Promise<void> {
    const key = this.key(row.townId, row.type)
    // First definer wins. A second definition is not an error and not an
    // overwrite: the type is the town's, and the second creation simply uses it.
    if (this.rows.has(key)) return
    this.rows.set(key, { ...row, recordCount: 0 })
  }
}
