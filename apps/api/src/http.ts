/**
 * The small amount of HTTP this service needs, written out rather than
 * imported.
 *
 * A framework would bring a cookie parser, a body parser and a session plugin
 * into a process that is one `import` away from the sandbox service, and the
 * whole security argument in DEVELOPING.md rests on those two processes not
 * sharing a dependency that could grow a session. Four functions is a cheaper
 * price than that risk.
 */

import type { IncomingMessage, ServerResponse } from 'node:http'

/** Bodies here are two or three short fields. Anything larger is not ours. */
export const MAX_BODY_BYTES = 8 * 1024

export async function readJson(req: IncomingMessage): Promise<Record<string, unknown> | null> {
  const chunks: Buffer[] = []
  let size = 0

  for await (const chunk of req) {
    const buf = chunk as Buffer
    size += buf.length
    if (size > MAX_BODY_BYTES) return null
    chunks.push(buf)
  }
  if (size === 0) return {}

  try {
    const parsed: unknown = JSON.parse(Buffer.concat(chunks).toString('utf8'))
    return typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null
  } catch {
    return null
  }
}

export function str(body: Record<string, unknown> | null, key: string): string {
  const v = body?.[key]
  return typeof v === 'string' ? v : ''
}

export function readCookie(req: IncomingMessage, name: string): string | null {
  const header = req.headers.cookie
  if (!header) return null
  for (const part of header.split(';')) {
    const eq = part.indexOf('=')
    if (eq === -1) continue
    if (part.slice(0, eq).trim() === name) return decodeURIComponent(part.slice(eq + 1).trim())
  }
  return null
}

export interface CookieOptions {
  name: string
  value: string
  maxAgeSeconds: number
  secure: boolean
}

/**
 * `HttpOnly` is the one attribute that is not negotiable.
 *
 * The session cookie is not readable by JavaScript at all — not by a creation,
 * which cannot see this origin anyway, and not by the shell's own code, which
 * is the part people forget. A bug in the shell that forwards everything it
 * can read still cannot forward this.
 *
 * `__Host-` adds that the cookie is bound to this exact host with no `Domain`,
 * so no sibling subdomain can set or overwrite it. It requires `Secure`, which
 * plain-http development cannot satisfy, so the prefix is dropped there and
 * only there.
 */
export function serializeCookie(opts: CookieOptions): string {
  const parts = [
    `${opts.name}=${encodeURIComponent(opts.value)}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${opts.maxAgeSeconds}`,
  ]
  if (opts.secure) parts.push('Secure')
  return parts.join('; ')
}

export function sendJson(res: ServerResponse, body: unknown, status = 200): void {
  const payload = JSON.stringify(body)
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(payload),
    // An authenticated projection must never land in a shared cache.
    'Cache-Control': 'no-store',
  })
  res.end(payload)
}

/**
 * Reject a state-changing request that did not come from the shell.
 *
 * `SameSite=Lax` already stops the cross-site form POST, and this is the
 * second layer: an `Origin` that is present and wrong is refused outright.
 * A missing `Origin` is allowed through because non-browser callers (curl, the
 * CLI, tests) do not send one and they carry no ambient cookie for an attacker
 * to ride.
 */
export function originAllowed(req: IncomingMessage, shellOrigin: string): boolean {
  const origin = req.headers.origin
  if (!origin) return true
  return origin === shellOrigin
}
