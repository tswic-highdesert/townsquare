/**
 * The read API, as the bridge sees it.
 *
 * The shell is the only party that holds a credential, so every `town.*` call a
 * creation makes is proxied through here rather than made by the creation
 * itself. That is why `connect-src` in a creation's CSP does not include the
 * API: the bridge is the only door, and it is a door we control.
 */

import { BridgeCallError, type TownDataSource } from '@townsquare/host'
import { isErrorCode, wireError } from '@townsquare/shared'

async function get(path: string, params?: Record<string, unknown>): Promise<unknown> {
  const url = new URL(`/api${path}`, window.location.origin)
  for (const [key, value] of Object.entries(params ?? {})) {
    if (value !== undefined && value !== null) url.searchParams.set(key, String(value))
  }
  const res = await fetch(url, { credentials: 'same-origin' })
  if (!res.ok) throw new Error(`api ${res.status}`)
  return res.json()
}

/**
 * One anonymous call to the Tier 1 read API.
 *
 * Town data is open to read, so this carries no cookie and no token. A failure
 * whose body names an SDK error code (`invalid_request` for a bad cursor, most
 * often) is passed to the creation as that code. Anything else is
 * `unavailable`, so an undocumented server string never reaches generated code
 * that branches on it.
 */
async function read(path: string, params?: Record<string, unknown>): Promise<Response> {
  const url = new URL(`/api${path}`, window.location.origin)
  for (const [key, value] of Object.entries(params ?? {})) {
    if (value !== undefined && value !== null) url.searchParams.set(key, String(value))
  }
  return fetch(url, { credentials: 'omit' })
}

async function failure(res: Response): Promise<BridgeCallError> {
  const body = (await res.json().catch(() => null)) as { error?: string; message?: string } | null
  const code = body?.error
  return new BridgeCallError(
    isErrorCode(code)
      ? wireError(code, body?.message ?? 'Town Square refused that request.')
      : wireError('unavailable', 'Town Square could not complete that request.'),
  )
}

/**
 * The data source for one town.
 *
 * `thisWeek` is still empty: the bucket rules it promises are not written
 * down anywhere yet, and guessing at "weekend" in an SDK that never breaks
 * would freeze the guess.
 */
export function createTownData(townId: string): TownDataSource {
  const base = `/v1/towns/${encodeURIComponent(townId)}`

  async function page(path: string, params: unknown): Promise<unknown> {
    const res = await read(path, params as Record<string, unknown> | undefined)
    if (!res.ok) throw await failure(res)
    return res.json()
  }

  return {
    info: () => get('/town'),
    thisWeek: async () => ({ today: [], weekend: [], comingUp: [], notices: [] }),
    items: (params) => page(`${base}/items`, params),
    async item(id) {
      const res = await read(`${base}/items/${encodeURIComponent(id)}`)
      // The SDK promises null for a missing or stale item, not an error.
      if (res.status === 404) return null
      if (!res.ok) throw await failure(res)
      return res.json()
    },
    businesses: (params) => page(`${base}/businesses`, params),
  }
}

export interface CreationSummary {
  slug: string
  name: string
  originKey: string
  tagline: string
  description: string
  tags: string[]
  manifest: import('@townsquare/manifest').Manifest
  origin: string
}

export async function fetchCreations(): Promise<CreationSummary[]> {
  return (await get('/creations')) as CreationSummary[]
}

export async function fetchTown(): Promise<{ id: string; name: string; timezone: string }> {
  return (await get('/town')) as { id: string; name: string; timezone: string }
}
