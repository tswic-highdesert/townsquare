/**
 * The directory and discovery, assembled. `design/hifi-v2` section 05.
 *
 * The same seam as `today.ts` and `nearby.ts`: a pure function from the town's
 * raw items to the exact shape the screen renders, so the rules that decide
 * what a resident stumbles onto are testable without a browser or a live
 * scrape.
 *
 * ## Why this is a discovery surface and not a search index
 *
 * The directory holds 741 businesses that a resident has, at best, been inside
 * thirty of. A search box over that is a lookup table: it can only return what
 * you already knew to type. So the screen is ordered from "I have no idea what
 * I want" down to "I know exactly what I want", and everything in this module
 * exists to feed the top of that order — a random draw, what is open at this
 * minute, and fifteen doors labelled the way a person says them out loud.
 * Search is the fallback and it is deliberately the quietest thing on the page.
 *
 * ## Two rules inherited from the rest of the app, and not weakened here
 *
 * **Openness is only asserted when it was parsed.** Every open/closed claim on
 * this screen comes from `openState` in `today.ts`, which returns null on
 * anything it cannot read honestly. There is no second hours parser in this
 * file, and adding one would be the bug: two parsers that disagree put a green
 * dot on a locked door.
 *
 * **Nothing without a source appears.** The design's specimens include resident
 * collections, photographs, a "not confirmed since March" staleness flag and a
 * claimed-by-the-owner state. None of those have a store behind them yet, so
 * none of them are in this payload. In particular **there are no photographs
 * anywhere in the directory** — the scrape is a Google Places extract with
 * images deliberately excluded — so the card treatments draw the design's own
 * no-photo plate rather than inventing a picture of a neighbour's shop.
 */

/** Deep path, not the barrel. Same reason as `today.ts` — see the note there. */
import type { BusinessItem, TownSquareItem } from '../../../packages/feed/src/lib/types.js'
import { clockParts, hoursToday, openState, rotate } from './today.js'
/**
 * The five-bucket map and the drawn town, both borrowed rather than rebuilt.
 *
 * This screen absorbed Nearby (see the note at the top of
 * `apps/web/src/directory/Directory.tsx`), and absorbing it means taking its
 * two tested pieces with it rather than growing parallel ones. `placeKind` is
 * the coarse cut the **map pins** are drawn by — five glyphs a resident can
 * tell apart at 12px, which is a different question from the fifteen doors the
 * browse grid asks, and both are true of the same listing. `townMap` derives
 * the street corridors from the same 741 addresses.
 */
import { placeKind, type PlaceKind } from './nearby.js'
import { deriveStreets, townBounds, type StreetCorridor, type TownBounds } from './townMap.js'

export type { PlaceKind }

const isBusiness = (i: TownSquareItem): i is BusinessItem => i.type === 'business'

/**
 * Fifteen doors, out of 304 free-text categories.
 *
 * `placeKind` in `nearby.ts` rolls the same field into five, which is the right
 * number for a row of filter chips above a distance-sorted list. It is the
 * wrong number for a browse screen: "Services" holding a third of the town is
 * an honest chip and a useless door. So this is the finer cut, and the test for
 * whether a group earns its place is whether a resident would say it out loud —
 * "somewhere to eat", "somebody to fix the car", "a place to stay".
 *
 * There is no `faith` group, and the design has one. Nothing in the scrape is a
 * church: the extract carries no place of worship at all, and a tile reading
 * "Faith · 24" would be the single most obvious invented number on the screen
 * in a town this size. A group with no listings is omitted rather than filled.
 */
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

export const GROUP_LABELS: Readonly<Record<GroupId, string>> = {
  eat: 'Eat and drink',
  shop: 'Shop',
  auto: 'Auto and repair',
  health: 'Health and care',
  home: 'Home and trades',
  beauty: 'Beauty and barber',
  money: 'Money and law',
  stay: 'Stay the night',
  out: 'Outdoors and parks',
  learn: 'Learn',
  pets: 'Pets',
  kids: 'Kids and family',
  fun: 'Fun and fitness',
  civic: 'Civic',
  serv: 'Services',
}

/**
 * Matched top to bottom, and the order carries most of the correctness.
 *
 * The failure mode is never a category that matches nothing, it is a category
 * that matches two rules and takes the wrong one. Every ordering decision below
 * was forced by a real string in `businesses.ts`:
 *
 * - **`auto` runs before everything.** "Auto repair shop", "Tire shop" and
 *   "Auto body shop" all end in a retail word; "Car stereo store" and "Truck
 *   accessories store" are genuinely shops but nobody browsing Shop wants them
 *   between a boutique and a bakery. The whole vehicle trade is one door.
 * - **`pets` runs before `shop`.** "Pet supply store" and "Pet store" are the
 *   only reason anyone opens a Pets tile, and a `store` rule above this one
 *   swallows both, leaving the group holding one boarding kennel.
 * - **`beauty` runs before `health`.** "Facial spa", "Medical spa" and "Health
 *   spa" carry clinical words and are salons; "Sports massage therapist" is one
 *   space away from "Massage therapist" and a `therapist` rule takes it.
 * - **`learn` runs before `beauty` and `serv`.** "Beauty school" and "Massage
 *   school" are schools. The town's other schools are dance, martial arts,
 *   music and flight, which is exactly why `school` cannot live under `civic`
 *   the way it might in a bigger place.
 * - **`health` runs before `shop`, and guards on the retail words itself.**
 *   Same collision `nearby.ts` documents: "Medical supply store", "Health food
 *   store" and "Vitamin & supplements store" are shops.
 *
 * A miss puts a listing in `serv`, which is the honest default and says so. A
 * false positive files a hardware store under Health, which is the failure that
 * teaches a resident this screen is guessing.
 */
const SELLS_THINGS = /\b(store|suppl\w*|market|dealer|boutique|outlet)\b/i

const GROUP_WORDS: ReadonlyArray<readonly [GroupId, RegExp]> = [
  [
    'auto',
    /\b(auto|car|truck|tire|towing|mechanic|motorcycle|atv|rv dealer|tractor dealer|transmission|muffler|oil change|vehicle|nissan|hyundai|ford|chevrolet|toyota)\b/i,
  ],
  [
    'pets',
    /\b(pet|veterinar\w*|animal|kennel|grooming)\b/i,
  ],
  [
    'eat',
    /\b(restaurant|caf[ée]|coffee|bakery|deli|diner|pizza|donut|sandwich|steak house|barbecue|taco|sushi|grill|ice cream|bubble tea|juice bar|brewery|winery|pub|bar & grill|food truck|takeout|fondue|catering)\b/i,
  ],
  [
    'learn',
    /\b(school|university|college|tutoring|library|academic|driving instructor|education)\b/i,
  ],
  [
    'beauty',
    /\b(salon|barber|spa|waxing|tanning|cosmetic\w*|beauty|nail|massage|esthetic\w*)\b/i,
  ],
  [
    'health',
    /\b(clinic|doctor|physician|dentist|dental|orthodont\w*|pediatric\w*|surgeon|hospital|urgent care|pharmacy|chiropract\w*|optometrist|optician|audiolog\w*|therapist|therapy|psycholog\w*|psychotherap\w*|counselor|cardiolog\w*|dermatolog\w*|oncolog\w*|urolog\w*|podiatr\w*|pulmonolog\w*|otolaryngolog\w*|obstetric\w*|gynecolog\w*|nursing home|home health|medical|rehabilitation|addiction|nurse|hospice|emergency care|cancer treatment|health|sleep clinic|social worker|applied behavior)\b/i,
  ],
  [
    'money',
    /\b(bank|credit union|insurance|attorney|law firm|legal|lawyer|title company|accountant|accounting|certified public|tax prep\w*|tax preparation|real estate|realtor|loan|financial|mortgage|investment|bail)\b/i,
  ],
  [
    'stay',
    /\b(hotel|motel|inn|campground|rv park|lodge|bed & breakfast|dormitory|resort)\b/i,
  ],
  [
    'out',
    /\b(park|marina|wildlife refuge|fairground|trail|boat ramp|nature)\b/i,
  ],
  [
    'kids',
    /\b(day care|child care|childcare|baby|playground|toy|gymnastics|youth organization)\b/i,
  ],
  [
    'fun',
    /\b(gym|fitness|yoga|bowling|movie theater|cinema|pool hall|escape room|batting cage|arena|stadium|golf|skating|public swimming pool|recreation center|art gallery|art center|event venue|festival|night club)\b/i,
  ],
  [
    'home',
    /\b(contractor|plumber|electrician|roofing|hvac|air conditioning|heating|landscap\w*|lawn|tree service|septic|concrete|welding|pest|cleaning|janitorial|pressure washing|house cleaning|home inspector|shed builder|window installation|flooring installation|handyman|remodel\w*|water damage|restoration service|construction)\b/i,
  ],
  [
    'civic',
    /\b(city hall|county government|government office|post office|police|fire department|courthouse|community center|senior citizen center|chamber of commerce|social security|department of motor vehicles|non-profit|social services|labor union|visitor center|historical landmark|employment center|state employment|association \/ organization|organization)\b/i,
  ],
  /**
   * Named explicitly even though `serv` is the fallback, because these have to
   * beat the retail rule underneath them. "Mobile phone repair shop" and
   * "Do-it-yourself shop" both end in the word shop and neither is one, which
   * is the same collision `nearby.ts` documents from the other direction.
   */
  [
    'serv',
    /\b(repair|laundry|dry cleaner\w*|shipping|mailing|printing|screen printer|locksmith|process server|answering service|consultant|employment agency|staffing|storage|moving company)\b/i,
  ],
  [
    'shop',
    /\b(store|shop|market|boutique|mall|jeweler|suppl\\w*|nursery|garden center|outlet|pharmacy|dealer|flea market|pawn)\b/i,
  ],
]

/**
 * The groups a retail word outranks.
 *
 * Not `eat`: a bakery and a bubble tea store sell things and are still places
 * to eat. Everywhere else, the shop rule wins — somebody browsing Beauty wants
 * an appointment, not a shelf of shampoo, and "Beauty supply store" is a shop.
 */
const RETAIL_LOSES: ReadonlySet<GroupId> = new Set<GroupId>(['health', 'civic', 'home', 'beauty', 'serv'])

export function categoryGroup(category: string): GroupId {
  const text = category.trim()
  if (!text) return 'serv'

  for (const [group, pattern] of GROUP_WORDS) {
    // The retail guard, same shape as `nearby.ts`: a clinical, civic or trade
    // word on something that sells things loses to the shop rule further down.
    // "Medical supply store" is a shop, and so is "Lawn mower store".
    if (RETAIL_LOSES.has(group) && SELLS_THINGS.test(text)) continue
    if (pattern.test(text)) return group
  }
  return 'serv'
}

/**
 * What a business is doing at this minute, in five states.
 *
 * The states differ in dot shape as well as colour — solid, haloed, half,
 * hollow, and no dot at all — because `unknown` is the load-bearing one. 184 of
 * the 741 listings carry no hours we can read, and a muted dot beside a sage
 * one reads as "closed". "We could not read this business's hours" and "this
 * business is shut" are different facts and they must not share a shape.
 *
 * ## Why this asks `openState` three questions instead of parsing hours again
 *
 * `openState` already solves the hard part, with tests: the inherited meridiem
 * in `12 to 5 PM`, the midnight close in `9 AM to 12 AM`, and the 82 listings
 * carrying a split shift as a second clause with no weekday of its own. It
 * returns one boolean and a label, which is exactly what the shipped screens
 * need and one state short of what this one draws.
 *
 * The tempting fix is a second parser here that returns minutes. That is how a
 * town ends up with two functions that disagree about a Sunday, and the one on
 * the discovery screen is the one a resident acts on by driving somewhere. So
 * `soon` and `later` are derived by asking the same tested function about a
 * different minute, and every state stays exactly as honest as `openState` is.
 */
export type OpenPhase = 'open' | 'soon' | 'later' | 'closed' | 'unknown'

/** The last minute of the day, so a probe never rolls into tomorrow's hours. */
const LAST_MINUTE = 24 * 60 - 1

/** Inside this, a place is closing rather than open. One hour, not two. */
const CLOSING_SOON_MINUTES = 60

/** Coarse enough to be cheap over 741 listings, fine enough to catch any real opening. */
const PROBE_STEP_MINUTES = 15

export interface PlaceOpenState {
  phase: OpenPhase
  /** What the pill says. Never a guess: null hours produce the raw range or nothing. */
  label: string
  /** True, false, or null when the hours could not be read. Never coerced. */
  openNow: boolean | null
}

export function openPhase(
  hours: string | undefined,
  weekdayShort: string,
  minutesNow: number,
): PlaceOpenState {
  const state = openState(hours, weekdayShort, minutesNow)

  if (!state) {
    // The ladder the shipped cards already use: the printed range for today,
    // then an explicit admission. Never the category dressed up as an hour.
    const printed = hoursToday(hours, weekdayShort)
    return {
      phase: 'unknown',
      label: printed ?? 'Hours not confirmed',
      openNow: null,
    }
  }

  if (state.open) {
    // Open now, and shut within the hour? Ask the same function about the
    // minute an hour from here. A split shift that reopens before then answers
    // "open" and is correctly not flagged, which errs toward saying less.
    const soonAt = Math.min(minutesNow + CLOSING_SOON_MINUTES, LAST_MINUTE)
    const later = openState(hours, weekdayShort, soonAt)
    const closing = soonAt > minutesNow && !(later?.open ?? false)
    return { phase: closing ? 'soon' : 'open', label: state.label, openNow: true }
  }

  // Shut now. Whether the same day is still in play changes what a resident
  // does about it, so it is worth the probe: "opens 4 PM" is a plan and
  // "closed, opens Thursday" is a different afternoon.
  for (let at = minutesNow + PROBE_STEP_MINUTES; at <= LAST_MINUTE; at += PROBE_STEP_MINUTES) {
    if (openState(hours, weekdayShort, at)?.open) {
      return { phase: 'later', label: state.label, openNow: false }
    }
  }

  return { phase: 'closed', label: state.label, openNow: false }
}

/* ── the payload ─────────────────────────────────────────────────────────── */

export interface DirectoryPlace {
  id: string
  name: string
  /** The scrape's own free-text category, kept verbatim. The long tail is real. */
  category: string
  group: GroupId
  /**
   * The coarse bucket, for the map pin's glyph. Fifteen shapes on a map is a
   * legend a resident has to learn; five is a shape they can read.
   */
  kind: PlaceKind
  /** Open state first, then today's printed range, then the category. */
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
  /** How many are open at this minute, so a tile can lead with the live number. */
  openCount: number
  /** The raw categories rolled into it, most common first. Shown on the landing. */
  categories: string[]
}

export interface DirectoryTailEntry {
  category: string
  count: number
  group: GroupId
}

export interface DirectoryPayload {
  town: { id: string; name: string; timezone: string }
  /** Every listing in the directory, unsorted. See the note on ranking below. */
  places: DirectoryPlace[]
  groups: DirectoryGroup[]
  /** Every raw category with its count, most common first. The chip rail. */
  tail: DirectoryTailEntry[]
  intro: {
    total: number
    /** Readable hours, and its complement. Both stated, because the gap is the point. */
    withHours: number
    unknownHours: number
    openNow: number
    withWebsite: number
    categories: number
  }
  /**
   * The map, such as it is: street corridors derived from the same addresses,
   * and the rectangle to frame them in. About 4 KB, and it is the entire reason
   * this screen needs no tile host. See `townMap.ts`.
   *
   * Null bounds means nothing in the directory can be placed, and the screen
   * draws no Map control at all — a switch that opens an empty rectangle is
   * worse than no switch.
   */
  streets: StreetCorridor[]
  bounds: TownBounds | null
  /** When the directory was read, said the way a person would. One date, honestly. */
  scrapedLabel: string | null
  updatedLabel: string
}

export interface AssembleDirectoryInput {
  now: string
  town: { id: string; name: string; timezone: string }
  items: readonly TownSquareItem[]
}

/**
 * Why this payload carries no distances and no ranking.
 *
 * Identical to `nearby.ts`, and for the identical reason: **the position never
 * leaves the phone.** A server that sorts a directory by distance has to be
 * told where a resident is standing, on a request carrying their session
 * cookie. Nothing on this screen is worth building that, so the whole town goes
 * over the wire unsorted and the browser measures it.
 *
 * The list is in the scrape's own order, which is not an order — every listing
 * shares one `createdAt`, the date of the extract, so there is no honest
 * "newest in the directory" to sort by either. Today's strip solves that with a
 * daily rotation and this screen solves it with a random draw. Neither pretends
 * to a freshness signal the data does not have.
 */
export function assembleDirectory(input: AssembleDirectoryInput): DirectoryPayload {
  const { now, town, items } = input
  const tz = town.timezone
  const weekdayShort = new Intl.DateTimeFormat('en-US', { timeZone: tz, weekday: 'short' }).format(
    new Date(now),
  )
  const [nowHour = '0', nowMinute = '0'] = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
    .format(new Date(now))
    .split(':')
  const minutesNow = Number(nowHour) * 60 + Number(nowMinute)

  const businesses = items.filter(isBusiness)

  const places: DirectoryPlace[] = []
  for (const b of businesses) {
    const point = placeableGeo(b.geo)
    const state = openPhase(b.hours, weekdayShort, minutesNow)
    places.push({
      id: b.id,
      name: b.name,
      category: b.category,
      group: categoryGroup(b.category),
      kind: placeKind(b.category),
      // Same ladder as the directory strip on Today and the rows on Nearby.
      detail: state.phase === 'unknown' ? state.label : state.label,
      phase: state.phase,
      openNow: state.openNow,
      // A listing with no usable coordinate still belongs in the directory —
      // this screen is browse, not distance — so it is kept with NaN-free
      // sentinels the client treats as "cannot be placed" rather than dropped.
      lat: point?.lat ?? 0,
      lng: point?.lng ?? 0,
      address: b.address ?? null,
      phone: b.phone ?? null,
      url: b.website ?? null,
    })
  }

  // Counts per group, and per raw category for the long tail. Both derived from
  // the same pass, so a tile total and the chips under it cannot disagree.
  const byGroup = new Map<GroupId, { count: number; open: number; cats: Map<string, number> }>()
  const byCategory = new Map<string, { count: number; group: GroupId }>()

  for (const p of places) {
    const g = byGroup.get(p.group) ?? { count: 0, open: 0, cats: new Map<string, number>() }
    g.count += 1
    if (p.openNow === true) g.open += 1
    g.cats.set(p.category, (g.cats.get(p.category) ?? 0) + 1)
    byGroup.set(p.group, g)

    const c = byCategory.get(p.category) ?? { count: 0, group: p.group }
    c.count += 1
    byCategory.set(p.category, c)
  }

  // Biggest door first. A browse grid ordered by a taxonomy nobody wrote down
  // is a grid a resident has to read all of; ordered by size, the first row is
  // the answer most of the time.
  const groups: DirectoryGroup[] = [...byGroup.entries()]
    .map(([id, g]) => ({
      id,
      label: GROUP_LABELS[id],
      count: g.count,
      openCount: g.open,
      categories: [...g.cats.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([c]) => c),
    }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label))

  const tail: DirectoryTailEntry[] = [...byCategory.entries()]
    .map(([category, c]) => ({ category, count: c.count, group: c.group }))
    .sort((a, b) => b.count - a.count || a.category.localeCompare(b.category))

  const { time, meridiem } = clockParts(now, tz)

  return {
    town,
    places,
    groups,
    tail,
    intro: {
      total: places.length,
      withHours: places.filter((p) => p.phase !== 'unknown').length,
      unknownHours: places.filter((p) => p.phase === 'unknown').length,
      openNow: places.filter((p) => p.openNow === true).length,
      withWebsite: places.filter((p) => p.url !== null).length,
      categories: byCategory.size,
    },
    streets: deriveStreets(items),
    // Framed on the listings that can actually be placed. Two listings in the
    // directory are geocoded to the far side of the state and the (0, 0)
    // sentinels are not points at all; framing on either opens the map on
    // Arkansas with the town as a speck in it.
    bounds: townBounds(places.filter((p) => !(p.lat === 0 && p.lng === 0))),
    scrapedLabel: scrapeDate(businesses, tz),
    updatedLabel: `${time}${meridiem.toLowerCase()}`,
  }
}

/**
 * When the directory was read.
 *
 * Every listing shares one `createdAt` because the whole thing came out of one
 * extract, and that is worth saying out loud on the screen rather than hiding:
 * a directory that admits its own age is one a resident can calibrate against.
 * Null when the listings disagree, because "read on the 10th of December" is
 * only true if they all were.
 */
function scrapeDate(businesses: readonly BusinessItem[], timezone: string): string | null {
  const stamps = new Set(businesses.map((b) => b.createdAt))
  const only = stamps.size === 1 ? [...stamps][0] : undefined
  if (!only) return null
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: timezone,
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(new Date(only))
}

/**
 * A coordinate, or nothing. Same test as `placeable` in `nearby.ts`.
 *
 * Duplicated rather than imported so a change to Nearby's entry requirement
 * cannot silently change which listings appear in the directory: Nearby drops
 * an unplaceable listing because it cannot rank it, and the directory keeps it
 * because browse does not need a map. The two screens want the same test for
 * different reasons, and coupling them would make one of those reasons vanish.
 */
export function placeableGeo(
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

/**
 * The daily rotation, re-exported rather than reimplemented.
 *
 * Today's directory strip already had this problem and solved it. A second
 * rotation with its own seed would put a different two businesses on the home
 * screen and the discovery screen on the same morning, which reads as one of
 * them being wrong.
 */
export { rotate }
