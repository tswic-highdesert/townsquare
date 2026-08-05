import { describe, expect, it } from 'vitest'
import {
  DEFAULT_RANK,
  filterSummary,
  isPlaced,
  mulberry32,
  rankDirectory,
  shortAddress,
  shuffleDeck,
  stumbleLine,
  type DirectoryPlace,
} from './directoryData.js'

function place(over: Partial<DirectoryPlace> = {}): DirectoryPlace {
  return {
    id: 'b1',
    name: 'Hickory & Ash',
    category: 'Furniture store',
    group: 'shop',
    detail: 'Open until 5 PM',
    phase: 'open',
    openNow: true,
    lat: 35.2784,
    lng: -93.1338,
    address: '100 N Commerce Ave, Russellville, AR 72801',
    phone: '(479) 555-0100',
    url: null,
    ...over,
  }
}

const HERE = { lat: 35.2784, lng: -93.1338 }

describe('rankDirectory', () => {
  it('narrows to one group, and to one exact category inside it', () => {
    const places = [
      place({ id: 'a', group: 'eat', category: 'Mexican restaurant' }),
      place({ id: 'b', group: 'eat', category: 'Taco restaurant' }),
      place({ id: 'c', group: 'shop' }),
    ]
    expect(rankDirectory(places, { ...DEFAULT_RANK, group: 'eat' }).map((p) => p.id)).toEqual([
      'a',
      'b',
    ])
    expect(
      rankDirectory(places, { ...DEFAULT_RANK, category: 'Taco restaurant' }).map((p) => p.id),
    ).toEqual(['b'])
  })

  it('searches the name, the category and the street', () => {
    const places = [
      place({ id: 'a', name: 'Cooper Music', category: 'Musical instrument store' }),
      place({ id: 'b', name: 'Farmers Cooperative', category: 'Farm supply store' }),
      place({ id: 'c', name: 'Dog Ear Books', address: '312 W 2nd St, Russellville, AR' }),
    ]
    expect(rankDirectory(places, { ...DEFAULT_RANK, query: 'coop' }).map((p) => p.id)).toEqual([
      'a',
      'b',
    ])
    expect(rankDirectory(places, { ...DEFAULT_RANK, query: '2nd st' }).map((p) => p.id)).toEqual([
      'c',
    ])
  })

  /**
   * The one that matters. `openNow` is nullable and the filter must compare
   * against true, not against falsiness: 184 of the town's listings have hours
   * we could not read, and treating "we do not know" as "shut" is exactly the
   * coercion the whole open-now system exists to prevent.
   */
  it('open now hides unknown hours, and the screen has to say so', () => {
    const places = [
      place({ id: 'open', openNow: true, phase: 'open' }),
      place({ id: 'unknown', openNow: null, phase: 'unknown' }),
      place({ id: 'shut', openNow: false, phase: 'closed' }),
    ]
    expect(rankDirectory(places, { ...DEFAULT_RANK, openOnly: true }).map((p) => p.id)).toEqual([
      'open',
    ])

    const summary = filterSummary(places, { ...DEFAULT_RANK, openOnly: true })
    expect(summary).toEqual({ shown: 1, total: 3, hiddenUnknown: 1 })
  })

  it('reports no hidden unknowns when the filter is off', () => {
    const places = [place({ id: 'unknown', openNow: null, phase: 'unknown' })]
    expect(filterSummary(places, DEFAULT_RANK).hiddenUnknown).toBe(0)
  })

  it('sorts by distance only when there is a position to sort against', () => {
    const near = place({ id: 'near', name: 'Zeta', lat: 35.2785, lng: -93.1339 })
    const far = place({ id: 'far', name: 'Alpha', lat: 35.35, lng: -93.2 })

    expect(rankDirectory([far, near], { ...DEFAULT_RANK, position: HERE }).map((p) => p.id)).toEqual(
      ['near', 'far'],
    )
    // With no position, `near` falls back to what is open rather than to A-Z:
    // ranking from the middle of town would print a distance that is a lie.
    expect(rankDirectory([far, near], DEFAULT_RANK).map((p) => p.id)).toEqual(['far', 'near'])
  })

  /** Open, closing, unknown, later, closed. Unknown beats both shut states. */
  it('orders by what is open, with unknown above closed', () => {
    const places = [
      place({ id: 'closed', name: 'A', phase: 'closed', openNow: false }),
      place({ id: 'later', name: 'B', phase: 'later', openNow: false }),
      place({ id: 'unknown', name: 'C', phase: 'unknown', openNow: null }),
      place({ id: 'soon', name: 'D', phase: 'soon', openNow: true }),
      place({ id: 'open', name: 'E', phase: 'open', openNow: true }),
    ]
    expect(rankDirectory(places, { ...DEFAULT_RANK, sort: 'open' }).map((p) => p.id)).toEqual([
      'open',
      'soon',
      'unknown',
      'later',
      'closed',
    ])
  })

  it('carries a distance only for a listing that can be placed', () => {
    const places = [place({ id: 'placed' }), place({ id: 'nowhere', lat: 0, lng: 0 })]
    const ranked = rankDirectory(places, { ...DEFAULT_RANK, position: HERE })
    expect(ranked.find((p) => p.id === 'placed')?.miles).toBeCloseTo(0, 3)
    // Not Infinity, not zero: no coordinate means no claim about distance.
    expect(ranked.find((p) => p.id === 'nowhere')?.miles).toBeNull()
  })

  it('never mutates the payload it was handed', () => {
    const places = [place({ id: 'b', name: 'B' }), place({ id: 'a', name: 'A' })]
    rankDirectory(places, { ...DEFAULT_RANK, sort: 'az' })
    expect(places.map((p) => p.id)).toEqual(['b', 'a'])
  })
})

describe('isPlaced', () => {
  it('refuses the (0, 0) sentinel the assembler leaves on an unplaceable listing', () => {
    expect(isPlaced({ lat: 0, lng: 0 })).toBe(false)
    expect(isPlaced({ lat: 35.2784, lng: -93.1338 })).toBe(true)
  })
})

describe('shuffleDeck', () => {
  it('deals every place before it deals any place twice', () => {
    const places = Array.from({ length: 50 }, (_, i) => place({ id: `b${i}` }))
    const deck = shuffleDeck(places, 1234)
    expect(deck).toHaveLength(50)
    expect(new Set(deck.map((p) => p.id)).size).toBe(50)
  })

  it('is a copy, so the browse grid keeps reading the payload it had', () => {
    const places = [place({ id: 'a' }), place({ id: 'b' }), place({ id: 'c' })]
    shuffleDeck(places, 99)
    expect(places.map((p) => p.id)).toEqual(['a', 'b', 'c'])
  })

  it('is the same deck for the same seed, and a different one otherwise', () => {
    const places = Array.from({ length: 30 }, (_, i) => place({ id: `b${i}` }))
    expect(shuffleDeck(places, 7).map((p) => p.id)).toEqual(shuffleDeck(places, 7).map((p) => p.id))
    expect(shuffleDeck(places, 7).map((p) => p.id)).not.toEqual(
      shuffleDeck(places, 8).map((p) => p.id),
    )
  })

  it('actually shuffles rather than handing back the order it was given', () => {
    const places = Array.from({ length: 60 }, (_, i) => place({ id: `b${i}` }))
    expect(shuffleDeck(places, 4321).map((p) => p.id)).not.toEqual(places.map((p) => p.id))
  })

  it('survives an empty directory', () => {
    expect(shuffleDeck([], 1)).toEqual([])
  })
})

describe('mulberry32', () => {
  it('stays inside [0, 1)', () => {
    const random = mulberry32(2026)
    for (let i = 0; i < 500; i += 1) {
      const n = random()
      expect(n).toBeGreaterThanOrEqual(0)
      expect(n).toBeLessThan(1)
    }
  })
})

describe('shortAddress', () => {
  /**
   * Every listing is in the same town, so the town, the state and the zip are
   * five words true of all 741 and therefore telling a reader nothing.
   */
  it('keeps the street and drops what every listing shares', () => {
    expect(shortAddress('2409 E Main St, Russellville, AR 72802')).toBe('2409 E Main St')
    expect(shortAddress('914 W Main St')).toBe('914 W Main St')
  })
})

describe('stumbleLine', () => {
  it('is the category, the distance and the street, and never a fake description', () => {
    expect(stumbleLine(place({ category: 'Book store' }), 0.62)).toBe(
      'Book store · 0.6 mi · 100 N Commerce Ave',
    )
  })

  it('drops the distance rather than inventing one', () => {
    expect(stumbleLine(place({ category: 'Book store' }), null)).toBe(
      'Book store · 100 N Commerce Ave',
    )
  })

  it('survives a listing with no address at all', () => {
    expect(stumbleLine(place({ category: 'Park', address: null }), null)).toBe('Park')
  })
})
