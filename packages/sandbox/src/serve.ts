/**
 * The bundle server, as a pure function.
 *
 * Every request for untrusted code goes through here. It is written as
 * `request in, response out` with no framework and no I/O of its own so that
 * the boundary suite can attack it directly — a traversal test should not have
 * to stand up an HTTP server to prove that `/..%2f` is a 404.
 *
 * Two properties are load-bearing and neither is enforced by convention:
 *
 *   This process knows nothing about sessions. There is no cookie parser, no
 *   auth plugin, and no route that reads a user. A creation's origin is not a
 *   place where a session could be read even by mistake.
 *
 *   The CSP is read off the version row and served verbatim. It is never
 *   recompiled here from the manifest, because a human approved that exact
 *   string, and the bundle's own `townsquare.json` is just another file it can
 *   edit.
 */

import { parseHost, type OriginConfig } from '@townsquare/shared'
import { normalizeBundlePath, contentTypeFor } from '@townsquare/shared'
import { injectEntryHtml } from './inject.js'

export interface ResolvedVersion {
  versionId: string
  creationId: string
  /** Which key resolved here, so cache keys and reports can name it. */
  originKey: string
  /** Relative path of the entry document, from the approved manifest. */
  entryPath: string
  /** The frozen `Content-Security-Policy` value, compiled at approval. */
  cspHeader: string
  townId: string
  /** 'active' serves; anything else gets an explainer page. */
  creationStatus: 'active' | 'hidden' | 'blocked'
}

export interface StoredFile {
  sha256: string
  byteSize: number
}

/**
 * Everything the server needs from storage.
 *
 * Narrow on purpose: a store that cannot express "give me any file" cannot be
 * talked into giving up a file from another version.
 */
export interface BundleStore {
  resolveOrigin(kind: 'creation' | 'preview', key: string): Promise<ResolvedVersion | null>
  getFile(versionId: string, path: string): Promise<StoredFile | null>
  getBlob(sha256: string): Promise<Uint8Array | null>
}

/** Platform files served from the guest's own origin, so `'self'` covers them. */
export interface PlatformAssets {
  /** The guest SDK runtime, verbatim. */
  sdkJs: string
  /** Compiled theme sheet for a town. */
  themeCss(townId: string): string
  /** Bumped when the theme sheet changes, so the URL is cache-busted. */
  themeVersion: number
  sdkMajor: number
  /**
   * Self-hosted typefaces, by bare name (`dm-sans` → the woff2 bytes).
   *
   * Served from the creation's own origin, which is the whole reason
   * `font-src 'self'` is sufficient. The alternative — pointing at Google —
   * would make a typeface into a permission every reviewer has to think about.
   */
  fonts?: ReadonlyMap<string, Uint8Array>
}

export interface SandboxConfig {
  origin: OriginConfig
  store: BundleStore
  assets: PlatformAssets
}

export interface SandboxRequest {
  method: string
  /** Raw `Host` header. */
  host: string
  /** Raw request target, query string included. */
  url: string
}

export interface SandboxResponse {
  status: number
  headers: Record<string, string>
  body: Uint8Array | null
}

const encoder = new TextEncoder()

/** Applied to every response this server produces, including its errors. */
const BASE_HEADERS: Readonly<Record<string, string>> = Object.freeze({
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'Cross-Origin-Resource-Policy': 'cross-origin',
  'Permissions-Policy':
    'geolocation=(), camera=(), microphone=(), payment=(), usb=(), display-capture=(), midi=(), serial=(), hid=()',
  Vary: 'Host',
})

const IMMUTABLE = 'public, max-age=31536000, immutable'

export async function serveBundleRequest(
  req: SandboxRequest,
  cfg: SandboxConfig,
): Promise<SandboxResponse> {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    return text(405, 'Method not allowed', { Allow: 'GET, HEAD' })
  }

  // 421 rather than 404: a request that arrived with the wrong Host reached the
  // wrong service, and saying so keeps a misrouted deploy from looking like a
  // missing file.
  //
  // The body names the service and the Host it rejected, because the status
  // alone is not enough to act on. "Misdirected request" on a port you
  // believed was the API reads as an outage, and it has cost two people time:
  // the sandbox and the read API sit on adjacent ports, so the usual way to
  // see this is to have reached the sandbox by mistake.
  const parsed = parseHost(req.host, cfg.origin)
  if (!parsed) {
    return text(
      421,
      `This is the creation sandbox, and it only answers for *.${cfg.origin.appsDomain}. ` +
        `It received Host "${req.host}", which is not one of those, so nothing was served. ` +
        `If you were looking for the read API, it is a different service on a different port.`,
    )
  }

  const resolved = await cfg.store.resolveOrigin(parsed.kind, parsed.key)
  if (!resolved) return text(404, 'No creation is served from this address.')

  if (resolved.creationStatus !== 'active') {
    // Plain, styled by nothing, and explicit. A blocked creation showing a
    // blank frame reads as our bug rather than our decision.
    //
    // Neither branch names the builder. `hidden` used to say "by its owner",
    // which was not true: `Moderation.act` requires a moderator for hide, block
    // and restore, and no owner-facing hide route exists. So the town was told
    // a resident pulled their own work when a committee had taken it down —
    // publicly assigning a decision to the person least able to correct it.
    // The blocked branch already said who acted, for the reason above; the
    // argument applies to both.
    return html(
      410,
      resolved.cspHeader,
      resolved.creationStatus === 'blocked'
        ? 'This creation was blocked by a moderator and is no longer available.'
        : 'This creation has been hidden by a moderator and is not available right now.',
    )
  }

  const path = req.url.split('?')[0]!.split('#')[0]!

  // Platform assets are served from the creation's own origin so that
  // `script-src 'self'` and `style-src 'self'` cover them with no per-creation
  // exception and nothing to declare in a manifest.
  if (path.startsWith('/_ts/')) {
    const asset = servePlatformAsset(path, resolved, cfg)
    return asset.body ? { ...asset, body: bodyFor(req, asset.body) } : asset
  }

  const normalized = normalizeBundlePath(path, resolved.entryPath)
  if (!normalized.ok) return text(404, 'Not found')

  const contentType = contentTypeFor(normalized.key)
  // No `application/octet-stream` fallback. An extension we do not have a type
  // for is a file we are not willing to serve, because the alternative is
  // letting the browser guess.
  if (!contentType) return text(404, 'Not found')

  const file = await cfg.store.getFile(resolved.versionId, normalized.key)
  if (!file) return text(404, 'Not found')

  const blob = await cfg.store.getBlob(file.sha256)
  if (!blob) return text(404, 'Not found')

  const isEntry = normalized.key === resolved.entryPath

  const headers: Record<string, string> = {
    ...BASE_HEADERS,
    'Content-Security-Policy': resolved.cspHeader,
    'Content-Type': contentType,
    ETag: `"${file.sha256}"`,
    // The entry is rewritten per request with the current theme and SDK, so it
    // must revalidate. Everything else is addressed by content and can be
    // cached forever.
    'Cache-Control': isEntry ? 'no-cache' : IMMUTABLE,
  }

  if (!isEntry) {
    return { status: 200, headers: withLength(headers, blob), body: bodyFor(req, blob) }
  }

  const injected = injectEntryHtml(new TextDecoder('utf-8').decode(blob), {
    themeHref: themeHref(resolved.townId, cfg.assets),
    sdkMajor: cfg.assets.sdkMajor,
  })
  const bytes = encoder.encode(injected)
  // The served entry no longer matches the stored blob, so the blob's hash is
  // the wrong validator for it.
  delete headers['ETag']
  return { status: 200, headers: withLength(headers, bytes), body: bodyFor(req, bytes) }
}

function themeHref(townId: string, assets: PlatformAssets): string {
  return `/_ts/theme/${encodeURIComponent(townId)}-${assets.themeVersion}.css`
}

const BOOT_JS =
  '// Starts the Town Square handshake even for a creation that never imports\n' +
  '// the SDK, so theming and auto-height work regardless. Same URL the bare\n' +
  "// specifier resolves to, so there is one module instance, not two.\nimport './sdk.js'\n"

function servePlatformAsset(
  path: string,
  resolved: ResolvedVersion,
  cfg: SandboxConfig,
): SandboxResponse {
  const { assets } = cfg
  const base = `/_ts/sdk/${assets.sdkMajor}/`

  const common: Record<string, string> = {
    ...BASE_HEADERS,
    'Content-Security-Policy': resolved.cspHeader,
    'Cache-Control': IMMUTABLE,
  }

  if (path === `${base}sdk.js`) {
    const bytes = encoder.encode(assets.sdkJs)
    return {
      status: 200,
      headers: withLength({ ...common, 'Content-Type': 'text/javascript; charset=utf-8' }, bytes),
      body: bytes,
    }
  }

  if (path === `${base}boot.js`) {
    const bytes = encoder.encode(BOOT_JS)
    return {
      status: 200,
      headers: withLength({ ...common, 'Content-Type': 'text/javascript; charset=utf-8' }, bytes),
      body: bytes,
    }
  }

  // `/_ts/fonts/<name>.woff2`. Bare names only: the lookup is an exact hit
  // against a map we built, so there is no path here to traverse.
  if (path.startsWith('/_ts/fonts/') && path.endsWith('.woff2')) {
    const name = path.slice('/_ts/fonts/'.length, -'.woff2'.length)
    const bytes = /^[a-z0-9-]{1,40}$/.test(name) ? assets.fonts?.get(name) : undefined
    if (!bytes) return text(404, 'Not found')
    return {
      status: 200,
      headers: withLength(
        {
          ...common,
          'Content-Type': 'font/woff2',
          // Fonts are versioned by their own filename and never change in
          // place, so they can be cached as long as anything here.
          'Cache-Control': IMMUTABLE,
        },
        bytes,
      ),
      body: bytes,
    }
  }

  // `/_ts/theme/<townId>-<version>.css`. The town is taken from the resolved
  // creation, never from the URL: the version suffix is a cache buster, and a
  // creation must not be able to request another town's theme by editing a
  // link. A stale suffix serves current tokens rather than 404ing, so a cached
  // entry document never loses its styling.
  if (path.startsWith('/_ts/theme/') && path.endsWith('.css')) {
    const bytes = encoder.encode(assets.themeCss(resolved.townId))
    return {
      status: 200,
      headers: withLength(
        { ...common, 'Content-Type': 'text/css; charset=utf-8', 'Cache-Control': 'public, max-age=3600' },
        bytes,
      ),
      body: bytes,
    }
  }

  return text(404, 'Not found')
}

// ── response helpers ─────────────────────────────────────────────────────────

function withLength(headers: Record<string, string>, body: Uint8Array): Record<string, string> {
  return { ...headers, 'Content-Length': String(body.byteLength) }
}

function bodyFor(req: SandboxRequest, body: Uint8Array): Uint8Array | null {
  return req.method === 'HEAD' ? null : body
}

function text(
  status: number,
  message: string,
  extra: Record<string, string> = {},
): SandboxResponse {
  const body = encoder.encode(message + '\n')
  return {
    status,
    headers: withLength(
      {
        ...BASE_HEADERS,
        ...extra,
        'Content-Type': 'text/plain; charset=utf-8',
        'Cache-Control': 'no-store',
        // Even an error page from this origin gets a policy that cannot fetch,
        // frame or post anywhere.
        'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'",
      },
      body,
    ),
    body,
  }
}

function html(status: number, csp: string, message: string): SandboxResponse {
  const body = encoder.encode(
    `<!doctype html><meta charset="utf-8"><title>Town Square</title>` +
      `<style>body{font:16px/1.5 system-ui;margin:0;display:grid;place-items:center;height:100vh;color:#2C3E50;background:#FAF8F5}</style>` +
      `<p>${escapeHtml(message)}</p>`,
  )
  return {
    status,
    headers: withLength(
      {
        ...BASE_HEADERS,
        'Content-Security-Policy': csp,
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'no-store',
      },
      body,
    ),
    body,
  }
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => {
    switch (c) {
      case '&':
        return '&amp;'
      case '<':
        return '&lt;'
      case '>':
        return '&gt;'
      case '"':
        return '&quot;'
      default:
        return '&#39;'
    }
  })
}
