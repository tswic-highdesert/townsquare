/**
 * The read API, as the bridge sees it.
 *
 * The shell is the only party that holds a credential, so every `town.*` call a
 * creation makes is proxied through here rather than made by the creation
 * itself. That is why `connect-src` in a creation's CSP does not include the
 * API: the bridge is the only door, and it is a door we control.
 */

import type { TownDataSource } from '@townsquare/host'

async function get(path: string, params?: Record<string, unknown>): Promise<unknown> {
  const url = new URL(`/api${path}`, window.location.origin)
  for (const [key, value] of Object.entries(params ?? {})) {
    if (value !== undefined && value !== null) url.searchParams.set(key, String(value))
  }
  const res = await fetch(url, { credentials: 'same-origin' })
  if (!res.ok) throw new Error(`api ${res.status}`)
  return res.json()
}

export const townData: TownDataSource = {
  info: () => get('/town'),
  thisWeek: async () => ({ today: [], weekend: [], comingUp: [], notices: [] }),
  items: async () => ({ items: [], nextCursor: null }),
  item: async () => null,
  businesses: (params) => get('/businesses', params as Record<string, unknown>),
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
