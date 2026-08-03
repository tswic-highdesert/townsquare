/**
 * Per-creation origins.
 *
 * Every creation gets its own subdomain on a domain that is *not* the shell's,
 * so the session cookie is structurally unable to reach it. That is the cookie
 * jar doing the work, not a policy we have to remember to enforce.
 *
 * The key is derived from the creation's UUID and is allocated once and never
 * reused, even after a creation is deleted. If origins were keyed on the slug,
 * renaming a creation and letting someone else take the freed slug would hand
 * them the previous app's `localStorage`.
 */

/** Crockford-style base32 without I, L, O, U, so a key is hard to misread aloud. */
const ALPHABET = '0123456789abcdefghjkmnpqrstvwxyz'

export const ORIGIN_KEY_LENGTH = 12

/**
 * @param uuid a creation id
 * @returns a stable, lowercase, DNS-safe label
 */
export function originKeyFromUuid(uuid: string): string {
  const hex = uuid.replace(/-/g, '').toLowerCase()
  if (!/^[0-9a-f]{32}$/.test(hex)) {
    throw new Error(`not a uuid: ${JSON.stringify(uuid)}`)
  }

  // Fold 128 bits down to 60, taken from both halves so two ids that share a
  // prefix (as time-ordered uuids do) still diverge.
  let acc = 0n
  for (const ch of hex) acc = (acc << 4n) | BigInt(parseInt(ch, 16))

  let out = ''
  let v = acc
  for (let i = 0; i < ORIGIN_KEY_LENGTH; i++) {
    out = ALPHABET[Number(v & 31n)]! + out
    v >>= 5n
  }

  // A label must start with a letter: a leading digit is legal in DNS but trips
  // enough parsers and URL heuristics to be worth avoiding.
  if (/^[0-9]/.test(out)) out = 'a' + out.slice(1)
  return out
}

export interface OriginConfig {
  /** The domain untrusted bundles are served from. Never the shell's domain. */
  appsDomain: string
  /** http in local development, https everywhere else. */
  scheme?: 'http' | 'https'
  /** Set in local development so `*.localhost` works without DNS or certs. */
  port?: number
}

function assertDistinct(cfg: OriginConfig, shellDomain: string): void {
  if (cfg.appsDomain === shellDomain || cfg.appsDomain.endsWith(`.${shellDomain}`)) {
    throw new Error(
      `APPS_DOMAIN (${cfg.appsDomain}) must be a different registrable domain from the shell ` +
        `(${shellDomain}). A subdomain shares a site with the shell, which means it shares a ` +
        `renderer process and is only separated from the session cookie by policy.`,
    )
  }
}

export function creationOrigin(originKey: string, cfg: OriginConfig): string {
  const scheme = cfg.scheme ?? 'https'
  const port = cfg.port ? `:${cfg.port}` : ''
  return `${scheme}://${originKey}.${cfg.appsDomain}${port}`
}

/**
 * Unreviewed code gets its own key namespace, so a preview can never write to
 * the approved version's storage origin.
 */
export function previewOrigin(previewKey: string, cfg: OriginConfig): string {
  return creationOrigin(`p-${previewKey}`, cfg)
}

/**
 * Resolve an inbound `Host` header back to a key.
 *
 * Exact suffix match against the configured domain. Never `endsWith` on a bare
 * string elsewhere in the codebase: `evil-tsq-apps.net` ends with
 * `tsq-apps.net` as a substring but is a different domain entirely.
 */
export function parseHost(
  host: string,
  cfg: OriginConfig,
): { kind: 'creation' | 'preview'; key: string } | null {
  const bare = host.toLowerCase().split(':')[0]!
  const suffix = `.${cfg.appsDomain}`
  if (!bare.endsWith(suffix)) return null

  const label = bare.slice(0, -suffix.length)
  if (label.length === 0 || label.includes('.')) return null

  if (label.startsWith('p-')) {
    const key = label.slice(2)
    return /^[0-9a-z]{8,32}$/.test(key) ? { kind: 'preview', key } : null
  }
  return /^[0-9a-z]{8,32}$/.test(label) ? { kind: 'creation', key: label } : null
}

export { assertDistinct }
