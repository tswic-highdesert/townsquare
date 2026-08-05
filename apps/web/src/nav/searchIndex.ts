/**
 * One field over four kinds of thing, and the ranking behind it.
 *
 * `design/hifi-v2` section 02, specimen 10. A resident looking for Riverfest
 * has no idea whether the town filed it as a story, an event or a place, so
 * there is one field and the grouping does the work a filter row would
 * otherwise be asked to do — without making anyone choose first.
 *
 * ## Why this runs on the device
 *
 * The same reason `nearbyData.ts` ranks on the device: there is no search
 * service, and building one would mean every query a resident types arriving
 * on our server attached to their session cookie. What somebody searched for
 * is a more intimate record than where they were standing. The shell already
 * holds the whole town — Today's payload, Nearby's 741 listings, the creation
 * list — so the index is assembled from what is on the client already and
 * nothing leaves the origin.
 *
 * That makes this the business logic of the screen rather than a detail of a
 * component, which is why it is pure and tested here rather than living inside
 * an input's `onChange`.
 *
 * ## What is deliberately not searchable
 *
 * **People.** The hi-fi has a People group matching on handle. There is no
 * endpoint that lists residents and there should not be one: a field that
 * turns a half-remembered name into a profile is a lookup tool for finding a
 * neighbour, and this town holds no address precisely so that it cannot become
 * that. The group is absent, not empty.
 */

import type { CreationSummary } from '../townData.js'
import type { NearbyPayload } from '../nearbyData.js'
import type { TodayPayload } from '../todayData.js'

export type SearchKind = 'story' | 'event' | 'place' | 'creation'

export interface SearchDoc {
  kind: SearchKind
  /** Unique within a kind. Used to dedupe Today's directory against Nearby's. */
  id: string
  title: string
  detail: string
  /** Somewhere outside town, or null when the source published no link. */
  href: string | null
  /** Set on creations only: the one kind the shell can navigate to itself. */
  slug?: string
}

export interface SearchGroup {
  kind: SearchKind
  label: string
  /** Capped at `PER_GROUP` unless the group was expanded. */
  hits: SearchDoc[]
  /** Everything that matched, so "show all 14" can say fourteen. */
  total: number
}

/**
 * Three rows a group, and a way to see the rest.
 *
 * The overlay is for recognising the thing you already had in mind, not for
 * exhausting the index. Four groups at three rows still fits on a phone
 * without the last group falling off the bottom unseen.
 */
export const PER_GROUP = 3

const LABELS: Record<SearchKind, string> = {
  story: 'Stories',
  event: 'Events',
  place: 'Places',
  creation: 'Creations',
}

/**
 * The order groups fall back to when they score identically.
 *
 * Only a tiebreak. Groups sort by how well their best hit matched, so
 * searching "Riverfest" in July puts Events first and the same word in
 * November puts Stories first — the resident's word decides, not a hierarchy
 * we picked once.
 */
const FALLBACK_ORDER: SearchKind[] = ['story', 'event', 'place', 'creation']

/** Lowercase, and every run of non-alphanumerics becomes one space. */
function normalise(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
}

export function terms(query: string): string[] {
  return normalise(query).split(' ').filter(Boolean)
}

/**
 * How well one term matches one field.
 *
 * A word-start match is worth roughly twice a match buried mid-word, because
 * "old" should find Old South Restaurant well before it finds Goldfinch
 * Antiques. Everything is relative within this function; the absolute numbers
 * mean nothing on their own.
 */
function fieldScore(term: string, field: string): number {
  if (!field) return 0
  const at = field.indexOf(term)
  if (at < 0) return 0
  if (at === 0) return field.length === term.length ? 8 : 6
  return field[at - 1] === ' ' ? 4 : 2
}

/**
 * A document's score, or 0 if it is not a match at all.
 *
 * Every term has to land somewhere. "old south" must not match a story about
 * the south side of a road that never says old: a resident typing two words is
 * narrowing, and an OR would widen instead, which is the opposite of what they
 * asked for.
 */
export function scoreDoc(doc: SearchDoc, queryTerms: string[]): number {
  if (queryTerms.length === 0) return 0
  const title = normalise(doc.title)
  const detail = normalise(doc.detail)
  let total = 0
  for (const term of queryTerms) {
    const inTitle = fieldScore(term, title)
    // Detail is worth a quarter of title. It is there so that searching a
    // street or a source still finds the thing, not so that it competes.
    const inDetail = fieldScore(term, detail) * 0.25
    const best = Math.max(inTitle, inDetail)
    if (best === 0) return 0
    total += best
  }
  return total
}

/**
 * Group, rank, and cap.
 *
 * `expanded` names the one group a resident asked to see all of. One at a
 * time, because expanding every group turns the overlay back into the ranked
 * list the grouping exists to avoid.
 */
export function searchTown(
  docs: readonly SearchDoc[],
  query: string,
  expanded?: SearchKind | null,
): SearchGroup[] {
  const queryTerms = terms(query)
  if (queryTerms.length === 0) return []

  const scored = new Map<SearchKind, Array<{ doc: SearchDoc; score: number }>>()
  for (const doc of docs) {
    const score = scoreDoc(doc, queryTerms)
    if (score === 0) continue
    const bucket = scored.get(doc.kind)
    if (bucket) bucket.push({ doc, score })
    else scored.set(doc.kind, [{ doc, score }])
  }

  const groups: SearchGroup[] = []
  for (const [kind, bucket] of scored) {
    bucket.sort((a, b) => b.score - a.score || a.doc.title.localeCompare(b.doc.title))
    const all = bucket.map((entry) => entry.doc)
    groups.push({
      kind,
      label: LABELS[kind],
      hits: expanded === kind ? all : all.slice(0, PER_GROUP),
      total: all.length,
    })
  }

  groups.sort((a, b) => {
    const bestA = scored.get(a.kind)?.[0]?.score ?? 0
    const bestB = scored.get(b.kind)?.[0]?.score ?? 0
    if (bestB !== bestA) return bestB - bestA
    return FALLBACK_ORDER.indexOf(a.kind) - FALLBACK_ORDER.indexOf(b.kind)
  })

  return groups
}

/* ── building the index out of payloads the shell already holds ──────────── */

export function docsFromToday(today: TodayPayload): SearchDoc[] {
  const docs: SearchDoc[] = []

  for (const story of today.lead ? [today.lead, ...today.more] : today.more) {
    docs.push({
      kind: 'story',
      id: story.id,
      title: story.title,
      // The source and the summary both, because "courier" and a half-recalled
      // phrase from the first paragraph are both ways people look for a story.
      detail: `${story.source} · ${story.timeLabel}${story.summary ? ` · ${story.summary}` : ''}`,
      href: story.url,
    })
  }

  for (const event of today.events.items) {
    docs.push({
      kind: 'event',
      id: event.id,
      title: event.title,
      detail: `${event.timeLabel}${event.meridiem} · ${event.location}`,
      href: event.url,
    })
  }

  for (const item of today.cityHall.items) {
    docs.push({ kind: 'event', id: item.id, title: item.title, detail: item.detail, href: item.url })
  }

  for (const business of today.directory) {
    docs.push({
      kind: 'place',
      id: business.id,
      title: business.name,
      detail: `${business.category} · ${business.detail}`,
      href: business.url,
    })
  }

  const neighbours = today.neighbors.featured
    ? [today.neighbors.featured, ...today.neighbors.rest]
    : today.neighbors.rest
  for (const creation of neighbours) {
    docs.push({
      kind: 'creation',
      id: creation.slug,
      title: creation.name,
      detail: creation.author ? `${creation.tagline} · by ${creation.author}` : creation.tagline,
      href: null,
      slug: creation.slug,
    })
  }

  return docs
}

export function docsFromNearby(payload: NearbyPayload): SearchDoc[] {
  return payload.places.map((place) => ({
    kind: 'place' as const,
    id: place.id,
    title: place.name,
    detail: place.address ? `${place.detail} · ${place.address}` : place.detail,
    href: place.url,
  }))
}

export function docsFromCreations(creations: readonly CreationSummary[]): SearchDoc[] {
  return creations.map((creation) => ({
    kind: 'creation' as const,
    id: creation.slug,
    title: creation.name,
    detail: creation.tagline,
    href: null,
    slug: creation.slug,
  }))
}

/**
 * Merge the sources, first writer wins per (kind, id).
 *
 * Today's directory is a rotating handful of the same businesses Nearby holds
 * 741 of, and the same shop matching twice under Places is a bug a resident
 * reads as us not knowing our own town. Order the callers pass them in is
 * therefore meaningful: the richer record goes first.
 */
export function mergeDocs(...sets: Array<readonly SearchDoc[]>): SearchDoc[] {
  const seen = new Set<string>()
  const out: SearchDoc[] = []
  for (const set of sets) {
    for (const doc of set) {
      const key = `${doc.kind}:${doc.id}`
      if (seen.has(key)) continue
      seen.add(key)
      out.push(doc)
    }
  }
  return out
}

/**
 * Three things worth typing, taken from the town rather than written down.
 *
 * The hi-fi's empty state suggests "Riverfest schedule" and "Brush pickup
 * day". Hard-coding those is inventing two events, so these are lifted off
 * real documents instead: one per kind, in the order a resident is most likely
 * to want them. On a quiet day there are fewer than three, and three is not a
 * quota worth padding to.
 */
export function suggestions(docs: readonly SearchDoc[]): SearchDoc[] {
  const wanted: SearchKind[] = ['event', 'story', 'place']
  const out: SearchDoc[] = []
  for (const kind of wanted) {
    const first = docs.find((doc) => doc.kind === kind)
    if (first) out.push(first)
  }
  return out
}

/* ── recent searches ─────────────────────────────────────────────────────── */

const RECENT_KEY = 'ts.search.recent'
const RECENT_MAX = 5

/**
 * Kept on this device, never sent anywhere, never used to rank anything.
 *
 * `localStorage` rather than the account, and that is the whole point: a search
 * history on the server is a record of what a resident was worried about, held
 * by the town, joinable to their handle. Nothing on this screen is worth that.
 * A read that throws (private mode, storage disabled) returns an empty list
 * rather than breaking the field.
 */
export function readRecent(): string[] {
  try {
    const raw = window.localStorage.getItem(RECENT_KEY)
    if (!raw) return []
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.filter((entry): entry is string => typeof entry === 'string').slice(0, RECENT_MAX)
  } catch {
    return []
  }
}

/** Most recent first, no duplicates, capped. Returns the new list. */
export function pushRecent(query: string, current: readonly string[]): string[] {
  const trimmed = query.trim()
  if (!trimmed) return [...current]
  const next = [trimmed, ...current.filter((entry) => entry !== trimmed)].slice(0, RECENT_MAX)
  try {
    window.localStorage.setItem(RECENT_KEY, JSON.stringify(next))
  } catch {
    // A resident with storage turned off still gets a working search. They
    // just do not get a history, which is the failure mode to prefer.
  }
  return next
}

export function clearRecent(): void {
  try {
    window.localStorage.removeItem(RECENT_KEY)
  } catch {
    // Nothing to clear if nothing could be written.
  }
}
