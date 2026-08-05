/**
 * The news payloads, as the shell sees them.
 *
 * Declared here rather than imported from `apps/api`, for the reason
 * `todayData.ts` gives: the shell and the read API are separate services that
 * deploy separately, and a shared type would quietly let a field be renamed on
 * one side of an HTTP boundary. This file is the contract and it is small on
 * purpose.
 */

export type SourceTint = 'navy' | 'sage' | 'gold' | 'terracotta' | 'ink'

/** Reported or opinion. No town source publishes audio, so there is no third. */
export type NewsMedium = 'reported' | 'opinion'

export interface NewsStory {
  id: string
  title: string
  summary: string
  url: string | null
  imageUrl: string | null
  sourceId: string
  sourceName: string
  sourceInitial: string
  sourceTint: SourceTint
  domain: string | null
  byline: string | null
  publishedAt: string
  timeLabel: string
  /** Under an hour old: the one timestamp allowed to go dark and bold. */
  fresh: boolean
  medium: NewsMedium
  topics: string[]
}

export interface NewsCluster {
  id: string
  sourceCount: number
  stories: NewsStory[]
}

export interface NewsTopic {
  id: string
  label: string
  count: number
}

export interface NewsSource {
  id: string
  name: string
  initial: string
  tint: SourceTint
  domain: string | null
  storyCount: number
}

export interface NewsPayload {
  town: { id: string; name: string; timezone: string }
  topic: string | null
  topics: NewsTopic[]
  lead: NewsStory | null
  clusters: NewsCluster[]
  rows: NewsStory[]
  sources: NewsSource[]
  signoff: {
    assembledLabel: string
    sourceCount: number
    storyCount: number
    oldestLabel: string | null
  }
  assembledAt: string
}

export interface ReaderPayload {
  story: NewsStory
  source: NewsSource
  alsoCovering: NewsStory[]
  topics: Array<{ id: string; label: string }>
  assembledAt: string
}

export async function fetchNews(topic: string | null): Promise<NewsPayload> {
  const url = new URL('/api/news', window.location.origin)
  if (topic) url.searchParams.set('topic', topic)
  const res = await fetch(url, { credentials: 'same-origin' })
  if (!res.ok) throw new Error(`news ${res.status}`)
  return (await res.json()) as NewsPayload
}

export async function fetchStory(id: string): Promise<ReaderPayload | null> {
  const res = await fetch(
    new URL(`/api/news/stories/${encodeURIComponent(id)}`, window.location.origin),
    { credentials: 'same-origin' },
  )
  // A story that has aged out of the feed is a normal thing to arrive at from
  // a shared link, not an error worth a red screen.
  if (res.status === 404) return null
  if (!res.ok) throw new Error(`story ${res.status}`)
  return (await res.json()) as ReaderPayload
}

/**
 * How stale a payload has to be before the screen says so.
 *
 * The API serves the last good build when a scrape fails, which is the right
 * trade — this is where somebody checks whether the council meets tonight, and
 * a stale answer beats a blank page. The banner is the only thing standing
 * between a resident and stale news presented as fresh, so the threshold is
 * well inside the one-minute cache: anything over ten minutes old means a
 * build failed, because a healthy one is never more than sixty seconds behind.
 */
export const STALE_AFTER_MS = 10 * 60 * 1000

export function isStale(assembledAt: string, nowMs = Date.now()): boolean {
  const at = Date.parse(assembledAt)
  return Number.isFinite(at) && nowMs - at > STALE_AFTER_MS
}
