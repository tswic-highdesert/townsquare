import type { TownSquareItem } from './today.js'

export interface FeedHealth {
  id: string
  sourceIds: string[]
  kinds: string[]
  state: 'uninitialized' | 'available' | 'empty' | 'error'
  itemCount: number
  checkedAt: string | null
  lastFetched: string | null
  lastDataAt: string | null
  stale: boolean
}

const matches = (feed: FeedHealth, item: TownSquareItem) =>
  feed.sourceIds.includes(item.source) && feed.kinds.includes(item.type)

/** Keep the last known stories/events when their source produces nothing.
 * Alerts are deliberately excluded: an empty alert feed can mean the warning
 * ended. Existing event/date and notice/expiry filters remain authoritative.
 */
export function retainMissingSources(previous: TownSquareItem[], incoming: TownSquareItem[], health: FeedHealth[]) {
  const next = new Map(incoming.map((item) => [item.id, item]))
  for (const item of previous) {
    if (item.type === 'business' || item.type === 'notice' || next.has(item.id)) continue
    const feeds = health.filter((feed) => matches(feed, item))
    if (feeds.length && feeds.every((feed) => feed.state === 'empty' || feed.state === 'error')) next.set(item.id, item)
  }
  return [...next.values()]
}

export function summarizeContent(items: TownSquareItem[], feeds: FeedHealth[], checkedAt: number, now = Date.now()) {
  const publicLive = items.filter((item) => item.type !== 'business')
  const current = (feed: FeedHealth) => feed.state === 'available' && !feed.stale &&
    feed.lastDataAt !== null && now - Date.parse(feed.lastDataAt) <= 30 * 60_000
  const freshLiveCount = publicLive.filter((item) => feeds.some((feed) => matches(feed, item) && current(feed))).length
  const staleLiveCount = publicLive.length - freshLiveCount
  const lastData = feeds.map((feed) => feed.lastDataAt).filter((date): date is string => date !== null).sort()
  const status = freshLiveCount === 0
    ? (publicLive.length ? 'stale' : 'unavailable')
    : (staleLiveCount || feeds.some((feed) => feed.state !== 'available' || !current(feed)) ? 'partial' : 'fresh')
  return {
    count: items.length,
    checkedAt: checkedAt ? new Date(checkedAt).toISOString() : null,
    checkedAtMeaning: 'Last aggregate refresh attempt; not verification of every source or listing.',
    lastLiveDataAt: lastData.at(-1) ?? null,
    liveCount: publicLive.length,
    staticCount: items.length - publicLive.length,
    freshLiveCount, staleLiveCount, status,
    stale: freshLiveCount === 0 || staleLiveCount > 0,
    sources: feeds.map((feed) => ({ ...feed, stale: feed.stale ||
      (feed.lastDataAt !== null && now - Date.parse(feed.lastDataAt) > 30 * 60_000) })),
    note: 'Available means the adapter returned records. Empty can mean no current content or an upstream failure. Static directory listings are not reverified by refreshes.',
  }
}
