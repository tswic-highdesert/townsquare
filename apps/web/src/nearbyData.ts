/**
 * Nearby, as the shell sees it — and the ranking, which happens here.
 *
 * The types are declared rather than imported from `apps/api`, for the same
 * reason `todayData.ts` declares its own: the shell and the read API are
 * separate services deployed separately, and a shared type quietly permits a
 * field to be renamed on one side of an HTTP boundary.
 *
 * ## Why the sorting is in the client at all
 *
 * Because the position is. `GET /api/nearby` hands over every placeable thing
 * in town and takes no coordinates, so a resident's location is never sent
 * anywhere — not to us, not with the session cookie attached. Everything below
 * runs on the device.
 *
 * That makes these functions the business logic of the screen, so they are pure
 * and unit-tested, exactly like `assembleToday` on the server side. `rankPlaces`
 * decides what a resident sees first, and that is not a thing to leave untested
 * inside a component.
 */

export type PlaceKind = 'eat' | 'shop' | 'care' | 'civic' | 'service'

export interface NearbyPlace {
  id: string
  kind: PlaceKind
  name: string
  detail: string
  lat: number
  lng: number
  phone: string | null
  address: string | null
  url: string | null
  openNow: boolean | null
}

/** Derived from the directory's own addresses. See `apps/api/src/townMap.ts`. */
export interface StreetCorridor {
  name: string
  points: Array<[number, number]>
  spreadFt: number
  count: number
}

export interface TownBounds {
  minLat: number
  maxLat: number
  minLng: number
  maxLng: number
}

export interface NearbyPayload {
  town: { id: string; name: string; timezone: string }
  places: NearbyPlace[]
  counts: Record<PlaceKind, number>
  streets: StreetCorridor[]
  bounds: TownBounds | null
  updatedLabel: string
}

export interface Position {
  lat: number
  lng: number
}

/** A place with the distance worked out. `miles` is null with no position. */
export interface RankedPlace extends NearbyPlace {
  miles: number | null
}

export async function fetchNearby(): Promise<NearbyPayload> {
  const res = await fetch(new URL('/api/nearby', window.location.origin), {
    credentials: 'same-origin',
  })
  if (!res.ok) throw new Error(`nearby ${res.status}`)
  return (await res.json()) as NearbyPayload
}

/** Miles, mean-Earth radius. Good to well under a percent over a town. */
const EARTH_MILES = 3958.8

export function milesBetween(a: Position, b: Position): number {
  const rad = (deg: number) => (deg * Math.PI) / 180
  const dLat = rad(b.lat - a.lat)
  const dLng = rad(b.lng - a.lng)
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2
  return 2 * EARTH_MILES * Math.asin(Math.sqrt(h))
}

/**
 * A distance a person would say out loud.
 *
 * Feet under a tenth of a mile, because "0.0 mi" is not an answer and "0.04 mi"
 * is not a sentence. One decimal through the walkable range, where the
 * difference between 0.3 and 0.8 is the difference between going and not.
 * Whole miles past ten, where the precision is false comfort — the directory
 * carries a handful of listings geocoded to the next county.
 */
export function formatDistance(miles: number): string {
  if (miles < 0.1) return `${Math.max(50, Math.round((miles * 5280) / 50) * 50)} ft`
  if (miles < 10) return `${miles.toFixed(1)} mi`
  return `${Math.round(miles)} mi`
}

export interface RankOptions {
  position: Position | null
  /** Null is "everything". A chip narrows to one bucket. */
  kind: PlaceKind | null
  query: string
  limit: number
}

/**
 * What a resident sees, in order.
 *
 * With a position it is distance, which needs no defending. Without one it is
 * the interesting question, and the answer here is deliberate: **what is open
 * right now, then everything else alphabetically.**
 *
 * The tempting fallback is to rank from the centre of town, and it is a lie
 * dressed as a feature — it prints "0.4 mi" beside a row for someone standing
 * four miles away. The second temptation is to show nothing until permission is
 * granted, which makes a refusal into a broken screen and teaches residents
 * that saying no costs them the tab. Neither is worth it: a searchable list of
 * what is open now is useful to somebody who never shares their location at
 * all.
 */
export function rankPlaces(places: readonly NearbyPlace[], opts: RankOptions): RankedPlace[] {
  const needle = opts.query.trim().toLowerCase()

  const matched = places.filter((p) => {
    if (opts.kind && p.kind !== opts.kind) return false
    if (!needle) return true
    return `${p.name} ${p.detail} ${p.address ?? ''}`.toLowerCase().includes(needle)
  })

  const ranked: RankedPlace[] = matched.map((p) => ({
    ...p,
    miles: opts.position ? milesBetween(opts.position, p) : null,
  }))

  ranked.sort(opts.position ? byDistance : byWhatIsOpen)
  return ranked.slice(0, opts.limit)
}

function byDistance(a: RankedPlace, b: RankedPlace): number {
  return (a.miles ?? Infinity) - (b.miles ?? Infinity)
}

function byWhatIsOpen(a: RankedPlace, b: RankedPlace): number {
  // Open, then unknown, then closed. A listing whose hours could not be read is
  // ahead of one known to be shut: "we do not know" is a better bet than "no".
  const rank = (p: RankedPlace) => (p.openNow === true ? 0 : p.openNow === null ? 1 : 2)
  return rank(a) - rank(b) || a.name.localeCompare(b.name)
}

/**
 * How far out the shown list actually reaches.
 *
 * The hi-fi heads this screen "Within 0.6 miles", which is only honest if the
 * number describes the rows underneath it. So it is measured from them rather
 * than being a radius the screen filtered on: nothing is hidden for being far
 * away, because in a town this size the twentieth-nearest thing is still worth
 * knowing about.
 */
export function reachLabel(ranked: readonly RankedPlace[]): string | null {
  const farthest = ranked.reduce<number | null>(
    (max, p) => (p.miles === null ? max : Math.max(max ?? 0, p.miles)),
    null,
  )
  return farthest === null ? null : `Within ${formatDistance(farthest)}`
}

/**
 * Ask the browser where we are, once.
 *
 * `enableHighAccuracy` is off deliberately. This screen ranks a town's
 * businesses; the coarse fix is accurate to a block or two, arrives faster, and
 * does not spin up the GPS to sort a list of hardware stores.
 */
export function requestPosition(): Promise<Position | null> {
  return new Promise((resolve) => {
    if (!('geolocation' in navigator)) return resolve(null)
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      // A refusal and a timeout are the same thing to this screen: carry on
      // without it. Distinguishing them would only let us nag about one.
      () => resolve(null),
      { enableHighAccuracy: false, timeout: 8000, maximumAge: 120_000 },
    )
  })
}

/**
 * Whether the browser will hand over a position without prompting.
 *
 * Asked so the screen does not throw a permission dialog at someone who just
 * opened the second tab of their town's app. A resident who has already said
 * yes gets their distances immediately; everyone else gets a button.
 * `navigator.permissions` is absent in some browsers, and unknown is treated as
 * "ask first", which is the safe direction to be wrong in.
 */
export async function positionAlreadyAllowed(): Promise<boolean> {
  if (!('permissions' in navigator)) return false
  try {
    const status = await navigator.permissions.query({ name: 'geolocation' as PermissionName })
    return status.state === 'granted'
  } catch {
    return false
  }
}
