/**
 * Nearby, assembled. `design/hifi` section 5a.
 *
 * The same seam as `today.ts`: a pure function from the town's raw items to the
 * exact shape the screen renders, so the rules that decide what counts as a
 * place — and which of five buckets it lands in — are testable without a
 * browser or a live scrape.
 *
 * ## Why this payload has no distances in it
 *
 * It is the whole town, unsorted, and the resident's browser does the ranking.
 * That is not an accident of layering: **the position never leaves the phone.**
 * A server that sorts by distance has to be told where you are, on a request
 * that carries your session cookie, every time you open the second tab of the
 * town's app. Nothing on this screen is worth building that.
 *
 * The price is the payload — 741 businesses, 240 KB of JSON, 54 KB over the
 * wire once gzipped, measured rather than guessed. It buys a screen that works
 * with the radio off after the first load, and a sentence the permission prompt
 * can honestly say.
 *
 * The rule from `today.ts` still runs through it: **anything with no real
 * source does not appear.** The hi-fi shows a creation's layer pinned to a
 * restaurant ("#1 on Luis's Burrito Index"), which needs the shared record
 * store, and it shows events mixed into the list, which is the subject of the
 * next paragraph. Neither is invented here.
 *
 * ## Why there are no events on this screen
 *
 * The calendar's coordinates are not coordinates. `packages/feed/src/lib/
 * library.ts` and `state-parks.ts` both stamp every event they produce with one
 * hardcoded pair — 35.2784, -93.1338, the middle of Russellville — regardless of
 * where the thing actually is, and the library scrape covers Dover, Atkins and
 * Hector, up to fifteen miles out. A third source emits `{ lat: 0, lng: 0 }`,
 * which is not a fallback so much as the Gulf of Guinea. Of the events carrying
 * any geo at all, two thirds are one of those two lies and the rest are
 * unverified.
 *
 * This was caught by screenshotting the finished screen and reading it: five
 * libraries in three different towns, all reported as fifty feet away. A
 * distance is the one thing on this screen a resident acts on by walking
 * somewhere, so events are out until ingest geocodes a venue. What is on
 * tonight is still on Today, where it never claimed a distance.
 */

/** Deep path, not the barrel. Same reason as `today.ts` — see the note there. */
import type { BusinessItem, TownSquareItem } from '../../../packages/feed/src/lib/types.js'
import { clockParts, hoursToday, openState } from './today.js'
import { deriveStreets, townBounds, type StreetCorridor, type TownBounds } from './townMap.js'

const isBusiness = (i: TownSquareItem): i is BusinessItem => i.type === 'business'

/**
 * Five buckets, not two hundred and fifty.
 *
 * The directory's own `category` field is free text from the scrape and there
 * are 251 distinct values in it, 140 of which occur exactly once. That is a
 * faithful record and a useless filter: nobody opens Nearby wanting to narrow
 * to "Otolaryngologist". The buckets exist so a resident can say "food" and
 * mean it.
 */
export type PlaceKind = 'eat' | 'shop' | 'care' | 'civic' | 'service'

export interface NearbyPlace {
  id: string
  kind: PlaceKind
  name: string
  /** What the row says under the name: open now, then hours, then category. */
  detail: string
  lat: number
  lng: number
  phone: string | null
  address: string | null
  url: string | null
  /** True when the business is open at this minute. Null when unreadable. */
  openNow: boolean | null
}

export interface NearbyPayload {
  town: { id: string; name: string; timezone: string }
  places: NearbyPlace[]
  /** How many of each kind are in `places`, so the chips can carry counts. */
  counts: Record<PlaceKind, number>
  /**
   * The map, such as it is: street corridors derived from the same addresses,
   * and the rectangle to frame them in. About 4 KB, and it is the entire reason
   * this screen needs no tile host. See `townMap.ts`.
   */
  streets: StreetCorridor[]
  bounds: TownBounds | null
  updatedLabel: string
}

/**
 * Matched in this order, and the order is the design.
 *
 * `service` is the honest default and it holds a third of the town: an attorney,
 * a nail salon and a septic tank service have nothing in common except that they
 * are none of the other four. Calling that bucket something more flattering
 * would be inventing a taxonomy the data does not have.
 *
 * Two collisions are handled explicitly rather than by luck, and both were found
 * by running this over all 741 listings:
 *
 * - **`care` never matches something that sells things.** "Medical supply
 *   store", "Health food store" and "Vitamin & supplements store" all carry a
 *   clinical word and are shops. The guard is a whole-word `store|supply|shop`
 *   check that runs first.
 * - **`shop` never matches a repair trade.** "Auto repair shop", "Tire shop"
 *   and "Auto body shop" end in the word `shop` and are services. So the
 *   repair patterns are tested before the retail ones.
 *
 * A miss costs a chip some accuracy. A false positive teaches a resident the
 * filter lies, which is the same lesson `categorize` in `today.ts` exists to
 * avoid — see the note there.
 */
const SELLS_THINGS = /\b(store|supply|shop|market|dealer)\b/i

const KIND_WORDS: ReadonlyArray<readonly [PlaceKind, RegExp]> = [
  [
    'eat',
    /\b(restaurant|caf[ée]|coffee|bakery|deli|diner|pizza|donut|sandwich|steak house|barbecue|taco|sushi|grill|ice cream|bubble tea|juice bar|brewery|pub|bar & grill|food truck)\b/i,
  ],
  [
    'service',
    /\b(repair|auto body|tire|towing|mechanic|oil change|transmission|muffler|auto glass|body shop|wrapping|salon|spa|barber|waxing|tanning|attorney|law firm|legal|bank|credit union|insurance|title company|contractor|plumber|electrician|roofing|landscap\w*|cleaning|janitorial|pressure washing|consultant|accountant|accounting|tax prep\w*|real estate|realtor|locksmith|screen printer|septic|process server|employment agency|mailing|shipping|laundry|day care|child care|pet boarding)\b/i,
  ],
  /**
   * The stems carry `\w*` on purpose. An earlier pass wrote `cardiolog` inside a
   * `\b(…)\b` group, which cannot match "Cardiologist" — the boundary lands
   * mid-word — so every specialist in town quietly fell through to `service`.
   * Fourteen categories were wrong and the regex looked right.
   */
  [
    'care',
    /\b(clinic|doctor|physician|dentist|dental|orthodont\w*|pediatric\w*|surgeon|hospital|urgent care|pharmacy|chiropract\w*|optometrist|optician|audiolog\w*|therapist|therapy|psycholog\w*|psychotherap\w*|counselor|cardiolog\w*|dermatolog\w*|oncolog\w*|urolog\w*|podiatr\w*|pulmonolog\w*|otolaryngolog\w*|obstetric\w*|gynecolog\w*|nursing home|home health|medical|rehabilitation|addiction|nurse|hospice|emergency care|cancer treatment|health)\b/i,
  ],
  [
    'civic',
    /\b(city hall|county government|government office|public library|university library|post office|police|fire department|courthouse|state park|memorial park|community center|recreation center|senior citizen center|chamber of commerce|social security|department of motor vehicles|non-profit|social services|youth organization|labor union|visitor center|historical landmark|fairground|school district|university|college|academic department|public swimming pool|wildlife refuge)\b/i,
  ],
  [
    'shop',
    /\b(store|shop|market|boutique|mall|dealer|jeweler|pharmacy|nursery|outlet)\b/i,
  ],
]

/**
 * A park is civic and an RV park is a campground, and the word is the same.
 *
 * Kept out of the table above because it needs the negative clause, and burying
 * a negative lookahead in a 40-alternative regex hides the one rule anybody
 * would come here to check.
 */
const PARK = /\bpark\b/i
const NOT_A_PARK = /\b(rv park|trailer park|parking)\b/i

export function placeKind(category: string): PlaceKind {
  const text = category.trim()
  if (!text) return 'service'
  if (PARK.test(text) && !NOT_A_PARK.test(text)) return 'civic'

  for (const [kind, pattern] of KIND_WORDS) {
    if (kind === 'care' && SELLS_THINGS.test(text)) continue
    if (pattern.test(text)) return kind
  }
  return 'service'
}

export interface AssembleNearbyInput {
  now: string
  town: { id: string; name: string; timezone: string }
  items: readonly TownSquareItem[]
}

export function assembleNearby(input: AssembleNearbyInput): NearbyPayload {
  const { now, town, items } = input
  const tz = town.timezone
  const weekdayShort = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    weekday: 'short',
  }).format(new Date(now))
  const [nowHour = '0', nowMinute = '0'] = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
    .format(new Date(now))
    .split(':')
  const minutesNow = Number(nowHour) * 60 + Number(nowMinute)

  // A usable coordinate is the entry requirement. A listing this screen cannot
  // place is not a listing this screen can rank, and padding the list with
  // unplaceable rows makes the distance beside every other row mean less.
  const places: NearbyPlace[] = []

  for (const b of items.filter(isBusiness)) {
    const point = placeable(b.geo)
    if (!point) continue

    const state = openState(b.hours, weekdayShort, minutesNow)
    places.push({
      id: b.id,
      kind: placeKind(b.category),
      name: b.name,
      // Same ladder as the directory strip on Today: open right now, then the
      // printed range, then the category. The card always says something true.
      detail: state?.label ?? hoursToday(b.hours, weekdayShort) ?? b.category,
      lat: point.lat,
      lng: point.lng,
      phone: b.phone ?? null,
      address: b.address ?? null,
      url: b.website ?? null,
      openNow: state ? state.open : null,
    })
  }

  const counts: Record<PlaceKind, number> = { eat: 0, shop: 0, care: 0, civic: 0, service: 0 }
  for (const p of places) counts[p.kind] += 1

  const { time, meridiem } = clockParts(now, tz)
  return {
    town,
    places,
    counts,
    streets: deriveStreets(items),
    bounds: townBounds(places),
    updatedLabel: `${time}${meridiem.toLowerCase()}`,
  }
}

/**
 * Whether a pair of numbers is a location or a placeholder.
 *
 * `(0, 0)` is the one that matters, and it is in this feed: it is what a source
 * emits when it has no coordinate, and it is six thousand miles away, so a
 * plain `typeof === 'number'` check puts Null Island at the top of a list sorted
 * by distance. The range check is the cheap other half — a swapped lat/lng pair
 * fails it rather than placing a hardware store in the Indian Ocean.
 */
export function placeable(
  geo: { lat?: number; lng?: number } | undefined,
): { lat: number; lng: number } | null {
  const lat = geo?.lat
  const lng = geo?.lng
  if (typeof lat !== 'number' || typeof lng !== 'number') return null
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null
  if (lat === 0 && lng === 0) return null
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return null
  return { lat, lng }
}
