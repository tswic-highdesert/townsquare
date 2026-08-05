/**
 * What sits in the queue, and what a decision is allowed to touch.
 *
 * A submission carries its own bytes. That is not an optimisation — it is the
 * whole integrity claim. A draft is scratch space its owner can keep editing,
 * so a queue that merely *pointed* at one would let a builder swap the contents
 * between the reviewer reading them and the approval landing. The reviewer
 * approves an exact byte set, pinned by digest, and the pin is checked again at
 * the moment of approval.
 */

import type { Manifest, Permissions } from '@townsquare/manifest'
import type { Finding } from '@townsquare/bundle'

export type SubmissionStatus = 'queued' | 'approved' | 'rejected' | 'changes_requested'

export type Decision = 'approve' | 'reject' | 'request_changes'

export interface Submission {
  id: string
  townId: string
  /** Who submitted it. Attribution, and who gets told the outcome. */
  userId: string
  handle: string

  /**
   * The creation this updates, or null for a first submission.
   *
   * **Updates are reviewed too.** The classic marketplace attack is to publish
   * something innocuous, get approved, build an audience, then push a malicious
   * update. So approval is of one version, never of a person or a creation, and
   * the live version keeps serving until a human approves the next one.
   */
  creationId: string | null

  /** Requested. The platform assigns the final one, and may not agree. */
  proposedSlug: string
  name: string
  /** From the manifest. Every submission needs a new one. */
  version: string
  manifest: Manifest
  entry: string
  bundleDigest: string
  fileCount: number
  byteSize: number

  /** What the validator flagged for a human. The reviewer's starting point. */
  warnings: readonly Finding[]

  status: SubmissionStatus
  /** The reviewer's words, shown to the builder verbatim. */
  note: string | null
  decidedBy: string | null
  submittedAt: number
  decidedAt: number | null
}

/** A published creation, as the review side needs to see it. */
export interface Creation {
  id: string
  townId: string
  ownerId: string
  /** Allocated once, never reused, even after deletion. */
  originKey: string
  slug: string
  name: string
  tagline: string
  description: string
  tags: readonly string[]
  status: 'active' | 'hidden' | 'blocked'
  activeVersionId: string | null
  createdAt: number
  updatedAt: number
}

export interface CreationVersion {
  id: string
  creationId: string
  version: string
  manifest: Manifest
  cspHeader: string
  bundleDigest: string
  status: 'submitted' | 'approved' | 'rejected' | 'superseded'
  reviewedBy: string | null
  reviewedAt: number | null
  reviewNotes: string | null
  /**
   * Set when a moderator reverted to an older version and this row is the copy.
   *
   * Revert is a forward operation. Nothing is deleted, un-approved, or rewound:
   * the old bytes are published again under a new row, and the row says where
   * they came from. Undoing a moderator's call therefore costs one more forward
   * write, which is what makes acting on a report cheap enough to do promptly.
   */
  revertedFromVersionId: string | null
  createdAt: number
}

export interface NewSubmission {
  townId: string
  userId: string
  handle: string
  creationId: string | null
  proposedSlug: string
  name: string
  version: string
  manifest: Manifest
  entry: string
  bundleDigest: string
  files: ReadonlyMap<string, Uint8Array>
  warnings: readonly Finding[]
}

export interface SubmissionStore {
  create(input: NewSubmission, now: number): Promise<Submission>
  byId(id: string): Promise<Submission | null>
  /** The bytes, kept beside the row and immutable once submitted. */
  filesFor(id: string): Promise<ReadonlyMap<string, Uint8Array> | null>
  queued(townId: string): Promise<Submission[]>
  forUser(userId: string): Promise<Submission[]>
  decide(
    id: string,
    patch: { status: SubmissionStatus; note: string | null; decidedBy: string; decidedAt: number },
  ): Promise<Submission>
}

export interface CreationStore {
  byId(id: string): Promise<Creation | null>
  bySlug(townId: string, slug: string): Promise<Creation | null>
  listForOwner(ownerId: string): Promise<Creation[]>
  /** Every creation in a town, hidden and blocked included. Moderator surface. */
  list(townId: string): Promise<Creation[]>
  create(
    input: Omit<Creation, 'createdAt' | 'updatedAt' | 'activeVersionId'>,
    now: number,
  ): Promise<Creation>
  update(id: string, patch: Partial<Creation>, now: number): Promise<Creation>
  addVersion(version: Omit<CreationVersion, 'createdAt'>, now: number): Promise<CreationVersion>
  versionsFor(creationId: string): Promise<CreationVersion[]>
  /** The manifest residents are running right now, for the update diff. */
  activeManifest(creationId: string): Promise<Manifest | null>
}

export interface RecordTypeRow {
  townId: string
  type: string
  label: string
  schema: Record<string, unknown>
  definedByCreationId: string | null
  recordCount: number
}

export interface RecordTypeStore {
  list(townId: string): Promise<RecordTypeRow[]>
  /** First definer wins and owns nothing. Additive evolution only. */
  define(row: Omit<RecordTypeRow, 'recordCount'>, now: number): Promise<void>
}

/** Everything the reviewer needs the sandbox to do. */
export interface CreationPublisher {
  publish(input: {
    kind: 'creation'
    key: string
    creationId: string
    versionId: string
    townId: string
    manifest: Manifest
    entry: string
    files: ReadonlyMap<string, Uint8Array>
    slug?: string
    status?: 'active' | 'hidden' | 'blocked'
  }): { key: string; versionId: string; url: string; cspHeader: string }

  /**
   * Change what the serving path does with a creation, without touching bytes.
   *
   * Hiding and blocking are decisions about an origin, not new versions of it.
   * Republishing to change a status would mint a version row nobody submitted
   * and nobody reviewed, and the first thing anyone would ask about it is which
   * human approved it.
   */
  setStatus(key: string, status: 'active' | 'hidden' | 'blocked'): void

  /**
   * The exact bytes of a version that was already published.
   *
   * This is what a revert republishes. Reading them back from the serving store
   * rather than from a submission means a revert restores what residents were
   * actually running, and the digest on the version row is there to prove it.
   */
  filesFor(versionId: string): Promise<ReadonlyMap<string, Uint8Array> | null>
}

/** Who is deciding. A role, held by a committee, never an owner account. */
export interface Reviewer {
  userId: string
  handle: string
  role: 'user' | 'moderator' | 'admin'
}

export type { Manifest, Permissions, Finding }
