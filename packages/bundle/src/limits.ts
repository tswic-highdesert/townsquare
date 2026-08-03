/**
 * What a bundle is allowed to be.
 *
 * These are deliberately small. A creation is one resident's idea, vendored,
 * with no build step: a 2 MB ceiling is generous for that and hostile to
 * everything else. Every limit here also bounds review cost, which is the
 * resource that actually runs out first.
 *
 * The path limits are tighter than the serving normalizer's in
 * `@townsquare/shared/paths`, and that direction is the safe one: anything
 * accepted at publish is guaranteed servable. Loosening them past the
 * normalizer's would let a bundle contain a file nobody can ever fetch.
 */

export const BUNDLE_LIMITS = Object.freeze({
  /** Total uncompressed bytes across every file. */
  totalBytes: 2 * 1024 * 1024,
  /** Files in the bundle, manifest included. */
  fileCount: 200,
  /** Any single file. */
  fileBytes: 1024 * 1024,
  /** The entry document specifically, which a reviewer reads in full. */
  entryBytes: 256 * 1024,
  /** Characters in a normalized path. */
  pathChars: 200,
  /** Slash-separated segments in a normalized path. */
  pathSegments: 8,
})

/**
 * Decompression ceiling for an archived upload.
 *
 * Four times the bundle limit, so a legitimately-compressible bundle still
 * fits while a zip bomb trips the ceiling long before it reaches memory. The
 * caller must enforce this while streaming, not after, or the ceiling is
 * decorative.
 */
export const DECOMPRESSED_CEILING = 8 * 1024 * 1024
