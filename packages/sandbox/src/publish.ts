/**
 * Writing a version into the store the sandbox serves from.
 *
 * One function for both kinds, and that is the point. A preview and an approved
 * creation differ in exactly two things — which key namespace they land in, and
 * whether anyone else can find them — and in nothing else. Same CSP compiler,
 * same freeze, same content-addressed files, same serving path. If preview ran
 * under looser rules it would be a machine for producing creations that pass
 * preview and fail on approval; if it ran under tighter ones, builders would
 * work around it.
 *
 * The CSP is compiled here, once, and stored on the version row. It is never
 * recomputed at request time, because a human approved that exact string and
 * the bundle's own `townsquare.json` is just another file the bundle can edit.
 */

import { compileCsp, creationOrigin, previewOrigin, type OriginConfig } from '@townsquare/shared'
import type { Manifest } from '@townsquare/manifest'
import type { MemoryBundleStore } from './memoryStore.js'

export interface PublishInput {
  kind: 'creation' | 'preview'
  /** The origin key. For a preview, without the `p-` prefix. */
  key: string
  /** Stable across every version, so `localStorage` survives an update. */
  creationId: string
  versionId: string
  townId: string
  manifest: Manifest
  entry: string
  files: ReadonlyMap<string, Uint8Array>
  status?: 'active' | 'hidden' | 'blocked'
  /** Catalogue metadata, only meaningful for a published creation. */
  slug?: string
}

export interface Published {
  key: string
  versionId: string
  url: string
  cspHeader: string
}

export interface PublisherOptions {
  store: MemoryBundleStore
  origin: OriginConfig
  /** Who may frame these. Baked into the frozen CSP at publish time. */
  shellOrigins: string[]
}

export class BundleStorePublisher {
  constructor(private readonly opts: PublisherOptions) {}

  publish(input: PublishInput): Published {
    const cspHeader = compileCsp(input.manifest, { shellOrigins: this.opts.shellOrigins })

    this.opts.store.add(input.kind, input.key, {
      versionId: input.versionId,
      creationId: input.creationId,
      // The stored key carries the prefix a request will actually arrive with,
      // so a preview can never be mistaken for the approved creation it came
      // from — including in a report, a log line, or a storage partition.
      originKey: input.kind === 'preview' ? `p-${input.key}` : input.key,
      entryPath: input.entry,
      cspHeader,
      townId: input.townId,
      creationStatus: input.status ?? 'active',
      files: input.files,
      // Only a published creation joins the catalogue. A preview must never be
      // listable: it is unreviewed code, and the gallery is a claim that a
      // person looked at what is in it.
      ...(input.kind === 'creation'
        ? { manifest: input.manifest, name: input.manifest.name, slug: input.slug ?? '' }
        : {}),
    })

    return {
      key: input.key,
      versionId: input.versionId,
      url:
        input.kind === 'preview'
          ? previewOrigin(input.key, this.opts.origin)
          : creationOrigin(input.key, this.opts.origin),
      cspHeader,
    }
  }

  /**
   * Hide or block a creation that is already live, without republishing it.
   *
   * A status is a decision about an origin, not a new version of it. Going
   * through `publish` to change one would mint a version row that no builder
   * submitted and no reviewer read, and the CSP would be recompiled from a
   * manifest a human already approved a compiled form of.
   */
  setStatus(key: string, status: 'active' | 'hidden' | 'blocked'): void {
    this.opts.store.setStatus(key, status)
  }

  /** The published bytes of one version, for a revert. Null if never published. */
  async filesFor(versionId: string): Promise<ReadonlyMap<string, Uint8Array> | null> {
    if (!this.opts.store.hasVersion(versionId)) return null
    return this.opts.store.filesFor(versionId)
  }
}
