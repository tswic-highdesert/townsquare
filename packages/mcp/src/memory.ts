/**
 * Implementations of the ports, for development and for tests.
 *
 * These are genuine, not stubs: the publisher below writes a preview into the
 * same `MemoryBundleStore` the sandbox serves from, with a CSP compiled by the
 * same compiler and frozen the same way. Previewing through here exercises the
 * real publish path, so a bundle that previews locally is a bundle that would
 * have been served identically in production.
 *
 * They move to Postgres behind the same interfaces when the rest of the service
 * does. Nothing above them changes when they do, which is the point of the
 * interfaces existing at all.
 */

import { createHash } from 'node:crypto'
import type { OriginConfig } from '@townsquare/shared'
import { BundleStorePublisher, type MemoryBundleStore } from '@townsquare/sandbox'
import type { Manifest } from '@townsquare/manifest'
import type { Finding } from '@townsquare/bundle'
import { Review, ReviewError, type Submission } from '@townsquare/review'
import { ToolError } from './tools.js'
import type {
  CreationCatalogue,
  CreationDetail,
  CreationSummary,
  Page,
  Publisher,
  PublishedPreview,
  RecordTypeInfo,
  RecordTypeRegistry,
  ReviewQueue,
  TownInfo,
  TownReader,
} from './context.js'

/**
 * How long a preview stays up.
 *
 * A day, because a resident who previews on Saturday and comes back Sunday
 * should find their link alive, and because unreviewed code sitting on an
 * origin forever is unreviewed code sitting on an origin forever.
 */
export const PREVIEW_TTL_MS = 24 * 60 * 60 * 1000

/**
 * Preview keys live in their own namespace and are derived from the draft id.
 *
 * Derived, not random, so re-previewing the same draft replaces it in place
 * rather than littering origins. Hashed, not the id itself, because draft ids
 * are base64url and an origin label may only be `[0-9a-z]`.
 */
export function previewKeyForDraft(draftId: string): string {
  return createHash('sha256').update(draftId).digest('hex').slice(0, 16)
}

export interface SandboxPublisherOptions {
  store: MemoryBundleStore
  origin: OriginConfig
  /** Who may frame a preview. Baked into the frozen CSP, same as production. */
  shellOrigins: string[]
  townId?: string
  now?: () => number
}

/**
 * Preview publishing, over the same writer an approval uses.
 *
 * Deliberately not its own code path. `BundleStorePublisher` compiles the CSP,
 * freezes it on the version row and writes the content-addressed files, for a
 * preview and an approved creation alike. The only differences are the key
 * namespace and the fact that a preview never joins the catalogue.
 */
export class SandboxPublisher implements Publisher {
  private readonly writer: BundleStorePublisher

  constructor(private readonly opts: SandboxPublisherOptions) {
    this.writer = new BundleStorePublisher({
      store: opts.store,
      origin: opts.origin,
      shellOrigins: opts.shellOrigins,
    })
  }

  async publishPreview(input: {
    draftId: string
    manifest: Manifest
    entry: string
    files: ReadonlyMap<string, Uint8Array>
  }): Promise<PublishedPreview> {
    const now = this.opts.now?.() ?? Date.now()
    const key = previewKeyForDraft(input.draftId)

    const published = this.writer.publish({
      kind: 'preview',
      key,
      creationId: input.draftId,
      // A fresh version id per publish, so a browser holding the previous one
      // cannot be served a mix of two builds out of the content-addressed store.
      versionId: `preview-${key}-${now}`,
      townId: this.opts.townId ?? 'russellville-ar',
      manifest: input.manifest,
      entry: input.entry,
      files: input.files,
    })

    return { previewKey: key, url: published.url, expiresAt: now + PREVIEW_TTL_MS }
  }
}

/**
 * The MCP's half of the queue, over the real `Review` service.
 *
 * Narrow on purpose: this adapter can submit and it can read back what the
 * caller submitted. There is no method here that could decide anything, so the
 * builder door is structurally incapable of approving its own work no matter
 * what a tool handler tries to do.
 */
export class ReviewQueueAdapter implements ReviewQueue {
  constructor(private readonly review: Review) {}

  async submit(input: {
    userId: string
    handle: string
    townId: string
    proposedSlug: string
    manifest: Manifest
    entry: string
    files: ReadonlyMap<string, Uint8Array>
    bundleDigest: string
    warnings: readonly Finding[]
  }): Promise<Submission> {
    try {
      return await this.review.submit({
        townId: input.townId,
        userId: input.userId,
        handle: input.handle,
        proposedSlug: input.proposedSlug,
        name: input.manifest.name,
        version: input.manifest.version,
        manifest: input.manifest,
        entry: input.entry,
        bundleDigest: input.bundleDigest,
        files: input.files,
        warnings: input.warnings,
      })
    } catch (err) {
      // A queue rule the builder can act on — a version they already used, a
      // submission already outstanding — reaches them as a sentence rather than
      // as an internal error they cannot do anything about.
      if (err instanceof ReviewError) throw new ToolError(err.message)
      throw err
    }
  }

  async submissionById(id: string): Promise<Submission | null> {
    return this.review.submissionById(id)
  }

  async submissionsForUser(userId: string): Promise<Submission[]> {
    return this.review.submissionsForUser(userId)
  }
}

/**
 * The record-type list, read from the town's real registry.
 *
 * The same rows the reviewer writes on approval, so a type defined by the
 * creation approved this morning is visible to the agent building against it
 * this afternoon. That loop closing is the whole compounding story; a separate
 * list here would quietly break it.
 */
export class RecordTypeStoreRegistry implements RecordTypeRegistry {
  constructor(
    private readonly store: { list(townId: string): Promise<
      Array<{ type: string; schema: Record<string, unknown>; definedByCreationId: string | null; recordCount: number }>
    > },
    private readonly townId: string,
  ) {}

  async list(): Promise<RecordTypeInfo[]> {
    return (await this.store.list(this.townId)).map((row) => ({
      type: row.type,
      schema: row.schema,
      definedBy: row.definedByCreationId ?? 'the town',
      recordCount: row.recordCount,
    }))
  }
}

export class StaticRecordTypeRegistry implements RecordTypeRegistry {
  constructor(private types: RecordTypeInfo[] = []) {}

  async list(): Promise<RecordTypeInfo[]> {
    return this.types.map((t) => ({ ...t }))
  }

  /** Called when a submission is approved, so the next builder can see it. */
  define(type: RecordTypeInfo): void {
    if (!this.types.some((t) => t.type === type.type)) this.types.push(type)
  }
}

export interface StaticTownData {
  info: TownInfo
  items: unknown[]
  businesses: unknown[]
}

/**
 * The read side of the town, served from arrays.
 *
 * Points at the same data the API serves, so what an agent designs against and
 * what the creation reads at runtime are the same records. The filtering is
 * deliberately naive: this surface exists for shaping an app, and a builder who
 * needs a real query writes it in their creation against `town.*`.
 */
export class StaticTownReader implements TownReader {
  constructor(private readonly data: StaticTownData) {}

  async info(): Promise<TownInfo> {
    return { ...this.data.info }
  }

  async items(opts: { type?: string; q?: string; limit?: number }): Promise<Page<unknown>> {
    return { items: filter(this.data.items, opts), nextCursor: null }
  }

  async businesses(opts: { tag?: string; q?: string; limit?: number }): Promise<Page<unknown>> {
    return { items: filter(this.data.businesses, opts), nextCursor: null }
  }
}

function filter(
  rows: unknown[],
  opts: { type?: string; tag?: string; q?: string; limit?: number },
): unknown[] {
  const limit = Math.min(50, opts.limit ?? 20)
  const q = opts.q?.toLowerCase()
  const out: unknown[] = []
  for (const row of rows) {
    const record = row as Record<string, unknown>
    if (opts.type && record['type'] !== opts.type) continue
    if (opts.tag) {
      const haystack = [record['category'], ...((record['tags'] as string[]) ?? [])]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
      if (!haystack.includes(opts.tag.toLowerCase())) continue
    }
    if (q && !JSON.stringify(row).toLowerCase().includes(q)) continue
    out.push(row)
    if (out.length >= limit) break
  }
  return out
}

/**
 * The catalogue, read off the same store the sandbox serves.
 *
 * Source is exposed as text because creations are meant to be forked, and only
 * for text files: a `get_creation_source` that returned base64 PNGs would burn
 * a context window on bytes nobody can read.
 */
export class BundleStoreCatalogue implements CreationCatalogue {
  constructor(
    private readonly store: MemoryBundleStore,
    private readonly authors: ReadonlyMap<string, { userId: string; handle: string }> = new Map(),
  ) {}

  private summary(entry: ReturnType<MemoryBundleStore['list']>[number]): CreationSummary {
    return {
      slug: entry.slug,
      name: entry.name,
      tagline: entry.manifest.tagline ?? null,
      tags: entry.manifest.tags ?? [],
      status: entry.status === 'active' ? 'active' : entry.status,
      author: this.authors.get(entry.slug)?.handle ?? null,
      url: null,
    }
  }

  async list(): Promise<CreationSummary[]> {
    return this.store.list().map((c) => this.summary(c))
  }

  async get(slug: string): Promise<CreationDetail | null> {
    const entry = this.store.get(slug)
    if (!entry) return null
    const files: Array<{ path: string; text: string }> = []
    const decoder = new TextDecoder('utf-8', { fatal: false })
    for (const [path, bytes] of await this.store.filesFor(entry.versionId)) {
      if (!/\.(html|js|mjs|css|json|md|svg|txt)$/i.test(path)) continue
      files.push({ path, text: decoder.decode(bytes) })
    }
    return { ...this.summary(entry), manifest: entry.manifest, files }
  }

  async listForUser(userId: string): Promise<CreationSummary[]> {
    const mine = new Set(
      [...this.authors.entries()].filter(([, a]) => a.userId === userId).map(([slug]) => slug),
    )
    return this.store
      .list()
      .filter((c) => mine.has(c.slug))
      .map((c) => this.summary(c))
  }
}
