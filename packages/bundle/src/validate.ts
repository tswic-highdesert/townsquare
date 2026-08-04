/**
 * Bundle autochecks.
 *
 * The review queue is the scarce resource on this platform, and a queue that
 * fills with things a machine could have caught is a queue that dies. So most
 * rejections must never reach a person, and the ones that do must arrive with
 * the boring parts already settled: paths legal, manifest valid, nothing
 * minified, nothing reaching a host it did not declare.
 *
 * Two severities, and the split is deliberate:
 *
 *   errors   — the bundle cannot be published. Mechanical, no judgement.
 *   warnings — a human must look. Never auto-reject on these; the URL scanner
 *              in particular fires on documentation comments constantly, and a
 *              validator that cries wolf gets routed around.
 */

import { parseManifest, checkDefinesCompatible, type Manifest, type Defines } from '@townsquare/manifest'
import { BUNDLE_LIMITS } from './limits.js'
import { checkBundlePath, extensionOf } from './paths.js'

export interface BundleFile {
  path: string
  bytes: Uint8Array
}

export interface Finding {
  /** Bundle path the finding is about, or `(bundle)` for a whole-bundle one. */
  path: string
  code: string
  message: string
}

export type ValidationReport =
  | { ok: true; manifest: Manifest; entry: string; warnings: Finding[] }
  | { ok: false; errors: Finding[]; warnings: Finding[] }

export interface ValidateOptions {
  /**
   * Record types the town already has, so `defines` can be checked for
   * additive-only evolution. Omit only when validating in isolation, e.g. in
   * the CLI before a town is known.
   */
  existingTypes?: ReadonlyMap<string, Defines>
  /**
   * sha256 hashes of known-good vendored libraries. A match is excluded from
   * the minification heuristics and flagged to the reviewer as "known library,
   * not read line by line". Without this, review cost is dominated by
   * re-reading minified Leaflet, which is precisely how a queue dies.
   */
  knownLibraries?: ReadonlyMap<string, string>
  /** sha256 of each file, when the caller has already computed them. */
  hashes?: ReadonlyMap<string, string>
}

const MANIFEST_PATH = 'townsquare.json'
const TEXT = new TextDecoder('utf-8', { fatal: false })

/** Files whose contents a reviewer is expected to read. */
const SOURCE_EXTENSIONS = new Set(['js', 'mjs', 'html', 'css'])

export function validateBundle(
  files: readonly BundleFile[],
  opts: ValidateOptions = {},
): ValidationReport {
  const errors: Finding[] = []
  const warnings: Finding[] = []
  const err = (path: string, code: string, message: string) => errors.push({ path, code, message })
  const warn = (path: string, code: string, message: string) =>
    warnings.push({ path, code, message })

  // ── shape and limits ──────────────────────────────────────────────────────
  if (files.length === 0) {
    return { ok: false, errors: [{ path: '(bundle)', code: 'empty', message: 'bundle has no files' }], warnings }
  }
  if (files.length > BUNDLE_LIMITS.fileCount) {
    err('(bundle)', 'too_many_files', `${files.length} files, limit is ${BUNDLE_LIMITS.fileCount}`)
  }

  const byPath = new Map<string, BundleFile>()
  let totalBytes = 0

  for (const file of files) {
    const checked = checkBundlePath(file.path)
    if (!checked.ok) {
      err(String(file.path), 'bad_path', checked.reason)
      continue
    }
    // Case-insensitive collision: two files that differ only in case address one
    // origin on a case-insensitive client and two here. Which one wins is not a
    // question worth having an answer to.
    const lower = checked.path.toLowerCase()
    const clash = byPath.get(lower)
    if (clash) {
      err(checked.path, 'duplicate_path', `collides with "${clash.path}"`)
      continue
    }
    byPath.set(lower, file)

    totalBytes += file.bytes.byteLength
    if (file.bytes.byteLength > BUNDLE_LIMITS.fileBytes) {
      err(
        checked.path,
        'file_too_large',
        `${file.bytes.byteLength} bytes, limit is ${BUNDLE_LIMITS.fileBytes}`,
      )
    }
  }

  if (totalBytes > BUNDLE_LIMITS.totalBytes) {
    err('(bundle)', 'bundle_too_large', `${totalBytes} bytes, limit is ${BUNDLE_LIMITS.totalBytes}`)
  }

  const find = (p: string): BundleFile | undefined => byPath.get(p.toLowerCase())

  // ── the manifest ──────────────────────────────────────────────────────────
  const manifestFile = find(MANIFEST_PATH)
  if (!manifestFile) {
    err(MANIFEST_PATH, 'missing_manifest', 'every bundle needs a townsquare.json at its root')
    return { ok: false, errors, warnings }
  }

  let raw: unknown
  try {
    raw = JSON.parse(TEXT.decode(manifestFile.bytes))
  } catch (e) {
    err(MANIFEST_PATH, 'invalid_json', `not valid JSON: ${(e as Error).message}`)
    return { ok: false, errors, warnings }
  }

  // `__proto__` survives JSON.parse as an own property and a later spread or
  // merge can promote it to the prototype. Refuse it anywhere in the tree
  // rather than reasoning about which consumer is safe.
  const polluted = findPrototypeKey(raw)
  if (polluted) {
    err(MANIFEST_PATH, 'prototype_key', `forbidden key at ${polluted}`)
    return { ok: false, errors, warnings }
  }

  const parsed = parseManifest(raw)
  if (!parsed.ok) {
    for (const issue of parsed.issues) {
      err(MANIFEST_PATH, 'invalid_manifest', `${issue.path}: ${issue.message}`)
    }
    return { ok: false, errors, warnings }
  }
  const manifest = parsed.manifest

  // ── declared files must exist ─────────────────────────────────────────────
  const entry = find(manifest.entry)
  if (!entry) {
    err(manifest.entry, 'missing_entry', 'manifest `entry` names a file that is not in the bundle')
  } else {
    if (extensionOf(manifest.entry) !== 'html') {
      err(manifest.entry, 'entry_not_html', 'the entry must be an HTML document')
    }
    if (entry.bytes.byteLength > BUNDLE_LIMITS.entryBytes) {
      err(
        manifest.entry,
        'entry_too_large',
        `${entry.bytes.byteLength} bytes, limit is ${BUNDLE_LIMITS.entryBytes}`,
      )
    }
  }

  const icon = find(manifest.icon)
  if (!icon) {
    err(manifest.icon, 'missing_icon', 'manifest `icon` names a file that is not in the bundle')
  } else {
    const ext = extensionOf(manifest.icon)
    if (!ext || !['png', 'svg', 'webp'].includes(ext)) {
      err(manifest.icon, 'icon_format', 'the icon must be a .png, .svg or .webp')
    } else if (ext === 'png') {
      const size = pngSize(icon.bytes)
      if (!size) {
        err(manifest.icon, 'icon_unreadable', 'not a readable PNG')
      } else if (size.width !== size.height) {
        err(manifest.icon, 'icon_not_square', `${size.width}x${size.height}; the icon must be 1:1`)
      }
    }
  }

  // ── defines: additive-only against what the town already has ──────────────
  if (opts.existingTypes) {
    for (const def of manifest.defines) {
      for (const issue of checkDefinesCompatible(def, opts.existingTypes.get(def.type))) {
        err(MANIFEST_PATH, 'defines_incompatible', `${issue.path}: ${issue.message}`)
      }
    }
  } else if (manifest.defines.length > 0) {
    warn(
      MANIFEST_PATH,
      'defines_unchecked',
      'record types were not checked against the town, because no town was supplied',
    )
  }

  // ── source-level checks ───────────────────────────────────────────────────
  const known = opts.knownLibraries
  const hashes = opts.hashes

  for (const [, file] of byPath) {
    const ext = extensionOf(file.path)
    if (!ext || !SOURCE_EXTENSIONS.has(ext)) continue

    const sha = hashes?.get(file.path)
    const library = sha ? known?.get(sha) : undefined
    if (library) {
      warn(file.path, 'known_library', `${library}; recognized by hash, not read line by line`)
      continue
    }

    const text = TEXT.decode(file.bytes)

    for (const finding of scanSource(file.path, text)) {
      if (finding.severity === 'error') err(file.path, finding.code, finding.message)
      else warn(file.path, finding.code, finding.message)
    }

    for (const host of undeclaredHosts(stripComments(text, ext), manifest)) {
      warn(
        file.path,
        'undeclared_host',
        `references https://${host}, which is not in permissions.network`,
      )
    }
  }

  if (errors.length > 0) return { ok: false, errors, warnings }
  return { ok: true, manifest, entry: manifest.entry, warnings }
}

// ── source heuristics ────────────────────────────────────────────────────────

interface SourceFinding {
  severity: 'error' | 'warning'
  code: string
  message: string
}

/**
 * Minification and obfuscation heuristics.
 *
 * The whole review model rests on a human being able to read what runs, so
 * unreadable code is a publishing error rather than a style preference. These
 * thresholds are tuned to pass hand-written and LLM-written code comfortably
 * and to fail anything that went through a minifier.
 */
export function scanSource(path: string, text: string): SourceFinding[] {
  const out: SourceFinding[] = []
  const ext = extensionOf(path)

  /**
   * Pattern checks run on the source with comments removed.
   *
   * Comments are prose, and prose talks about code. A file carrying
   * `// we deliberately avoid eval() here` is the *opposite* of a problem, and
   * auto-rejecting it would teach builders that explaining themselves is
   * dangerous — which is precisely backwards for a platform whose security
   * model is "a human reads the source".
   *
   * The minification heuristics below deliberately keep using the raw text:
   * whitespace ratio and line length are claims about the actual file, and a
   * minified bundle with its comments stripped is still a minified bundle.
   */
  const code = stripComments(text, ext)

  if (text.length > 2000 && ext !== 'css') {
    const lines = text.split('\n')
    const meanLine = text.length / lines.length
    if (meanLine > 400) {
      out.push({
        severity: 'error',
        code: 'minified',
        message: `mean line length is ${Math.round(meanLine)} characters; source must be readable, not minified`,
      })
    }

    const whitespace = (text.match(/\s/g) ?? []).length / text.length
    if (whitespace < 0.05) {
      out.push({
        severity: 'error',
        code: 'minified',
        message: `only ${(whitespace * 100).toFixed(1)}% whitespace; source must be readable, not minified`,
      })
    }
  }

  if (ext === 'js' || ext === 'mjs' || ext === 'html') {
    // `eval` is already dead at runtime under `script-src 'self'` with no
    // 'unsafe-eval'. Failing here as well means the author finds out at publish
    // rather than a resident finding out as a blank frame.
    for (const [pattern, name] of [
      [/\beval\s*\(/, 'eval()'],
      [/\bnew\s+Function\s*\(/, 'new Function()'],
    ] as const) {
      if (pattern.test(code)) {
        out.push({
          severity: 'error',
          code: 'dynamic_code',
          message: `${name} is blocked by the sandbox CSP and will fail at runtime`,
        })
      }
    }

    // A long string next to a decoder is the shape of a payload hidden from
    // review. It is a warning rather than an error because base64 images and
    // legitimate decoding exist.
    if (/\batob\s*\(/.test(code) && /["'`][A-Za-z0-9+/=]{1024,}["'`]/.test(code)) {
      out.push({
        severity: 'warning',
        code: 'encoded_payload',
        message: 'a large base64 literal is decoded at runtime; read this before approving',
      })
    }

    const escapes = (code.match(/\\x[0-9a-fA-F]{2}|\\u[0-9a-fA-F]{4}/g) ?? []).length
    if (escapes > 100 && escapes * 4 > code.length * 0.1) {
      out.push({
        severity: 'warning',
        code: 'escape_density',
        message: `${escapes} hex or unicode escapes; this is what obfuscated code looks like`,
      })
    }

    // The import map is spliced in at serve time and is what makes the bare
    // `@townsquare/sdk` specifier resolve. A bundle shipping its own would
    // shadow ours and could point the SDK name at code we never reviewed.
    if (/<script[^>]+type\s*=\s*["']?importmap/i.test(code) && /@townsquare\//.test(code)) {
      out.push({
        severity: 'error',
        code: 'own_import_map',
        message: 'bundles must not map @townsquare/* in their own import map',
      })
    }
  }

  // The SDK is served from the guest's own origin and shared as a module
  // singleton. A vendored copy would handshake separately and drift from the
  // host's protocol version on its own schedule.
  if ((ext === 'js' || ext === 'mjs') && /kind:\s*['"]hello['"]/.test(code) && /ts:\s*1/.test(code)) {
    out.push({
      severity: 'error',
      code: 'vendored_sdk',
      message: 'this looks like a vendored copy of the SDK; import it by bare specifier instead',
    })
  }

  return out
}

/**
 * Remove comments so a pattern check reads code, not prose.
 *
 * Deliberately crude: it does not parse, so a `//` inside a string literal
 * costs us the rest of that line. That direction is the safe one — the worst
 * case is a heuristic seeing *less* than it might have, which risks a missed
 * flag that a human reviewer still catches, rather than a false auto-reject
 * that no human ever sees.
 */
export function stripComments(text: string, ext: string | null): string {
  if (ext === 'html') {
    // Both kinds. An HTML file carries inline `<script>`, so its comments are
    // usually JS comments, not `<!-- -->` — which is exactly the case the
    // first version of this missed.
    return stripJsComments(text.replace(/<!--[\s\S]*?-->/g, ' '))
  }
  if (ext === 'js' || ext === 'mjs' || ext === 'css') {
    return stripJsComments(text)
  }
  return text
}

function stripJsComments(text: string): string {
  return (
    text
      .replace(/\/\*[\s\S]*?\*\//g, ' ')
      // The `[^:]` guard is what stops this eating the `//` in `https://`,
      // which would silently truncate every scan at the first link.
      .replace(/(^|[^:])\/\/[^\n]*/g, '$1')
  )
}

const URL_PATTERN = /https?:\/\/([a-z0-9.-]+\.[a-z]{2,})/gi

/** Hosts a file mentions that the manifest never declared. Advisory only. */
export function undeclaredHosts(text: string, manifest: Manifest): string[] {
  const declared = new Set(manifest.permissions.network)
  const found = new Set<string>()
  for (const match of text.matchAll(URL_PATTERN)) {
    const host = match[1]?.toLowerCase()
    if (!host) continue
    if (declared.has(host)) continue
    // Anything under a declared host is covered by the same CSP entry.
    if ([...declared].some((d) => host.endsWith(`.${d}`))) continue
    found.add(host)
  }
  return [...found].sort()
}

// ── small helpers ────────────────────────────────────────────────────────────

const FORBIDDEN_KEYS = new Set(['__proto__', 'constructor', 'prototype'])

function findPrototypeKey(value: unknown, path = '(root)'): string | null {
  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i++) {
      const hit = findPrototypeKey(value[i], `${path}[${i}]`)
      if (hit) return hit
    }
    return null
  }
  if (typeof value !== 'object' || value === null) return null
  for (const key of Object.keys(value)) {
    if (FORBIDDEN_KEYS.has(key)) return `${path}.${key}`
    const hit = findPrototypeKey((value as Record<string, unknown>)[key], `${path}.${key}`)
    if (hit) return hit
  }
  return null
}

const PNG_MAGIC = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]

/** Width and height from a PNG IHDR, which is always the first chunk. */
export function pngSize(bytes: Uint8Array): { width: number; height: number } | null {
  if (bytes.length < 24) return null
  for (let i = 0; i < PNG_MAGIC.length; i++) {
    if (bytes[i] !== PNG_MAGIC[i]) return null
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  if (view.getUint32(12) !== 0x49484452) return null // 'IHDR'
  return { width: view.getUint32(16), height: view.getUint32(20) }
}
