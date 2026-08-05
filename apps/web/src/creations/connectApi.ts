/**
 * The shell's side of `/settings/connect` — where a resident mints the
 * credential their AI tool uses.
 *
 * The mint lives in the API rather than in the MCP service on purpose: minting
 * needs a *session*, and the MCP service has no cookie parser and no
 * session-reading route by design. That keeps the two credentials on opposite
 * sides of a process boundary — a session can create an MCP token, and an MCP
 * token can never create anything that reads a session.
 *
 * The plaintext token comes back from the mint and from nowhere else, ever
 * again. It is returned to the caller and never written to storage here.
 */

import { isError, type ApiError } from '../session.js'

export interface ConnectToken {
  id: string
  label: string
  created_at: string
  expires_at: string
  /** Null when it has never been used. The field that answers "can I kill this one". */
  last_used_at: string | null
  revoked: boolean
}

export interface TokenList {
  tokens: ConnectToken[]
  mcp_url: string
}

export interface MintedToken {
  /** Shown once. The server keeps a one-way hash and genuinely cannot recover it. */
  token: string
  warning: string
  record: ConnectToken
  claude_code_command: string
}

async function call(path: string, init?: RequestInit): Promise<unknown> {
  const res = await fetch(path, {
    credentials: 'same-origin',
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
  })
  const body: unknown = await res.json().catch(() => null)
  if (!res.ok) {
    return (body as ApiError | null) ?? { error: 'unavailable', message: 'Could not reach Town Square.' }
  }
  return body
}

/** Null when signed out: the builder door is behind a session, like the mint. */
export async function fetchTokens(): Promise<TokenList | null> {
  const res = await fetch('/api/connect/tokens', { credentials: 'same-origin' })
  if (res.status === 401) return null
  if (!res.ok) throw new Error(`connect ${res.status}`)
  return (await res.json()) as TokenList
}

export async function mintConnectToken(label: string): Promise<MintedToken | ApiError> {
  return (await call('/api/connect/tokens', {
    method: 'POST',
    body: JSON.stringify({ label }),
  })) as MintedToken | ApiError
}

export async function revokeConnectToken(id: string): Promise<{ revoked: string } | ApiError> {
  return (await call(`/api/connect/tokens/${encodeURIComponent(id)}/revoke`, {
    method: 'POST',
    body: '{}',
  })) as { revoked: string } | ApiError
}

export { isError }

/**
 * "Used 14 minutes ago", or that it never was.
 *
 * Last used is the field that decides whether a token is safe to revoke, so it
 * is stated in the units a person thinks in rather than as a timestamp they
 * have to subtract from today.
 */
export function whenUsed(iso: string | null, now = Date.now()): string {
  if (!iso) return 'Never used'
  const ms = now - Date.parse(iso)
  const minutes = Math.floor(ms / 60_000)
  if (minutes < 1) return 'Used just now'
  if (minutes < 60) return `Used ${minutes} minute${minutes === 1 ? '' : 's'} ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `Used ${hours} hour${hours === 1 ? '' : 's'} ago`
  const days = Math.floor(hours / 24)
  return `Used ${days} day${days === 1 ? '' : 's'} ago`
}
