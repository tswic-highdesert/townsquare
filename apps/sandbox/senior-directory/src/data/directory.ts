/**
 * The Senior Directory's data, from two sources merged into one list:
 *
 * 1. `senior-resources.json` — the senior-focused subset of the Russellville
 *    Chamber of Commerce member list. Bundled into the creation at build time,
 *    so it is always available, even if the town directory is down.
 * 2. `town.businesses()` — Town Square's built-in business directory. Queried
 *    at runtime with a handful of senior-relevant tags (needs no permission).
 *
 * Both are normalised to `DirectoryEntry`. When the same organisation appears
 * in both, the entries are merged into one, keeping the fields each source has.
 */

import { town, type Business } from '@townsquare/sdk'
import seniorResources from './senior-resources.json'
import { needOf, type NeedId } from './needs.js'
// The chamber list has no websites. These were found by searching the web and
// have not been confirmed with the businesses, so the UI marks them as such.
import assumedWebsites from './assumed-websites.json'

const ASSUMED_WEBSITES = assumedWebsites as Record<string, string>

/** One row of `senior-resources.json`. */
export interface SeniorResource {
  company: string
  industry: string
  memberSince: number
  address: string
  address2: string
  city: string
  state: string
  phone: string
  email: string
}

export type DirectorySource = 'chamber' | 'town'

export interface DirectoryEntry {
  /** Stable key for React lists. */
  id: string
  name: string
  /** Chamber "industry" or the town directory "category". */
  category: string
  address: string
  /** Known for chamber entries; town listings only carry a one-line address. */
  city: string | null
  phone: string | null
  email: string | null
  website: string | null
  /** True when `website` is a guess from `assumed-websites.json`, not from a source. */
  websiteAssumed: boolean
  memberSince: number | null
  geo: { lat: number; lng: number } | null
  /** Which sources this entry came from (both, after a merge). */
  sources: DirectorySource[]
  /** The plain-language group it is listed under. See `./needs.ts`. */
  need: NeedId
}

/**
 * Tags sent to `town.businesses({ tag })`. The API matches each as a
 * case-insensitive substring of a business's tags or category, so these cover
 * e.g. "Senior citizen center", "Home health care service", "Nursing home".
 */
export const SENIOR_BUSINESS_TAGS = [
  'senior',
  'home health',
  'nursing home',
  'assisted living',
  'hospice',
  'rehabilitation',
  'physical therapy',
  'pharmacy',
  'medical supply',
] as const

/** The API's per-request maximum. */
const BUSINESS_LIMIT = 200

export const chamberEntries: DirectoryEntry[] = (seniorResources as SeniorResource[]).map(
  (r, i) => ({
    id: `chamber-${i}-${slug(r.company)}`,
    name: r.company,
    category: r.industry,
    address: [r.address, r.address2, `${r.city}, ${r.state}`].filter(Boolean).join(', '),
    city: r.city || null,
    phone: r.phone || null,
    email: r.email || null,
    website: ASSUMED_WEBSITES[r.company] ?? null,
    websiteAssumed: r.company in ASSUMED_WEBSITES,
    memberSince: r.memberSince ?? null,
    geo: null,
    sources: ['chamber'],
    need: needOf({ name: r.company, category: r.industry }),
  }),
)

function fromBusiness(b: Business): DirectoryEntry {
  return {
    id: `town-${b.id}`,
    name: b.name,
    category: b.category ?? '',
    address: b.address ?? '',
    city: null,
    phone: b.phone ?? null,
    email: null,
    website: b.website ?? null,
    websiteAssumed: false,
    memberSince: null,
    geo: b.geo ?? null,
    sources: ['town'],
    need: needOf({ name: b.name, category: b.category ?? '' }),
  }
}

/**
 * Senior-relevant businesses from the town directory, one request per tag,
 * de-duplicated by id. A tag that fails is skipped rather than failing the
 * whole load; if every tag fails, this throws.
 */
export async function loadTownBusinesses(): Promise<Business[]> {
  const results = await Promise.allSettled(
    SENIOR_BUSINESS_TAGS.map((tag) => town.businesses({ tag, limit: BUSINESS_LIMIT })),
  )
  const byId = new Map<string, Business>()
  let anyOk = false
  for (const r of results) {
    if (r.status !== 'fulfilled') continue
    anyOk = true
    for (const b of r.value.items) byId.set(b.id, b)
  }
  if (!anyOk) {
    const first = results.find((r) => r.status === 'rejected')
    throw first?.status === 'rejected' ? first.reason : new Error('town.businesses failed')
  }
  return [...byId.values()]
}

/** Merge chamber and town entries, joining ones with the same name. */
export function mergeEntries(
  chamber: DirectoryEntry[],
  townBusinesses: Business[],
): DirectoryEntry[] {
  const byKey = new Map<string, DirectoryEntry>()
  for (const e of chamber) byKey.set(slug(e.name), { ...e })

  for (const b of townBusinesses) {
    const t = fromBusiness(b)
    const key = slug(t.name)
    const existing = byKey.get(key)
    if (!existing) {
      byKey.set(key, t)
      continue
    }
    // Same organisation in both: fill gaps from the town directory.
    // A website from the town directory beats one we only assumed.
    if (t.website && (!existing.website || existing.websiteAssumed)) {
      existing.website = t.website
      existing.websiteAssumed = false
    }
    existing.geo ??= t.geo
    existing.phone ??= t.phone
    if (!existing.address) existing.address = t.address
    existing.sources = ['chamber', 'town']
  }

  return [...byKey.values()].sort((a, b) => a.name.localeCompare(b.name))
}

export interface DirectoryResult {
  entries: DirectoryEntry[]
  /** Set when `town.businesses()` could not be reached; chamber data still shows. */
  townError: string | null
}

/** Load both sources and return the merged directory. Never rejects. */
export async function loadDirectory(): Promise<DirectoryResult> {
  try {
    const businesses = await loadTownBusinesses()
    return { entries: mergeEntries(chamberEntries, businesses), townError: null }
  } catch (err) {
    return {
      entries: mergeEntries(chamberEntries, []),
      townError: err instanceof Error ? err.message : String(err),
    }
  }
}

function slug(s: string): string {
  return s
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/\b(inc|llc|co|corp|the)\b\.?/g, '')
    .replace(/[^a-z0-9]+/g, '')
}
