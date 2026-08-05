/**
 * Acting on something that is already live.
 *
 * The review queue decides whether code may run at all. This is the other half:
 * what a moderator can do once it is running and a resident has said something
 * about it. Three actions, and the differences between them are the design.
 *
 *   **hide** takes a creation out of circulation. Reversible, unremarkable, and
 *   the right first move for almost everything — a creation that is broken,
 *   abandoned, or in the middle of an argument does not need a verdict.
 *
 *   **block** is the one that means something. It is for what the law forces:
 *   the same page, but the explainer says a moderator did this. Nothing is
 *   deleted either way, because a dead creation is still a record of what
 *   someone made.
 *
 *   **revert** puts an earlier approved version back. It is a **forward**
 *   operation: the old bytes are published again under a *new* version row that
 *   records where they came from, and the version being replaced stays in the
 *   history as what it was. Nothing is rewound and nothing is destroyed, which
 *   is precisely what makes moderating cheap enough to do promptly — every call
 *   made here can be undone by one more forward write.
 *
 * All four checks that matter live in this file rather than in the route:
 * the role, the ownership-irrelevance (a moderator acts on any creation, an
 * owner on none of this), the version's provenance, and the digest. A CLI or a
 * cron reaching this class inherits every one of them.
 */

import { randomUUID } from 'node:crypto'
import { bundleDigest, hashFiles } from '@townsquare/bundle'
import type {
  Creation,
  CreationPublisher,
  CreationStore,
  CreationVersion,
  Reviewer,
} from './model.js'
import { requireModerator, type Report, type ReportStore } from './reports.js'
import { ReviewError } from './service.js'

export type ModerationActionKind = 'hide' | 'block' | 'restore' | 'revert'

export interface ModerationEntry {
  id: string
  townId: string
  creationId: string
  action: ModerationActionKind
  actorId: string
  actorHandle: string
  note: string | null
  /** Set for a revert: what was live, and what it was reverted to. */
  fromVersionId: string | null
  toVersionId: string | null
  createdAt: number
}

/** Append-only. An audit trail that can be edited is not one. */
export interface ModerationLogStore {
  append(entry: Omit<ModerationEntry, 'createdAt'>, now: number): Promise<ModerationEntry>
  forCreation(creationId: string): Promise<ModerationEntry[]>
}

export interface ModerationOptions {
  creations: CreationStore
  publisher: CreationPublisher
  reports: ReportStore
  log: ModerationLogStore
  now?: () => number
}

/** One row of the moderator's list of live creations. */
export interface ModeratedCreation {
  id: string
  slug: string
  name: string
  /** The id, not the handle: this list is a work queue, not a wall of names. */
  ownerId: string
  status: Creation['status']
  originKey: string
  activeVersion: string | null
  openReports: number
  updatedAt: number
}

export interface ModerationDetail {
  creation: Creation
  activeVersionId: string | null
  /** Newest first. What a revert picks from. */
  versions: Array<{
    id: string
    version: string
    status: CreationVersion['status']
    bundleDigest: string
    revertedFromVersionId: string | null
    reviewNotes: string | null
    createdAt: number
    /** Whether this is the version residents are running right now. */
    live: boolean
    /** Whether a revert to it would be accepted, so the UI is not guessing. */
    revertable: boolean
  }>
  reports: Report[]
  log: ModerationEntry[]
}

export interface ModerationResult {
  creation: Creation
  entry: ModerationEntry
  /** Open reports against this creation that the action closed. */
  resolvedReports: Report[]
}

const STATUS_FOR: Record<'hide' | 'block' | 'restore', Creation['status']> = {
  hide: 'hidden',
  block: 'blocked',
  restore: 'active',
}

export class Moderation {
  private readonly now: () => number

  constructor(private readonly opts: ModerationOptions) {
    this.now = opts.now ?? (() => Date.now())
  }

  async creations(reviewer: Reviewer, townId: string): Promise<ModeratedCreation[]> {
    requireModerator(reviewer)

    const rows = await this.opts.creations.list(townId)
    const out: ModeratedCreation[] = []
    for (const creation of rows) {
      const reports = await this.opts.reports.forTarget('creation', creation.id)
      const versions = await this.opts.creations.versionsFor(creation.id)
      out.push({
        id: creation.id,
        slug: creation.slug,
        name: creation.name,
        ownerId: creation.ownerId,
        status: creation.status,
        originKey: creation.originKey,
        activeVersion:
          versions.find((v) => v.id === creation.activeVersionId)?.version ?? null,
        openReports: reports.filter((r) => r.resolvedAt === null).length,
        updatedAt: creation.updatedAt,
      })
    }

    // Anything with an open report first, then the most recently touched. The
    // list exists to be worked through, not browsed.
    return out.sort(
      (a, b) => b.openReports - a.openReports || b.updatedAt - a.updatedAt,
    )
  }

  async detail(reviewer: Reviewer, creationId: string): Promise<ModerationDetail> {
    requireModerator(reviewer)

    const creation = await this.opts.creations.byId(creationId)
    if (!creation) throw new ReviewError('not_found', 'no such creation')

    const versions = await this.opts.creations.versionsFor(creationId)
    const reports = await this.opts.reports.forTarget('creation', creationId)
    const log = await this.opts.log.forCreation(creationId)

    return {
      creation,
      activeVersionId: creation.activeVersionId,
      versions: versions
        .map((v) => ({
          id: v.id,
          version: v.version,
          status: v.status,
          bundleDigest: v.bundleDigest,
          revertedFromVersionId: v.revertedFromVersionId,
          reviewNotes: v.reviewNotes,
          createdAt: v.createdAt,
          live: v.id === creation.activeVersionId,
          revertable: v.id !== creation.activeVersionId && wasApproved(v),
        }))
        .sort((a, b) => b.createdAt - a.createdAt),
      reports,
      log,
    }
  }

  /**
   * Hide, block, or put back.
   *
   * The order of the two writes is chosen per direction, and it is the whole
   * safety argument. Restricting flips the serving path *first*, so a failure
   * halfway through leaves a creation blocked with a row that still says active
   * — annoying, and visible. Restoring writes the row first and the serving path
   * last, so the same failure leaves it still blocked. Both directions fail
   * closed, which is the only property worth having when the failure is silent.
   */
  async act(
    reviewer: Reviewer,
    creationId: string,
    action: 'hide' | 'block' | 'restore',
    note: string,
  ): Promise<ModerationResult> {
    requireModerator(reviewer)

    const creation = await this.opts.creations.byId(creationId)
    if (!creation) throw new ReviewError('not_found', 'no such creation')

    const status = STATUS_FOR[action]
    if (creation.status === status) {
      throw new ReviewError('conflict', `this creation is already ${status}`)
    }

    const now = this.now()

    if (action === 'restore') {
      const updated = await this.opts.creations.update(creationId, { status }, now)
      this.opts.publisher.setStatus(creation.originKey, status)
      return this.record(reviewer, updated, action, note, null, null, now)
    }

    this.opts.publisher.setStatus(creation.originKey, status)
    const updated = await this.opts.creations.update(creationId, { status }, now)
    return this.record(reviewer, updated, action, note, null, null, now)
  }

  /**
   * Publish an earlier approved version again, as a new version.
   *
   * The two refusals in here are the interesting part. A version that was never
   * approved can never be reverted to, so a rejected submission cannot be
   * laundered into production by a moderator picking it off a list. And the
   * bytes are re-hashed against the digest on the version row, exactly as they
   * are at approval, so what goes back live is what a human read and signed off
   * on rather than whatever is sitting under that id today.
   */
  async revert(
    reviewer: Reviewer,
    creationId: string,
    toVersionId: string,
    note: string,
  ): Promise<ModerationResult> {
    requireModerator(reviewer)

    const creation = await this.opts.creations.byId(creationId)
    if (!creation) throw new ReviewError('not_found', 'no such creation')

    const versions = await this.opts.creations.versionsFor(creationId)
    // Scoped to this creation, so a version id from somewhere else reads as a
    // version that does not exist rather than as one a moderator may publish
    // under another creation's origin key.
    const target = versions.find((v) => v.id === toVersionId)
    if (!target) throw new ReviewError('not_found', 'no such version of this creation')

    if (!wasApproved(target)) {
      throw new ReviewError(
        'forbidden',
        `version ${target.version} was ${target.status} and was never approved, so it cannot be published`,
      )
    }
    if (target.id === creation.activeVersionId) {
      throw new ReviewError('conflict', `version ${target.version} is already what residents run`)
    }

    const files = await this.opts.publisher.filesFor(target.id)
    if (!files) {
      throw new ReviewError('not_found', 'the bytes of that version are no longer stored')
    }

    const digest = bundleDigest(hashFiles([...files].map(([path, bytes]) => ({ path, bytes }))))
    if (digest !== target.bundleDigest) {
      throw new ReviewError(
        'stale',
        'the stored bytes of that version no longer match the digest it was approved with, so nothing has been published',
      )
    }

    const now = this.now()
    const fromVersionId = creation.activeVersionId
    const versionId = randomUUID()
    const published = this.opts.publisher.publish({
      kind: 'creation',
      key: creation.originKey,
      creationId: creation.id,
      versionId,
      townId: creation.townId,
      manifest: target.manifest,
      entry: target.manifest.entry,
      files,
      slug: creation.slug,
      // A revert does not un-hide anything. If a creation was hidden before the
      // revert it stays hidden after it, because those are two decisions and
      // only one of them was made here.
      status: creation.status,
    })

    await this.opts.creations.addVersion(
      {
        id: versionId,
        creationId: creation.id,
        version: revertVersionLabel(target.version, versions),
        manifest: target.manifest,
        cspHeader: published.cspHeader,
        bundleDigest: target.bundleDigest,
        status: 'approved',
        reviewedBy: reviewer.userId,
        reviewedAt: now,
        reviewNotes: note || null,
        revertedFromVersionId: target.id,
      },
      now,
    )

    // Last, same as approval: a failure above leaves the previous version
    // serving rather than a half-published one.
    const updated = await this.opts.creations.update(
      creationId,
      {
        activeVersionId: versionId,
        name: target.manifest.name,
        tagline: target.manifest.tagline,
        description: target.manifest.description,
        tags: target.manifest.tags,
      },
      now,
    )

    return this.record(reviewer, updated, 'revert', note, fromVersionId, versionId, now)
  }

  /**
   * Write the audit row, and close the reports the action answered.
   *
   * Draining is not a nicety. A report queue nobody drains is worse than no
   * queue because it implies a promise, and the most common reason one rots is
   * that acting and closing are two separate chores. Here they are one.
   */
  private async record(
    reviewer: Reviewer,
    creation: Creation,
    action: ModerationActionKind,
    note: string,
    fromVersionId: string | null,
    toVersionId: string | null,
    now: number,
  ): Promise<ModerationResult> {
    const entry = await this.opts.log.append(
      {
        id: randomUUID(),
        townId: creation.townId,
        creationId: creation.id,
        action,
        actorId: reviewer.userId,
        actorHandle: reviewer.handle,
        note: note.trim() || null,
        fromVersionId,
        toVersionId,
      },
      now,
    )

    // `restore` closes nothing: putting something back is not an answer to the
    // person who asked for it to be looked at, and their report should still be
    // read and closed deliberately.
    const resolvedReports: Report[] = []
    if (action !== 'restore') {
      const open = (await this.opts.reports.forTarget('creation', creation.id)).filter(
        (r) => r.resolvedAt === null,
      )
      for (const report of open) {
        resolvedReports.push(
          await this.opts.reports.resolve(report.id, {
            resolution: action === 'revert' ? 'reverted' : 'upheld',
            resolvedBy: reviewer.userId,
            resolvedAt: now,
            resolutionNote: note.trim() || null,
          }),
        )
      }
    }

    return { creation, entry, resolvedReports }
  }
}

/** Approved once, whether or not something newer has since replaced it. */
function wasApproved(version: CreationVersion): boolean {
  return version.status === 'approved' || version.status === 'superseded'
}

/**
 * The version string of the row a revert writes.
 *
 * `(creation_id, version)` is unique, so a revert cannot reuse the string it is
 * restoring — and should not want to: the new row is a different row with a
 * different id, a different timestamp, and a moderator's name on it. Semver
 * build metadata (`1.2.0+revert.1`) says exactly that. It compares equal to
 * `1.2.0` under semver, so a builder's next release still sorts above it, and
 * the manifest inside the bundle is untouched and still says `1.2.0`.
 */
export function revertVersionLabel(
  version: string,
  existing: readonly { version: string }[],
): string {
  const prefix = `${version}+revert.`
  const taken = existing.filter((v) => v.version.startsWith(prefix)).length
  for (let n = taken + 1; n < taken + 100; n++) {
    const candidate = `${prefix}${n}`
    if (!existing.some((v) => v.version === candidate)) return candidate
  }
  throw new ReviewError('conflict', `no free version label near ${prefix}`)
}
