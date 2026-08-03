/**
 * Content addressing.
 *
 * Every file is stored under the sha256 of its bytes, so the fiftieth creation
 * that vendors the same map library costs nothing and the reviewer's diff can
 * skip anything it has already seen. The bundle digest is over the *canonical
 * tree* rather than an archive, so two uploads with identical contents produce
 * the same digest regardless of compression, ordering, or archive metadata.
 */

import { createHash } from 'node:crypto'
import type { BundleFile } from './validate.js'

export function sha256(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex')
}

export function hashFiles(files: readonly BundleFile[]): Map<string, string> {
  const out = new Map<string, string>()
  for (const file of files) out.set(file.path, sha256(file.bytes))
  return out
}

/**
 * A digest over path/hash pairs, sorted, with a length prefix on each path.
 *
 * The length prefix is what stops two different trees hashing the same. Without
 * it, `{"ab/c": X}` and `{"a": Y}` with the right contents can produce an
 * identical byte stream, and a digest that can be made to collide by naming a
 * file cleverly is not a digest.
 */
export function bundleDigest(hashes: ReadonlyMap<string, string>): string {
  const hash = createHash('sha256')
  for (const path of [...hashes.keys()].sort()) {
    hash.update(`${path.length}:${path}:${hashes.get(path)}\n`)
  }
  return hash.digest('hex')
}
