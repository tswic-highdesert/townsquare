/**
 * The queue, and what happens when a human decides.
 *
 * Review is the scarce resource on this platform. Everything here is arranged
 * so that the reviewer's attention goes only where a machine cannot help:
 * the automated pass has already run at `submit`, the warnings arrive
 * pre-attached, and an update shows a permission *diff* rather than a
 * permissions block to re-read from scratch.
 *
 * Three properties are load-bearing and none is a convention:
 *
 *   **Approval is of one exact version.** Not of a person, not of a creation.
 *   The bundle digest is re-checked at the moment of approval against the bytes
 *   the queue is holding, so what a reviewer read is what goes live.
 *
 *   **The town is re-validated at approval time.** A submission that was clean
 *   on Tuesday can be invalid on Thursday, because someone else defined a
 *   conflicting record type in between. Publishing a stale pass would let the
 *   queue write something the validator would now reject.
 *
 *   **Updates go through all of it again.** The live version keeps serving
 *   until a human approves its replacement. That is the whole defence against
 *   getting approved, building an audience, and then shipping the real payload.
 */

import { randomUUID } from 'node:crypto'
import { validateBundle, hashFiles, bundleDigest, type Finding } from '@townsquare/bundle'
import { originKeyFromUuid } from '@townsquare/shared'
import type { Defines, Manifest } from '@townsquare/manifest'
import { diffManifests, grantsOf, isEscalation, type ManifestDiff, type PermissionChange } from './diff.js'
import type {
  Creation,
  CreationPublisher,
  CreationStore,
  Decision,
  NewSubmission,
  RecordTypeStore,
  Reviewer,
  Submission,
  SubmissionStore,
} from './model.js'

export class ReviewError extends Error {
  constructor(
    readonly code:
      | 'forbidden'
      | 'not_found'
      | 'conflict'
      | 'invalid'
      | 'stale',
    message: string,
  ) {
    super(message)
    this.name = 'ReviewError'
  }
}

export interface QueueItem {
  id: string
  handle: string
  name: string
  proposedSlug: string
  version: string
  /** An update to something already live, or a first submission. */
  kind: 'new' | 'update'
  /** Set for updates. The one number that says how hard to look. */
  escalates: boolean
  warningCount: number
  fileCount: number
  byteSize: number
  submittedAt: number
}

export interface ReviewDetail {
  submission: Submission
  kind: 'new' | 'update'
  /** For a first submission: everything it asks for, since it all is new. */
  grants: PermissionChange[]
  /** For an update: only what changed. */
  diff: ManifestDiff | null
  warnings: readonly Finding[]
  /** The source a reviewer actually reads. Text files only. */
  files: Array<{ path: string; text: string; bytes: number }>
  /** Binary or oversized files, named but not inlined. */
  omitted: Array<{ path: string; bytes: number; reason: string }>
  live: { slug: string; version: string; originKey: string } | null
}

export interface DecisionResult {
  submission: Submission
  creation: Creation | null
  url: string | null
}

export interface ReviewOptions {
  submissions: SubmissionStore
  creations: CreationStore
  recordTypes: RecordTypeStore
  publisher: CreationPublisher
  now?: () => number
}

/** Files a reviewer is expected to read, rather than take on trust. */
const READABLE = /\.(html|js|mjs|css|json|svg|md|txt)$/i
/** Past this, inlining the file stops helping and starts hiding the rest. */
const INLINE_LIMIT = 128 * 1024

export class Review {
  private readonly now: () => number

  constructor(private readonly opts: ReviewOptions) {
    this.now = opts.now ?? (() => Date.now())
  }

  /**
   * Put a validated bundle in the queue.
   *
   * Called from the MCP's `submit`. It decides on its own whether this is a
   * first submission or an update, by looking at what the submitter already
   * owns — a builder should not have to tell us which one they meant, and a
   * builder who could tell us could claim someone else's creation.
   */
  async submit(
    input: Omit<NewSubmission, 'creationId'> & { creationId?: string | null },
  ): Promise<Submission> {
    const now = this.now()

    // An explicit target is checked for ownership; an absent one is resolved
    // from the slug the builder proposed. Either way the answer comes from the
    // store, never from the manifest.
    let creation: Creation | null = null
    if (input.creationId) {
      creation = await this.opts.creations.byId(input.creationId)
      if (!creation) throw new ReviewError('not_found', 'no such creation')
    } else {
      const bySlug = await this.opts.creations.bySlug(input.townId, input.proposedSlug)
      if (bySlug && bySlug.ownerId === input.userId) creation = bySlug
    }

    if (creation) {
      if (creation.ownerId !== input.userId) {
        throw new ReviewError('forbidden', 'that creation belongs to another resident')
      }
      const versions = await this.opts.creations.versionsFor(creation.id)
      if (versions.some((v) => v.version === input.version)) {
        throw new ReviewError(
          'conflict',
          `version ${input.version} of "${creation.slug}" has already been submitted; bump the version in your manifest`,
        )
      }
    }

    // One at a time per builder-and-creation. A queue holding two versions of
    // the same app is a queue where approving them out of order silently
    // downgrades what residents are running.
    const outstanding = (await this.opts.submissions.forUser(input.userId)).find(
      (s) =>
        s.status === 'queued' &&
        (creation ? s.creationId === creation.id : s.proposedSlug === input.proposedSlug),
    )
    if (outstanding) {
      throw new ReviewError(
        'conflict',
        `you already have version ${outstanding.version} in the queue for this creation`,
      )
    }

    return this.opts.submissions.create({ ...input, creationId: creation?.id ?? null }, now)
  }

  /** Read-through, for the builder door. Callers filter by owner themselves. */
  async submissionById(id: string): Promise<Submission | null> {
    return this.opts.submissions.byId(id)
  }

  async submissionsForUser(userId: string): Promise<Submission[]> {
    return this.opts.submissions.forUser(userId)
  }

  async queue(townId: string): Promise<QueueItem[]> {
    const rows = await this.opts.submissions.queued(townId)
    const items: QueueItem[] = []

    for (const submission of rows) {
      const previous = submission.creationId
        ? await this.opts.creations.activeManifest(submission.creationId)
        : null
      items.push({
        id: submission.id,
        handle: submission.handle,
        name: submission.name,
        proposedSlug: submission.proposedSlug,
        version: submission.version,
        kind: submission.creationId ? 'update' : 'new',
        // A first submission is always "everything is new", so calling it an
        // escalation would make the flag meaningless on the rows where it is
        // supposed to mean something.
        escalates: previous ? isEscalation(diffManifests(previous, submission.manifest)) : false,
        warningCount: submission.warnings.length,
        fileCount: submission.fileCount,
        byteSize: submission.byteSize,
        submittedAt: submission.submittedAt,
      })
    }

    // Oldest first. A queue that surfaces the newest submission is a queue
    // where the first person to submit waits the longest.
    return items.sort((a, b) => a.submittedAt - b.submittedAt)
  }

  async detail(id: string): Promise<ReviewDetail> {
    const submission = await this.opts.submissions.byId(id)
    if (!submission) throw new ReviewError('not_found', 'no such submission')

    const files = await this.opts.submissions.filesFor(id)
    if (!files) throw new ReviewError('not_found', 'this submission has no bundle')

    const previous = submission.creationId
      ? await this.opts.creations.activeManifest(submission.creationId)
      : null
    const creation = submission.creationId
      ? await this.opts.creations.byId(submission.creationId)
      : null

    const decoder = new TextDecoder('utf-8', { fatal: false })
    const readable: ReviewDetail['files'] = []
    const omitted: ReviewDetail['omitted'] = []

    for (const [path, bytes] of [...files].sort((a, b) => a[0].localeCompare(b[0]))) {
      if (!READABLE.test(path)) {
        omitted.push({ path, bytes: bytes.byteLength, reason: 'not a text file' })
        continue
      }
      if (bytes.byteLength > INLINE_LIMIT) {
        omitted.push({ path, bytes: bytes.byteLength, reason: 'too large to inline' })
        continue
      }
      readable.push({ path, text: decoder.decode(bytes), bytes: bytes.byteLength })
    }

    return {
      submission,
      kind: submission.creationId ? 'update' : 'new',
      grants: previous ? [] : grantsOf(submission.manifest),
      diff: previous ? diffManifests(previous, submission.manifest) : null,
      warnings: submission.warnings,
      files: readable,
      omitted,
      live: creation
        ? {
            slug: creation.slug,
            version: previous?.version ?? '—',
            originKey: creation.originKey,
          }
        : null,
    }
  }

  /**
   * Decide one submission.
   *
   * The role check is here rather than only at the route, because moderation is
   * a role held by a committee and the committee is the thing that must be
   * unable to be bypassed. A second door onto this function later — a CLI, a
   * script, a cron — inherits the check for free.
   */
  async decide(
    reviewer: Reviewer,
    id: string,
    decision: Decision,
    note: string,
  ): Promise<DecisionResult> {
    if (reviewer.role !== 'moderator' && reviewer.role !== 'admin') {
      throw new ReviewError('forbidden', 'reviewing is a moderator role')
    }

    const submission = await this.opts.submissions.byId(id)
    if (!submission) throw new ReviewError('not_found', 'no such submission')
    if (submission.status !== 'queued') {
      throw new ReviewError('conflict', `this submission was already ${submission.status}`)
    }

    const now = this.now()

    if (decision !== 'approve') {
      const decided = await this.opts.submissions.decide(id, {
        status: decision === 'reject' ? 'rejected' : 'changes_requested',
        note: note || null,
        decidedBy: reviewer.userId,
        decidedAt: now,
      })
      return { submission: decided, creation: null, url: null }
    }

    return this.approve(reviewer, submission, note, now)
  }

  private async approve(
    reviewer: Reviewer,
    submission: Submission,
    note: string,
    now: number,
  ): Promise<DecisionResult> {
    const files = await this.opts.submissions.filesFor(submission.id)
    if (!files) throw new ReviewError('not_found', 'this submission has no bundle')

    // 1. The bytes are the bytes that were read. Cheap, and the difference
    //    between "a human approved this" and "a human approved something".
    const list = [...files].map(([path, bytes]) => ({ path, bytes }))
    const digest = bundleDigest(hashFiles(list))
    if (digest !== submission.bundleDigest) {
      throw new ReviewError(
        'stale',
        'the bundle in the queue no longer matches the digest it was submitted with, so it has not been published',
      )
    }

    // 2. The town as it is now, not as it was at submit time. Someone else may
    //    have defined a conflicting record type in the meantime.
    const townTypes = await this.opts.recordTypes.list(submission.townId)
    const existingTypes = new Map<string, Defines>(
      townTypes.map((t) => [
        t.type,
        { type: t.type, label: t.label, schema: t.schema } as Defines,
      ]),
    )
    const report = validateBundle(list, { hashes: hashFiles(list), existingTypes })
    if (!report.ok) {
      // Not an exception the reviewer has to interpret: the builder gets told
      // what changed underneath them, in the same channel as any other review
      // outcome, and the submission leaves the queue rather than sitting there
      // looking approvable.
      const decided = await this.opts.submissions.decide(submission.id, {
        status: 'changes_requested',
        note:
          'The town changed while this was in the queue, so it no longer validates:\n' +
          report.errors.map((e) => `  ${e.path}: ${e.code} — ${e.message}`).join('\n') +
          (note ? `\n\n${note}` : ''),
        decidedBy: reviewer.userId,
        decidedAt: now,
      })
      return { submission: decided, creation: null, url: null }
    }

    // 3. Resolve or allocate the creation. The origin key comes from the
    //    creation id and is allocated exactly once in its life.
    let creation = submission.creationId ? await this.opts.creations.byId(submission.creationId) : null
    if (submission.creationId && !creation) {
      throw new ReviewError('not_found', 'the creation this updates no longer exists')
    }

    if (!creation) {
      const creationId = randomUUID()
      const slug = await this.allocateSlug(submission.townId, submission.proposedSlug)
      creation = await this.opts.creations.create(
        {
          id: creationId,
          townId: submission.townId,
          ownerId: submission.userId,
          originKey: originKeyFromUuid(creationId),
          slug,
          name: report.manifest.name,
          tagline: report.manifest.tagline,
          description: report.manifest.description,
          tags: report.manifest.tags,
          status: 'active',
        },
        now,
      )
    }

    // 4. Record types this version introduces. First definer wins and owns
    //    nothing, so a type someone else already defined is simply reused.
    const known = new Set(townTypes.map((t) => t.type))
    for (const defined of report.manifest.defines) {
      if (known.has(defined.type)) continue
      await this.opts.recordTypes.define(
        {
          townId: submission.townId,
          type: defined.type,
          label: defined.label,
          schema: defined.schema as Record<string, unknown>,
          definedByCreationId: creation.id,
        },
        now,
      )
    }

    // 5. Publish. The CSP is compiled here and frozen on the version row.
    const versionId = randomUUID()
    const published = this.opts.publisher.publish({
      kind: 'creation',
      key: creation.originKey,
      creationId: creation.id,
      versionId,
      townId: submission.townId,
      manifest: report.manifest,
      entry: report.entry,
      files,
      slug: creation.slug,
      status: creation.status,
    })

    await this.opts.creations.addVersion(
      {
        id: versionId,
        creationId: creation.id,
        version: submission.version,
        manifest: report.manifest,
        cspHeader: published.cspHeader,
        bundleDigest: submission.bundleDigest,
        status: 'approved',
        reviewedBy: reviewer.userId,
        reviewedAt: now,
        reviewNotes: note || null,
        // A submitted version came from a builder, never from a revert.
        revertedFromVersionId: null,
      },
      now,
    )

    // 6. Flip the live pointer last, so a failure anywhere above leaves the
    //    previously approved version serving rather than a half-published one.
    const updated = await this.opts.creations.update(
      creation.id,
      {
        activeVersionId: versionId,
        name: report.manifest.name,
        tagline: report.manifest.tagline,
        description: report.manifest.description,
        tags: report.manifest.tags,
      },
      now,
    )

    const decided = await this.opts.submissions.decide(submission.id, {
      status: 'approved',
      note: note || null,
      decidedBy: reviewer.userId,
      decidedAt: now,
    })

    return { submission: decided, creation: updated, url: published.url }
  }

  /**
   * Find a free slug near the one that was asked for.
   *
   * Suffixing rather than refusing: a reviewer should not have to bounce a
   * submission over a name collision, and the builder finds out what their
   * creation is actually called from the approval rather than from a rejection.
   */
  private async allocateSlug(townId: string, proposed: string): Promise<string> {
    if (!(await this.opts.creations.bySlug(townId, proposed))) return proposed
    for (let n = 2; n <= 50; n++) {
      const candidate = `${proposed}-${n}`
      if (!(await this.opts.creations.bySlug(townId, candidate))) return candidate
    }
    throw new ReviewError('conflict', `no free slug near "${proposed}"`)
  }
}
