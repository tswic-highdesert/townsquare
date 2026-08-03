/**
 * Path rules for files *inside* a bundle.
 *
 * Distinct from `@townsquare/shared/paths`, which normalizes an inbound request
 * path. This one runs at publish, on a name the uploader chose, and it refuses
 * rather than repairs: a bundle whose paths need repairing is a bundle whose
 * author does not know what they shipped, and a reviewer reading the file list
 * should see the same strings the server will serve.
 */

import { BUNDLE_LIMITS } from './limits.js'

export type PathCheck = { ok: true; path: string } | { ok: false; reason: string }

/** Extensions a bundle may contain, matching what the sandbox will serve. */
export const ALLOWED_EXTENSIONS: ReadonlySet<string> = new Set([
  'html',
  'css',
  'js',
  'mjs',
  'json',
  'svg',
  'png',
  'jpg',
  'jpeg',
  'webp',
  'gif',
  'avif',
  'ico',
  'woff2',
  'txt',
  'csv',
  'geojson',
  'map',
  'md',
])

const CONTROL_CHARS = /[\u0000-\u001F\u007F]/

export function extensionOf(path: string): string | null {
  const slash = path.lastIndexOf('/')
  const name = slash < 0 ? path : path.slice(slash + 1)
  const dot = name.lastIndexOf('.')
  if (dot <= 0) return null
  return name.slice(dot + 1).toLowerCase()
}

export function checkBundlePath(raw: unknown): PathCheck {
  if (typeof raw !== 'string' || raw.length === 0) return { ok: false, reason: 'empty path' }
  if (raw.length > BUNDLE_LIMITS.pathChars) {
    return { ok: false, reason: `longer than ${BUNDLE_LIMITS.pathChars} characters` }
  }
  if (raw.startsWith('/')) return { ok: false, reason: 'must be relative, not absolute' }
  if (raw.includes('\\')) return { ok: false, reason: 'must use POSIX separators' }
  if (CONTROL_CHARS.test(raw)) return { ok: false, reason: 'control character in path' }
  if (/%[0-9a-fA-F]{2}/.test(raw)) return { ok: false, reason: 'must not be percent-encoded' }

  // Two spellings of the same name must not address two different blobs.
  if (raw.normalize('NFC') !== raw) return { ok: false, reason: 'must be Unicode NFC' }

  const segments = raw.split('/')
  if (segments.length > BUNDLE_LIMITS.pathSegments) {
    return { ok: false, reason: `deeper than ${BUNDLE_LIMITS.pathSegments} segments` }
  }
  for (const seg of segments) {
    if (seg === '') return { ok: false, reason: 'empty path segment' }
    if (seg === '.' || seg === '..') return { ok: false, reason: 'relative path segment' }
    if (seg.startsWith('.')) return { ok: false, reason: 'dotfiles are not served' }
  }

  const ext = extensionOf(raw)
  if (ext === null) return { ok: false, reason: 'file has no extension' }
  if (!ALLOWED_EXTENSIONS.has(ext)) {
    return { ok: false, reason: `.${ext} is not a servable file type` }
  }

  return { ok: true, path: raw }
}
