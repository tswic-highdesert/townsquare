/**
 * An in-memory `BundleStore`.
 *
 * Exists so the boundary suite and local development can run a real sandbox
 * with no database. It implements the same interface the Postgres store will,
 * so a test that passes here is testing the actual serving logic rather than a
 * simplified stand-in.
 *
 * It also keeps the catalogue metadata the shell needs for a gallery. That is
 * not part of `BundleStore` on purpose: the serving path must not be able to
 * reach a creation's manifest, because the only manifest the runtime is allowed
 * to trust is the frozen one on the version row.
 */

import { createHash } from 'node:crypto'
import type { Manifest } from '@townsquare/manifest'
import type { BundleStore, ResolvedVersion, StoredFile } from './serve.js'

export interface MemoryVersion extends ResolvedVersion {
  files: ReadonlyMap<string, Uint8Array>
  /** Catalogue metadata. Not reachable from the serving path. */
  manifest?: Manifest
  name?: string
  slug?: string
}

export interface CatalogueEntry {
  originKey: string
  creationId: string
  versionId: string
  townId: string
  name: string
  slug: string
  manifest: Manifest
  status: ResolvedVersion['creationStatus']
}

export class MemoryBundleStore implements BundleStore {
  private readonly byKey = new Map<string, string>()
  private readonly versions = new Map<string, ResolvedVersion>()
  private readonly files = new Map<string, Map<string, StoredFile>>()
  private readonly blobs = new Map<string, Uint8Array>()
  private readonly catalogue = new Map<string, CatalogueEntry>()

  add(kind: 'creation' | 'preview', key: string, version: MemoryVersion): void {
    this.byKey.set(`${kind}:${key}`, version.versionId)
    const { files, manifest, name, slug, ...row } = version
    this.versions.set(version.versionId, row)

    const table = new Map<string, StoredFile>()
    for (const [path, bytes] of files) {
      const sha256 = createHash('sha256').update(bytes).digest('hex')
      this.blobs.set(sha256, bytes)
      table.set(path, { sha256, byteSize: bytes.byteLength })
    }
    this.files.set(version.versionId, table)

    if (manifest && kind === 'creation') {
      this.catalogue.set(key, {
        originKey: version.originKey,
        creationId: version.creationId,
        versionId: version.versionId,
        townId: version.townId,
        name: name ?? manifest.name,
        slug: slug ?? manifest.name.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
        manifest,
        status: version.creationStatus,
      })
    }
  }

  /** Origin keys with a catalogue entry, for the dev server banner. */
  keys(): string[] {
    return [...this.catalogue.keys()]
  }

  list(): CatalogueEntry[] {
    return [...this.catalogue.values()]
  }

  get(slug: string): CatalogueEntry | undefined {
    return this.list().find((c) => c.slug === slug)
  }

  /**
   * A version's files, reassembled from the content-addressed blobs.
   *
   * Catalogue-side, like `list()` and `get()`: it is how the builder tooling
   * shows a resident the source of a creation they want to fork. Deliberately
   * not on `BundleStore` — the serving path must stay unable to ask for
   * anything but one named file of one resolved version.
   */
  async filesFor(versionId: string): Promise<Map<string, Uint8Array>> {
    const out = new Map<string, Uint8Array>()
    for (const [path, file] of this.files.get(versionId) ?? new Map<string, StoredFile>()) {
      const bytes = this.blobs.get(file.sha256)
      if (bytes) out.set(path, bytes)
    }
    return out
  }

  async resolveOrigin(kind: 'creation' | 'preview', key: string): Promise<ResolvedVersion | null> {
    const id = this.byKey.get(`${kind}:${key}`)
    if (id === undefined) return null
    return this.versions.get(id) ?? null
  }

  async getFile(versionId: string, path: string): Promise<StoredFile | null> {
    return this.files.get(versionId)?.get(path) ?? null
  }

  async getBlob(sha256: string): Promise<Uint8Array | null> {
    return this.blobs.get(sha256) ?? null
  }
}
