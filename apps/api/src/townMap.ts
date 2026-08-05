/**
 * The town's shape, derived from the town's own directory.
 *
 * ## Why Town Square draws its own map
 *
 * `design/hifi` 5a leads with a map, and the ordinary way to get one is a tile
 * layer. Every option there — OpenStreetMap's public tiles, MapTiler, Stadia,
 * Mapbox — puts a **third-party origin in the load path of the screen holding
 * the town's session cookie**, and a pan is a stream of requests to that host
 * describing, tile by tile, which corner of Russellville a resident is looking
 * at. `packages/tokens` self-hosts four typefaces rather than accept a Google
 * Fonts link for exactly this reason. A map is a much larger version of the
 * same request.
 *
 * The self-hosted answer is vector tiles: a Protomaps extract of Pope County is
 * roughly fifty megabytes of static file plus ~800 KB of MapLibre. That is the
 * right long-term shape and it needs an asset pipeline this repo does not have.
 *
 * So this is the third answer, and it is the one this codebase keeps reaching
 * for: **draw it, from data we already hold.** `Icon.tsx` draws sixteen glyphs
 * rather than fetch a 3.5MB icon font. This module derives the town's street
 * corridors from the 741 addresses in the directory. No tile host, no API key,
 * no `img-src` or `connect-src` entry, no runtime request leaving our origin,
 * and nothing on the map that is not already in the payload.
 *
 * ## What a corridor is, and what it is not
 *
 * It is **not a street centreline.** A business's coordinate is its storefront,
 * which on a commercial strip sits one to three hundred feet back from the road
 * behind a parking lot. So the corridor carries its own measured spread, and
 * the map draws it as a band that wide — the width of the line is literally the
 * precision of the data behind it. A hairline would be a claim to a survey we
 * do not have.
 *
 * Nothing here is invented. There is no street in the output that no listing is
 * addressed on, and no river, park or railway at all, because the directory
 * says nothing about any of those and the hi-fi's versions of them are drawing.
 */

import type { BusinessItem, TownSquareItem } from '../../../packages/feed/src/lib/types.js'

export interface StreetCorridor {
  name: string
  /** Ordered `[lat, lng]` nodes along the corridor. At least two. */
  points: Array<[number, number]>
  /** RMS distance in feet from the addresses to the line. The band's width. */
  spreadFt: number
  /** How many listings are addressed on it. The corridor's evidence. */
  count: number
}

export interface TownBounds {
  minLat: number
  maxLat: number
  minLng: number
  maxLng: number
}

/**
 * A house number, then the street.
 *
 * Deliberately anchored on the number: `Russellville, AR 72801` is a comma-part
 * of every address in the file and matching a bare word before a comma would
 * make a corridor called "Russellville" out of the whole town. A suite is cut
 * because `200 W Main St Ste 4` and `200 W Main St` are one street.
 */
const STREET = /^\s*\d+[A-Za-z]?\s+(.+?)(?:,|\s+(?:Ste|Suite|Unit|Apt|Bldg|#)\b.*)/i

export function streetOf(address: string | undefined): string | null {
  if (!address) return null
  const found = STREET.exec(address)?.[1]?.trim().replace(/\s+/g, ' ')
  // A street named by one or two characters is a parse failure, not a street.
  return found && found.length > 2 ? found : null
}

/**
 * Enough addresses to be a corridor rather than a coincidence.
 *
 * Four points can be four unrelated buildings that happen to share a road name;
 * five in a line is a road. It is the same instinct as `placeKind` preferring
 * the honest default: a corridor drawn from too little evidence is a street
 * invented out of a rounding error.
 */
const MIN_ADDRESSES = 5

/**
 * Past this, the addresses are a blob and not a line.
 *
 * A quarter of a mile of scatter around a supposed street means the name is
 * being used for an area — a business park, a campus — rather than a road, and
 * drawing a line through it would assert a road that is not there.
 */
const MAX_SPREAD_FT = 900

const FEET_PER_DEGREE_LAT = 364_000

export function deriveStreets(items: readonly TownSquareItem[]): StreetCorridor[] {
  const grouped = new Map<string, Array<[number, number]>>()

  for (const item of items) {
    if (item.type !== 'business') continue
    const business = item as BusinessItem
    const lat = business.geo?.lat
    const lng = business.geo?.lng
    if (typeof lat !== 'number' || typeof lng !== 'number') continue
    if (lat === 0 && lng === 0) continue

    const street = streetOf(business.address)
    if (!street) continue

    const list = grouped.get(street)
    if (list) list.push([lat, lng])
    else grouped.set(street, [[lat, lng]])
  }

  const corridors: StreetCorridor[] = []
  for (const [name, points] of grouped) {
    if (points.length < MIN_ADDRESSES) continue
    const corridor = fitCorridor(name, points)
    if (corridor && corridor.spreadFt <= MAX_SPREAD_FT) corridors.push(corridor)
  }

  // Longest evidence first, so a renderer that draws only the top few draws the
  // roads a resident would actually navigate by.
  return corridors.sort((a, b) => b.count - a.count)
}

/**
 * A polyline through a cloud of addresses, and how far off it they sit.
 *
 * The points are projected onto their own principal axis — the direction they
 * vary in most, which for a set of addresses on one road is the road — then
 * binned along it and averaged. A straight fit was the first attempt and it put
 * North Arkansas Avenue, which bends over five miles, six hundred feet away
 * from half the businesses on it.
 */
function fitCorridor(name: string, points: Array<[number, number]>): StreetCorridor | null {
  const lat0 = points.reduce((a, p) => a + p[0], 0) / points.length
  const feetPerLng = FEET_PER_DEGREE_LAT * Math.cos((lat0 * Math.PI) / 180)
  const lng0 = points.reduce((a, p) => a + p[1], 0) / points.length

  const xs = points.map((p) => (p[1] - lng0) * feetPerLng)
  const ys = points.map((p) => (p[0] - lat0) * FEET_PER_DEGREE_LAT)

  let sxx = 0
  let syy = 0
  let sxy = 0
  for (let i = 0; i < points.length; i++) {
    sxx += xs[i]! * xs[i]!
    syy += ys[i]! * ys[i]!
    sxy += xs[i]! * ys[i]!
  }
  // The principal axis of a 2×2 covariance, in closed form. No matrix library
  // for one eigenvector.
  const theta = 0.5 * Math.atan2(2 * sxy, sxx - syy)
  const ux = Math.cos(theta)
  const uy = Math.sin(theta)

  const along = points
    .map((p, i) => ({ t: xs[i]! * ux + ys[i]! * uy, point: p }))
    .sort((a, b) => a.t - b.t)
  const tMin = along[0]!.t
  const tMax = along[along.length - 1]!.t
  if (tMax - tMin < 200) return null // A cluster, not a corridor.

  // Three addresses per node, capped. Too many nodes and the polyline chases
  // individual parking lots; too few and it cuts the corner off a bend.
  const bins = Math.max(2, Math.min(8, Math.floor(points.length / 3)))
  const nodes: Array<[number, number]> = []
  for (let b = 0; b < bins; b++) {
    const lo = tMin + ((tMax - tMin) * b) / bins
    const hi = tMin + ((tMax - tMin) * (b + 1)) / bins
    const inBin = along.filter((a) => (b === bins - 1 ? a.t >= lo && a.t <= hi : a.t >= lo && a.t < hi))
    if (inBin.length === 0) continue
    nodes.push([
      inBin.reduce((a, p) => a + p.point[0], 0) / inBin.length,
      inBin.reduce((a, p) => a + p.point[1], 0) / inBin.length,
    ])
  }
  if (nodes.length < 2) return null

  const segments = nodes.map(
    (n) => [(n[1] - lng0) * feetPerLng, (n[0] - lat0) * FEET_PER_DEGREE_LAT] as const,
  )
  let sum = 0
  for (let i = 0; i < points.length; i++) {
    sum += nearestOnPolyline(xs[i]!, ys[i]!, segments) ** 2
  }

  return {
    name,
    points: nodes,
    spreadFt: Math.round(Math.sqrt(sum / points.length)),
    count: points.length,
  }
}

/** Perpendicular distance to the closest segment, clamped to its endpoints. */
function nearestOnPolyline(
  x: number,
  y: number,
  segments: ReadonlyArray<readonly [number, number]>,
): number {
  let best = Infinity
  for (let s = 0; s + 1 < segments.length; s++) {
    const [ax, ay] = segments[s]!
    const [bx, by] = segments[s + 1]!
    const vx = bx - ax
    const vy = by - ay
    const wx = x - ax
    const wy = y - ay
    const len = vx * vx + vy * vy
    const t = len ? Math.max(0, Math.min(1, (wx * vx + wy * vy) / len)) : 0
    best = Math.min(best, Math.hypot(wx - t * vx, wy - t * vy))
  }
  return best
}

/**
 * The rectangle the map opens on.
 *
 * Trimmed, not extreme. Two listings in the directory are geocoded to the far
 * side of the state — three hundred and sixty miles out — and framing on the
 * true extremes would open the map on Arkansas with Russellville as a speck.
 * The middle 98% is the town; the pair outside it are still in the list, still
 * carry an honest distance, and simply sit off the edge of the map.
 */
export function townBounds(points: ReadonlyArray<{ lat: number; lng: number }>): TownBounds | null {
  if (points.length === 0) return null

  const lats = points.map((p) => p.lat).sort((a, b) => a - b)
  const lngs = points.map((p) => p.lng).sort((a, b) => a - b)
  const at = (sorted: number[], q: number) =>
    sorted[Math.min(sorted.length - 1, Math.max(0, Math.round((sorted.length - 1) * q)))]!

  const minLat = at(lats, 0.01)
  const maxLat = at(lats, 0.99)
  const minLng = at(lngs, 0.01)
  const maxLng = at(lngs, 0.99)

  // A little air, so the outermost pin is not welded to the frame.
  const padLat = Math.max((maxLat - minLat) * 0.06, 0.002)
  const padLng = Math.max((maxLng - minLng) * 0.06, 0.002)

  return {
    minLat: minLat - padLat,
    maxLat: maxLat + padLat,
    minLng: minLng - padLng,
    maxLng: maxLng + padLng,
  }
}
