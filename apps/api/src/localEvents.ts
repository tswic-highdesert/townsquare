import type { EventItem } from '../../../packages/feed/src/lib/types.js'

/** ATU's athletics feed includes its away schedule across the country. */
export function isLocalEvent(event: EventItem): boolean {
  if (!event.tags.includes('athletics')) return true
  return /Russellville|Dardanelle|Fort Smith|Tucker Coliseum|Baswell Field|Centennial Plaza|Chartwells Women's Sports Complex|Thone Stadium/i.test(event.location)
}

/** Keep the first glance varied without discarding a source's full calendar. */
export function distinctVenues(events: EventItem[], limit: number): EventItem[] {
  const selected: EventItem[] = []
  const seen = new Set<string>()
  for (const event of events) {
    const venue = `${event.location.trim().toLowerCase() || event.id}:${event.startDate}:${event.isAllDay ?? false}`
    if (seen.has(venue)) continue
    seen.add(venue); selected.push(event)
    if (selected.length === limit) return selected
  }
  return selected
}
