import { describe, expect, it } from 'vitest'
import { deriveStreets, streetOf, townBounds } from './townMap.js'
import type { TownSquareItem } from './today.js'

/** Feet per degree, near enough at this latitude to write test fixtures in. */
const FT_LAT = 364_000
const FT_LNG = 364_000 * Math.cos((35.2784 * Math.PI) / 180)

function at(northFt: number, eastFt: number): { lat: number; lng: number } {
  return { lat: 35.2784 + northFt / FT_LAT, lng: -93.1338 + eastFt / FT_LNG }
}

function business(address: string, geo: { lat: number; lng: number }, id = address): TownSquareItem {
  return {
    id,
    type: 'business',
    title: id,
    name: id,
    description: '',
    source: 'directory',
    tags: [],
    community: 'Russellville',
    category: 'Restaurant',
    address,
    geo,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  } as unknown as TownSquareItem
}

describe('streetOf', () => {
  it('reads the street out of a postal address', () => {
    expect(streetOf('200 W Main St, Russellville, AR 72801')).toBe('W Main St')
    expect(streetOf('1006 E Parkway Dr, Russellville, AR 72801, United States')).toBe(
      'E Parkway Dr',
    )
  })

  it('drops a suite, so one building is not two streets', () => {
    expect(streetOf('200 W Main St Ste 4, Russellville, AR')).toBe('W Main St')
    expect(streetOf('200 W Main St #4, Russellville, AR')).toBe('W Main St')
  })

  /**
   * The anchor on the house number is the whole guard. Matching a bare word
   * before a comma would make a corridor called "Russellville" out of the town.
   */
  it('refuses anything that does not start with a house number', () => {
    expect(streetOf('Russellville, AR 72801')).toBeNull()
    expect(streetOf('Arkansas Tech University')).toBeNull()
    expect(streetOf(undefined)).toBeNull()
  })
})

describe('deriveStreets', () => {
  /** Ten addresses in a straight line running east, 300 ft apart. */
  const straight = Array.from({ length: 10 }, (_, i) =>
    business(`${100 + i} E Test St, Russellville, AR`, at(0, i * 300), `t${i}`),
  )

  it('draws a corridor through addresses that share a street', () => {
    const streets = deriveStreets(straight)
    expect(streets).toHaveLength(1)
    expect(streets[0]?.name).toBe('E Test St')
    expect(streets[0]?.count).toBe(10)
    expect(streets[0]!.points.length).toBeGreaterThanOrEqual(2)
  })

  it('measures the spread rather than claiming a centreline', () => {
    // Storefronts sit back from the road. Alternate 200 ft either side of it.
    const setback = straight.map((b, i) =>
      business(`${100 + i} E Test St, Russellville, AR`, at(i % 2 ? 200 : -200, i * 300), `s${i}`),
    )
    const [corridor] = deriveStreets(setback)
    expect(corridor?.spreadFt).toBeGreaterThan(150)
    expect(corridor?.spreadFt).toBeLessThan(260)
  })

  it('follows a bend instead of cutting the corner off it', () => {
    // An L: 1500 ft east, then 1500 ft north.
    const bent = [
      ...Array.from({ length: 6 }, (_, i) =>
        business(`${100 + i} N Bend Ave, Russellville, AR`, at(0, i * 300), `b${i}`),
      ),
      ...Array.from({ length: 6 }, (_, i) =>
        business(`${200 + i} N Bend Ave, Russellville, AR`, at((i + 1) * 300, 1500), `c${i}`),
      ),
    ]
    const [corridor] = deriveStreets(bent)
    // A single straight fit through an L sits ~700 ft from both ends. The
    // polyline is what keeps this honest — it was North Arkansas Avenue that
    // exposed the straight version.
    expect(corridor?.spreadFt).toBeLessThan(400)
    expect(corridor!.points.length).toBeGreaterThan(2)
  })

  it('needs more than a coincidence of four', () => {
    const four = straight.slice(0, 4)
    expect(deriveStreets(four)).toEqual([])
  })

  it('refuses a blob, which is an area using a road name', () => {
    // Twelve addresses scattered over half a mile in every direction.
    const blob = Array.from({ length: 12 }, (_, i) =>
      business(
        `${100 + i} Campus Dr, Russellville, AR`,
        at(Math.sin(i * 2.4) * 1400, Math.cos(i * 2.4) * 1400),
        `x${i}`,
      ),
    )
    expect(deriveStreets(blob)).toEqual([])
  })

  it('ignores a listing with no coordinate and one at Null Island', () => {
    const mixed = [
      ...straight,
      business('999 E Test St, Russellville, AR', { lat: 0, lng: 0 }, 'zero'),
    ]
    expect(deriveStreets(mixed)[0]?.count).toBe(10)
  })

  it('puts the best-evidenced corridor first', () => {
    const other = Array.from({ length: 5 }, (_, i) =>
      business(`${100 + i} S Small St, Russellville, AR`, at(-2000, i * 400), `o${i}`),
    )
    expect(deriveStreets([...other, ...straight]).map((s) => s.name)).toEqual([
      'E Test St',
      'S Small St',
    ])
  })
})

describe('townBounds', () => {
  it('is null with nothing to frame', () => {
    expect(townBounds([])).toBeNull()
  })

  /**
   * Two listings in the real directory are geocoded to the far side of the
   * state. Framing on the true extremes opens the map on Arkansas with the town
   * as a speck in it.
   */
  it('trims the far outliers rather than framing the whole state', () => {
    const town = Array.from({ length: 200 }, (_, i) => at(i * 20, i * 20))
    const bounds = townBounds([...town, { lat: 36.9, lng: -86.9 }])!
    expect(bounds.maxLat).toBeLessThan(35.4)
    expect(bounds.maxLng).toBeLessThan(-93)
  })

  it('leaves air around the outermost point', () => {
    const bounds = townBounds([at(0, 0), at(5000, 5000)])!
    expect(bounds.minLat).toBeLessThan(35.2784)
    expect(bounds.maxLng).toBeGreaterThan(at(5000, 5000).lng)
  })
})
