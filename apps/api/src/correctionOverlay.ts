import type { RecordStore, TownRecord } from '@townsquare/contributions'
import type { TownSquareItem } from './today.js'

/**
 * Apply only the current, reviewed business record to the public feed.
 * The record store contains published versions; queued proposals live elsewhere.
 * A closure removes the listing from discovery, while saves retain their snapshot.
 */
export function applyApprovedCorrections(
  items: readonly TownSquareItem[],
  records: readonly TownRecord[],
  townId: string,
): TownSquareItem[] {
  const bySource = new Map<string, TownRecord>()
  for (const record of records) {
    if (record.townId !== townId || record.type !== 'business' || record.status !== 'active' || !record.sourceRef) continue
    const previous = bySource.get(record.sourceRef)
    if (!previous || record.updatedAt > previous.updatedAt ||
      (record.updatedAt === previous.updatedAt && record.currentVersion > previous.currentVersion)) bySource.set(record.sourceRef, record)
  }

  return items.flatMap((item): TownSquareItem[] => {
    if (item.type !== 'business') return [item]
    const record = bySource.get(item.id)
    if (!record) return [item]
    const raw: unknown = record.data['fields']
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return [item]
    const fields = raw as Record<string, unknown>
    // The "Closed for good" field represents a reviewed closure statement.
    // Reverting the record to its empty baseline restores the source listing.
    if (typeof fields['closed'] === 'string' && fields['closed'].trim()) return []

    const next = { ...item }
    for (const field of ['name', 'phone', 'hours', 'address'] as const) {
      const value = fields[field]
      if (typeof value !== 'string') continue
      next[field] = value
      if (field === 'name') next.title = value
      // The old geocode no longer describes a corrected address. Directions
      // can still use the address, but a guessed map pin would be misleading.
      if (field === 'address' && value !== item.address) delete next.geo
    }
    // Preserve source updatedAt: review time is not a fresh source scrape.
    return [next]
  })
}

export function withApprovedCorrections(
  loadItems: () => Promise<readonly TownSquareItem[]>,
  records: Pick<RecordStore, 'list'>,
  townId: string,
): () => Promise<readonly TownSquareItem[]> {
  return async () => {
    const [items, published] = await Promise.all([loadItems(), records.list(townId, 'business')])
    return applyApprovedCorrections(items, published, townId)
  }
}
