/**
 * Normalize a request path to a bundle file key.
 *
 * No filesystem is ever involved: the result is an exact lookup key against the
 * bundle's file table. That removes the entire class of traversal bugs where a
 * normalizer and an OS disagree. This function still refuses traversal, because
 * a key that escapes its bundle would be just as wrong as a path that escapes a
 * directory.
 */

const MAX_PATH = 255
const MAX_SEGMENTS = 32

export type NormalizeResult = { ok: true; key: string } | { ok: false; reason: string }

/**
 * Percent-decode once, and refuse anything that is still encoded afterwards.
 *
 * Double encoding is never legitimate here, and accepting it means a filter that
 * inspects the decoded form can be bypassed by encoding twice. `%2e%2e%2f`
 * decodes to `../` only on the second pass, which is exactly the trick.
 */
function decodeOnce(input: string): string | null {
  let decoded: string
  try {
    decoded = decodeURIComponent(input)
  } catch {
    return null
  }
  if (/%[0-9a-fA-F]{2}/.test(decoded)) return null
  return decoded
}

export function normalizeBundlePath(rawPath: string, entry: string): NormalizeResult {
  if (typeof rawPath !== 'string' || rawPath.length === 0) {
    return { ok: false, reason: 'empty path' }
  }
  if (rawPath.length > MAX_PATH * 2) return { ok: false, reason: 'path too long' }

  // Drop query and fragment before anything else; they are not part of the key.
  const withoutQuery = rawPath.split('?')[0]!.split('#')[0]!

  const decoded = decodeOnce(withoutQuery)
  if (decoded === null) return { ok: false, reason: 'malformed or double-encoded escape' }

  // NUL and control characters have no legitimate use in a bundle path and are
  // a classic way to confuse a downstream consumer.
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001F\u007F]/.test(decoded)) {
    return { ok: false, reason: 'control character in path' }
  }
  if (decoded.includes('\\')) return { ok: false, reason: 'backslash is not a separator here' }

  // Unicode normalization, so two spellings of the same name cannot address two
  // different blobs.
  const nfc = decoded.normalize('NFC')

  const segments = nfc.split('/')
  const out: string[] = []
  for (const seg of segments) {
    if (seg === '' || seg === '.') continue
    // Refuse rather than resolve. Resolving `..` would silently accept a path
    // that was trying to escape, and we would rather see it as an error.
    if (seg === '..') return { ok: false, reason: 'path traversal' }
    if (seg.startsWith('.')) return { ok: false, reason: 'dotfiles are not served' }
    out.push(seg)
  }

  if (out.length > MAX_SEGMENTS) return { ok: false, reason: 'path too deep' }

  // A bare directory request serves the declared entry, which is how `/` works.
  if (out.length === 0) {
    return { ok: true, key: entry }
  }

  const key = out.join('/')
  if (key.length > MAX_PATH) return { ok: false, reason: 'path too long' }
  return { ok: true, key }
}

/**
 * Content types are chosen from a closed allowlist keyed on extension, never
 * sniffed from bytes. An unknown extension is a 404 rather than a download.
 */
export const CONTENT_TYPES: Readonly<Record<string, string>> = Object.freeze({
  html: 'text/html; charset=utf-8',
  css: 'text/css; charset=utf-8',
  js: 'text/javascript; charset=utf-8',
  mjs: 'text/javascript; charset=utf-8',
  json: 'application/json; charset=utf-8',
  svg: 'image/svg+xml',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
  gif: 'image/gif',
  avif: 'image/avif',
  ico: 'image/x-icon',
  woff2: 'font/woff2',
  txt: 'text/plain; charset=utf-8',
  csv: 'text/csv; charset=utf-8',
  geojson: 'application/geo+json',
  map: 'application/json; charset=utf-8',
  md: 'text/plain; charset=utf-8',
})

/**
 * `.wasm` is absent on purpose: it needs `wasm-unsafe-eval`, which reopens the
 * fetch-and-execute-remote-code path that `script-src 'self'` exists to close.
 */
export function contentTypeFor(key: string): string | null {
  const dot = key.lastIndexOf('.')
  if (dot < 0) return null
  const ext = key.slice(dot + 1).toLowerCase()
  return CONTENT_TYPES[ext] ?? null
}
