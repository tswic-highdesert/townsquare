/**
 * The directory, as the shell sees it — and the ranking, which happens here.
 *
 * The types are declared rather than imported from `apps/api`, for the same
 * reason `todayData.ts` and `nearbyData.ts` declare their own: the shell and
 * the read API are separate services deployed separately, and a shared type
 * quietly permits a field to be renamed on one side of an HTTP boundary.
 *
 * ## Why the sorting, the filtering and the draw are all in the client
 *
 * Because the position is, and because the query is. `GET /api/directory` hands
 * over the whole town and takes no parameters at all — no coordinates, no
 * search term, no category. Nothing a resident is looking for is ever sent
 * anywhere, which is what lets the permission prompt say "your position stays
 * on this device" and mean it literally, and what means the town cannot answer
 * "what did my neighbour search the directory for" even if somebody asked it to.
 *
 * That makes the functions below the business logic of the screen, so they are
 * pure and unit-tested, exactly like `assembleDirectory` on the server side.
 */

import {
  formatDistance,
  milesBetween,
  type PlaceKind,
  type Position,
  type StreetCorridor,
  type TownBounds,
} from '../nearbyData.js'

export type { PlaceKind, StreetCorridor, TownBounds }

export type GroupId =
  | 'eat'
  | 'shop'
  | 'auto'
  | 'health'
  | 'home'
  | 'beauty'
  | 'money'
  | 'stay'
  | 'out'
  | 'learn'
  | 'pets'
  | 'kids'
  | 'fun'
  | 'civic'
  | 'serv'

export type OpenPhase = 'open' | 'soon' | 'later' | 'closed' | 'unknown'

export interface DirectoryPlace {
  id: string
  name: string
  category: string
  group: GroupId
  /** The coarse bucket the map pin is drawn by. Five glyphs, not fifteen. */
  kind: PlaceKind
  detail: string
  phase: OpenPhase
  openNow: boolean | null
  lat: number
  lng: number
  address: string | null
  phone: string | null
  url: string | null
}

export interface DirectoryGroup {
  id: GroupId
  label: string
  count: number
  openCount: number
  categories: string[]
}

export interface DirectoryPayload {
  town: { id: string; name: string; timezone: string }
  places: DirectoryPlace[]
  groups: DirectoryGroup[]
  tail: Array<{ category: string; count: number; group: GroupId }>
  intro: {
    total: number
    withHours: number
    unknownHours: number
    openNow: number
    withWebsite: number
    categories: number
  }
  streets: StreetCorridor[]
  bounds: TownBounds | null
  scrapedLabel: string | null
  updatedLabel: string
}

/** A place with the distance worked out. `miles` is null with no position. */
export interface RankedPlace extends DirectoryPlace {
  miles: number | null
}

export async function fetchDirectory(): Promise<DirectoryPayload> {
  const res = await fetch(new URL('/api/directory', window.location.origin), {
    credentials: 'same-origin',
  })
  if (!res.ok) throw new Error(`directory ${res.status}`)
  return (await res.json()) as DirectoryPayload
}

/**
 * The (0, 0) sentinel the assembler leaves on a listing it could not place.
 *
 * `assembleDirectory` keeps an unplaceable listing because browse does not need
 * a map, and marks it with zeroes rather than dropping it. Measuring from Null
 * Island would put a hardware store six thousand miles away at the bottom of
 * every list, so a place with no coordinate has no distance and says so.
 */
export function isPlaced(place: { lat: number; lng: number }): boolean {
  return !(place.lat === 0 && place.lng === 0)
}

export type SortKey = 'near' | 'open' | 'az'

export interface RankOptions {
  position: Position | null
  /** Null is every group. A tile narrows to one. */
  group: GroupId | null
  /** The exact scrape category, from a long-tail chip. Narrower than a group. */
  category: string | null
  query: string
  /** Hides everything we cannot confirm is open, which is the point of the warning. */
  openOnly: boolean
  sort: SortKey
}

export const DEFAULT_RANK: RankOptions = {
  position: null,
  group: null,
  category: null,
  query: '',
  openOnly: false,
  sort: 'near',
}

/**
 * What a resident sees, in order.
 *
 * Three sorts, and no fourth. There is no "top rated" because Town Square holds
 * no ratings, and no "featured" because nobody can buy the top of a town's
 * directory. Both would be one line of code and both would be the moment this
 * stops being a public record.
 *
 * `near` falls back to `open` when there is no position, rather than to
 * alphabetical: a list ordered A to Z with no distances is a phone book, and
 * what is open right now is useful to somebody who never shares their location
 * at all. Ranking from the centre of town instead would print "0.4 mi" beside a
 * row for somebody standing four miles away, which is the same class of lie as
 * inventing the data.
 */
export function rankDirectory(
  places: readonly DirectoryPlace[],
  opts: RankOptions,
): RankedPlace[] {
  const needle = opts.query.trim().toLowerCase()

  const matched = places.filter((p) => {
    if (opts.group && p.group !== opts.group) return false
    if (opts.category && p.category !== opts.category) return false
    // Deliberately `=== true`. `openNow` is nullable and a null must never be
    // filtered as though it were a false: "we could not read the hours" is not
    // "shut", and the filter bar says so out loud.
    if (opts.openOnly && p.openNow !== true) return false
    if (!needle) return true
    return `${p.name} ${p.category} ${p.address ?? ''}`.toLowerCase().includes(needle)
  })

  const ranked: RankedPlace[] = matched.map((p) => ({
    ...p,
    miles: opts.position && isPlaced(p) ? milesBetween(opts.position, p) : null,
  }))

  const useDistance = opts.sort === 'near' && opts.position !== null
  ranked.sort(opts.sort === 'az' ? byName : useDistance ? byDistance : byWhatIsOpen)
  return ranked
}

function byName(a: RankedPlace, b: RankedPlace): number {
  return a.name.localeCompare(b.name)
}

function byDistance(a: RankedPlace, b: RankedPlace): number {
  return (a.miles ?? Infinity) - (b.miles ?? Infinity) || byName(a, b)
}

/**
 * Open, then closing soon, then unknown, then opening later, then closed.
 *
 * Unknown sits above both closed states on purpose: "we do not know" is a
 * better bet than "no", and the row says which it is. This is the same ordering
 * `nearbyData.ts` uses, widened to the five states this screen draws.
 */
const PHASE_RANK: Readonly<Record<OpenPhase, number>> = {
  open: 0,
  soon: 1,
  unknown: 2,
  later: 3,
  closed: 4,
}

function byWhatIsOpen(a: RankedPlace, b: RankedPlace): number {
  return PHASE_RANK[a.phase] - PHASE_RANK[b.phase] || byName(a, b)
}

/**
 * How many the filters are currently hiding, and why.
 *
 * "18 of 741" with no explanation is indistinguishable from a broken directory,
 * and the `openOnly` number is the one that has to be said out loud: it hides
 * the listings whose hours could not be read, and those places may well be
 * open. A filter that silently discards a fifth of the town on a technicality
 * is a filter that teaches a resident the directory is missing things.
 */
export function filterSummary(
  places: readonly DirectoryPlace[],
  opts: RankOptions,
): { shown: number; total: number; hiddenUnknown: number } {
  const shown = rankDirectory(places, opts).length
  const scoped = rankDirectory(places, { ...opts, openOnly: false, query: '' })
  return {
    shown,
    total: scoped.length,
    hiddenUnknown: opts.openOnly ? scoped.filter((p) => p.openNow === null).length : 0,
  }
}

/* ── the stumble deck ────────────────────────────────────────────────────── */

/**
 * A small, seeded PRNG, so the draw is a unit test rather than a vibe.
 *
 * `Math.random` in the component would make "does the deck ever repeat before
 * it is exhausted" an unanswerable question. mulberry32 is four lines, has no
 * dependency, and is far better than this needs: nothing here is a security
 * decision, it is a shuffle of seven hundred shops.
 */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/**
 * The deck the stumble surface turns over, shuffled once.
 *
 * A shuffled deck rather than a draw-with-replacement, because the promise the
 * screen makes is "one place at a time, drawn at random" and a resident who
 * sees the same tyre shop twice in five taps concludes it is broken. Every
 * place gets its turn before any place gets a second one, which is also closer
 * to the point of a town directory than repeatedly rolling dice would be.
 *
 * Fisher-Yates, on a copy. Shuffling in place would reorder the payload the
 * browse grid is reading from.
 */
export function shuffleDeck<T>(items: readonly T[], seed: number): T[] {
  const out = items.slice()
  const random = mulberry32(seed)
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1))
    const a = out[i] as T
    out[i] = out[j] as T
    out[j] = a
  }
  return out
}

/**
 * The line under a stumble card's name.
 *
 * The category and the street, and nothing else. The design's version carries a
 * sentence of description — "used and new, two rooms deep" — which is a thing a
 * neighbour wrote and this directory does not have: the scrape's `description`
 * field is the category and the town restated ("Book store in Russellville,
 * AR."), so printing it would be the same fact twice in a voice pretending to
 * be a person.
 */
export function stumbleLine(place: DirectoryPlace, miles: number | null): string {
  const street = place.address ? shortAddress(place.address) : null
  return [place.category, miles === null ? null : formatDistance(miles), street]
    .filter(Boolean)
    .join(' · ')
}

/**
 * `2409 E Main St, Russellville, AR 72802` → `2409 E Main St`.
 *
 * Every listing in the directory is in the same town, so the town, the state
 * and the zip are five words that are true of all 741 of them and therefore
 * tell a reader nothing. The street is the part that locates something.
 */
export function shortAddress(address: string): string {
  return (address.split(',')[0] ?? address).trim()
}
