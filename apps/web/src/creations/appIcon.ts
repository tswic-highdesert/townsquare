/**
 * A creation's icon plate.
 *
 * The icon itself is real: every bundle ships one, the manifest names it, and
 * the sandbox serves it from the creation's own origin. This file is only the
 * fallback — what the plate shows when that file does not load — plus the tint
 * behind it.
 *
 * The fallback is chosen from the creation's declared tags, which are real
 * manifest data. It is never derived from the creation's *name*: initials of a
 * name are the same move as initials of an author, and both draw something
 * that does not exist.
 */

import type { Manifest } from '@townsquare/manifest'
import type { IconName } from '../Icon.js'

/** The four tints the plate uses. One per family of subject, not one per app. */
export type IconTone = 'navy' | 'terracotta' | 'sage' | 'gold'

interface TagLook {
  icon: IconName
  tone: IconTone
}

/**
 * Tags are a shelf, not a taxonomy, so this is a lookup with a default rather
 * than an exhaustive map. A tag nobody has claimed gets the neutral plate,
 * which is the honest answer to "we do not know what this one is about".
 */
const BY_TAG: Record<string, TagLook> = {
  food: { icon: 'utensils', tone: 'terracotta' },
  eating: { icon: 'utensils', tone: 'terracotta' },
  drink: { icon: 'coffee', tone: 'terracotta' },
  map: { icon: 'map', tone: 'navy' },
  maps: { icon: 'map', tone: 'navy' },
  outdoors: { icon: 'tree', tone: 'sage' },
  trails: { icon: 'tree', tone: 'sage' },
  parks: { icon: 'tree', tone: 'sage' },
  water: { icon: 'chart', tone: 'navy' },
  weather: { icon: 'cloud-rain', tone: 'navy' },
  civic: { icon: 'gavel', tone: 'navy' },
  government: { icon: 'building', tone: 'navy' },
  safety: { icon: 'shield', tone: 'terracotta' },
  directory: { icon: 'storefront', tone: 'gold' },
  shops: { icon: 'storefront', tone: 'gold' },
  business: { icon: 'storefront', tone: 'gold' },
  events: { icon: 'calendar', tone: 'gold' },
  music: { icon: 'music', tone: 'gold' },
  sport: { icon: 'sport', tone: 'sage' },
  schools: { icon: 'book', tone: 'navy' },
  library: { icon: 'book', tone: 'navy' },
  transit: { icon: 'bus', tone: 'navy' },
  news: { icon: 'newspaper', tone: 'navy' },
}

const DEFAULT_LOOK: TagLook = { icon: 'puzzle', tone: 'navy' }

export function iconLook(manifest: Manifest): TagLook {
  for (const tag of manifest.tags) {
    const look = BY_TAG[tag]
    if (look) return look
  }
  return DEFAULT_LOOK
}

/** Where the bundle serves its own icon from. */
export function iconUrl(origin: string, manifest: Manifest): string {
  return `${origin}/${manifest.icon}`
}
