/**
 * What the tools need from the rest of the platform.
 *
 * Ports, not implementations. The tool layer is the part of this service worth
 * testing hard — a tool that lets one resident read another's draft is a bug
 * you want caught by a fast unit test, not by a Postgres integration suite —
 * and it can only be tested hard if it never reaches for a database itself.
 *
 * Every interface here is narrow on purpose. `TownReader` cannot express "run
 * this query", `CreationCatalogue` cannot express "give me any user's drafts",
 * and `ReviewQueue` cannot express "approve". A tool cannot misuse a capability
 * that its context does not carry.
 */

import type { Manifest } from '@townsquare/manifest'
import type { IdentityStore } from '@townsquare/identity'
import type { Finding } from '@townsquare/bundle'
import type { Submission } from '@townsquare/review'
import type { McpTokenStore } from './tokens.js'
import type { DraftStore } from './drafts.js'

/**
 * The authenticated caller.
 *
 * Resolved once per request, before any tool runs, and passed down. A tool
 * never re-reads the `Authorization` header, so there is exactly one place
 * where a credential becomes an identity.
 */
export interface Principal {
  userId: string
  handle: string
  /** A verified resident. False is the common case and is not an error. */
  verified: boolean
  role: 'user' | 'moderator' | 'admin'
  /** Which credential was used, for the audit line. Never the secret. */
  tokenId: string
}

export interface TownInfo {
  id: string
  name: string
  timezone: string
}

export interface Page<T> {
  items: T[]
  nextCursor?: string | null
}

/**
 * Read-only town data, matching what `town.*` exposes to a running creation.
 *
 * The MCP serves the same data the SDK will, so an agent designing an app sees
 * the real shape of the records it will get at runtime rather than an invented
 * example. That is the difference between a generated app that works on first
 * run and one that works after three rounds of "actually the field is called
 * `geo` not `location`".
 */
export interface TownReader {
  info(): Promise<TownInfo>
  items(opts: {
    type?: 'event' | 'notice' | 'story'
    q?: string
    limit?: number
    cursor?: string
  }): Promise<Page<unknown>>
  businesses(opts: { tag?: string; q?: string; limit?: number; cursor?: string }): Promise<Page<unknown>>
}

export interface CreationSummary {
  slug: string
  name: string
  tagline: string | null
  tags: readonly string[]
  status: 'draft' | 'in_review' | 'active' | 'hidden' | 'blocked' | 'rejected'
  author: string | null
  url: string | null
}

export interface CreationDetail extends CreationSummary {
  manifest: Manifest
  /** Source files, as text. Only for creations whose source is public. */
  files: ReadonlyArray<{ path: string; text: string }>
}

export interface CreationCatalogue {
  list(): Promise<CreationSummary[]>
  get(slug: string): Promise<CreationDetail | null>
  listForUser(userId: string): Promise<CreationSummary[]>
}

/**
 * A record type someone already defined.
 *
 * This is the compounding mechanism and the reason `list_record_types` is a
 * tool rather than a docs paragraph. If `flock_camera` already exists, the
 * right move is to read it, not to define `flock_cameras` beside it and split
 * the town's data in half forever. An agent cannot make that choice if it
 * cannot see the list.
 */
export interface RecordTypeInfo {
  type: string
  schema: unknown
  /** The creation that first defined it. First definer wins, and owns nothing. */
  definedBy: string
  recordCount: number
}

export interface RecordTypeRegistry {
  list(): Promise<RecordTypeInfo[]>
}

export interface PublishedPreview {
  previewKey: string
  url: string
  expiresAt: number
}

/**
 * Publishing a draft to a real preview origin.
 *
 * Real, not simulated: the same serving path, the same compiled CSP, the same
 * sandboxed iframe. A preview that ran under looser rules than production would
 * be a machine for producing creations that pass preview and fail on approval.
 */
export interface Publisher {
  publishPreview(input: {
    draftId: string
    manifest: Manifest
    entry: string
    files: ReadonlyMap<string, Uint8Array>
  }): Promise<PublishedPreview>
}

/**
 * The queue, as this service needs it.
 *
 * The model lives in `@townsquare/review` rather than here, because there is
 * one queue and two doors onto it: a builder submits through the MCP and a
 * reviewer decides through the API. Two definitions of a submission would be
 * two queues that agree until the day they do not.
 */
export interface ReviewQueue {
  submit(input: {
    userId: string
    handle: string
    townId: string
    proposedSlug: string
    manifest: Manifest
    entry: string
    files: ReadonlyMap<string, Uint8Array>
    bundleDigest: string
    warnings: readonly Finding[]
  }): Promise<Submission>
  submissionById(id: string): Promise<Submission | null>
  submissionsForUser(userId: string): Promise<Submission[]>
}

export interface McpContext {
  /** Injected so tests can pin time rather than sleep. */
  now(): number
  tokens: McpTokenStore
  /** Only the read this service is allowed to do. */
  users: Pick<IdentityStore, 'userById'>
  drafts: DraftStore
  town: TownReader
  creations: CreationCatalogue
  recordTypes: RecordTypeRegistry
  publisher: Publisher
  review: ReviewQueue
  /** Which town this service builds for. */
  townId: string
  /** Public base URL of this service, so upload tickets are followable. */
  publicUrl: string
  /** Where a resident manages their account, for pointing them at things. */
  shellOrigin: string
}
