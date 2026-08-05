import { describe, expect, it } from 'vitest'
import {
  assembleDirectory,
  categoryGroup,
  openPhase,
  placeableGeo,
  type GroupId,
} from './directory.js'
import type { TownSquareItem } from './today.js'

const TOWN = { id: 'russellville-ar', name: 'Russellville', timezone: 'America/Chicago' }

function business(over: Partial<Record<string, unknown>> = {}): TownSquareItem {
  return {
    id: 'b1',
    type: 'business',
    title: 'Hickory & Ash',
    name: 'Hickory & Ash',
    description: '',
    source: 'rvts-directory',
    tags: [],
    community: 'Russellville',
    category: 'Furniture store',
    address: '100 N Commerce Ave, Russellville, AR',
    phone: '(479) 555-0100',
    geo: { lat: 35.2784, lng: -93.1338 },
    createdAt: '2025-12-10T12:00:00-06:00',
    updatedAt: '2025-12-10T12:00:00-06:00',
    ...over,
  } as unknown as TownSquareItem
}

describe('categoryGroup', () => {
  /**
   * Every string here is in `businesses.ts` verbatim, and every one of them was
   * in the wrong group at some point while the rule order was being settled.
   * A category that only ever matched one rule proves nothing.
   */
  const cases: ReadonlyArray<readonly [string, GroupId]> = [
    // The whole vehicle trade is one door, however the category is worded.
    ['Auto repair shop', 'auto'],
    ['Tire shop', 'auto'],
    ['Auto parts store', 'auto'],
    ['Car stereo store', 'auto'],
    ['Truck accessories store', 'auto'],
    ['Used car dealer', 'auto'],
    ['Nissan dealer', 'auto'],
    ['Tractor dealer', 'auto'],

    // Pets is six listings and four of them carry a retail word. Ordered above
    // `shop` or the tile holds one boarding kennel.
    ['Pet supply store', 'pets'],
    ['Pet store', 'pets'],
    ['Animal feed store', 'pets'],
    ['Pet boarding service', 'pets'],

    // Clinical words on a salon.
    ['Medical spa', 'beauty'],
    ['Health spa', 'beauty'],
    ['Facial spa', 'beauty'],
    ['Sports massage therapist', 'beauty'],
    ['Nail salon', 'beauty'],

    // …and a retail word on a salon, which goes the other way.
    ['Beauty supply store', 'shop'],
    ['Cosmetics store', 'shop'],

    // Schools, before anything else claims them.
    ['Beauty school', 'learn'],
    ['Massage school', 'learn'],
    ['Dance school', 'learn'],
    ['Flight school', 'learn'],
    ['Public library', 'learn'],
    ['Private university', 'learn'],

    // The collision `nearby.ts` already documents, kept in both places.
    ['Medical supply store', 'shop'],
    ['Health food store', 'shop'],
    ['Vitamin & supplements store', 'shop'],
    ['Lawn mower store', 'shop'],
    ['Landscaping supply store', 'shop'],
    ['Welding supply store', 'shop'],

    // The specialist stems, which a `\b(cardiolog)\b` group cannot match.
    ['Cardiologist', 'health'],
    ['Otolaryngologist', 'health'],
    ['Obstetrician-gynecologist', 'health'],
    ['Applied behavior analysis therapist', 'health'],
    ['Home health care service', 'health'],

    ['Real estate agency', 'money'],
    ['Certified public accountant', 'money'],
    ['Personal injury attorney', 'money'],
    ['Federal credit union', 'money'],

    ['Hotel', 'stay'],
    ['Campground', 'stay'],
    ['Student dormitory', 'stay'],

    ['Park', 'out'],
    ['Memorial park', 'out'],
    ['Wildlife refuge', 'out'],
    ['Marina', 'out'],

    ['Day care center', 'kids'],
    ['Gymnastics center', 'kids'],
    ['Indoor playground', 'kids'],
    ['Youth organization', 'kids'],

    ['Bowling alley', 'fun'],
    ['Escape room center', 'fun'],
    ['Public swimming pool', 'fun'],

    ['Roofing contractor', 'home'],
    ['Septic system service', 'home'],
    ['Construction company', 'home'],

    ['City Hall', 'civic'],
    ['Department of motor vehicles', 'civic'],
    ['Chamber of Commerce', 'civic'],

    // Ends in the word shop and is neither a shop nor a garage.
    ['Mobile phone repair shop', 'serv'],
    ['Computer repair service', 'serv'],
    ['Process server', 'serv'],

    ['Bakery', 'eat'],
    ['Bubble tea store', 'eat'],
    ['Sandwich shop', 'eat'],
    ['Takeout Restaurant', 'eat'],
  ]

  for (const [category, expected] of cases) {
    it(`${category} → ${expected}`, () => {
      expect(categoryGroup(category)).toBe(expected)
    })
  }

  it('falls back to services rather than guessing', () => {
    expect(categoryGroup('Frozen food manufacturer')).toBe('serv')
    expect(categoryGroup('')).toBe('serv')
    expect(categoryGroup('   ')).toBe('serv')
  })

  /**
   * An RV park is somewhere to sleep and a state park is somewhere to walk, and
   * the word is the same. `stay` is ordered above `out` for exactly this.
   */
  it('separates the two kinds of park', () => {
    expect(categoryGroup('RV park')).toBe('stay')
    expect(categoryGroup('State park')).toBe('out')
  })
})

describe('openPhase', () => {
  const HOURS = 'Mon 9 AM to 5 PM, Tue 9 AM to 5 PM, Wed 9 AM to 5 PM'

  it('is open in the middle of the range', () => {
    const state = openPhase(HOURS, 'Wed', 13 * 60)
    expect(state.phase).toBe('open')
    expect(state.openNow).toBe(true)
    expect(state.label).toBe('Open until 5 PM')
  })

  /**
   * The one that needs the second question. At 4:30 the shop is open and shuts
   * in half an hour, and a resident deciding whether to drive over wants to
   * know that before they leave rather than when they arrive.
   */
  it('says closing soon inside the last hour, and not before', () => {
    expect(openPhase(HOURS, 'Wed', 16 * 60 + 30).phase).toBe('soon')
    expect(openPhase(HOURS, 'Wed', 15 * 60 + 59).phase).toBe('open')
  })

  /** Shut now but the same day is still in play. A plan, not a different day. */
  it('separates shut-until-later-today from shut-until-another-day', () => {
    expect(openPhase(HOURS, 'Wed', 7 * 60).phase).toBe('later')
    expect(openPhase(HOURS, 'Wed', 20 * 60).phase).toBe('closed')
  })

  /**
   * A split shift reopening within the hour is open, not closing. 82 listings
   * carry one, and telling somebody a place is closing when it reopens at four
   * is the same class of wrong as telling them it is shut.
   */
  it('does not call a lunch break a closing', () => {
    const split = 'Wed 11 AM to 2 PM, 3 PM to 9 PM'
    expect(openPhase(split, 'Wed', 13 * 60 + 30).phase).toBe('soon')
    expect(openPhase(split, 'Wed', 14 * 60 + 30).phase).toBe('later')
  })

  /**
   * The load-bearing state. 184 of the 741 listings land here, and none of them
   * may be coerced to false anywhere downstream.
   */
  it('is unknown, never closed, when the hours cannot be read', () => {
    const state = openPhase(undefined, 'Wed', 13 * 60)
    expect(state.phase).toBe('unknown')
    expect(state.openNow).toBeNull()
    expect(state.label).toBe('Hours not confirmed')
  })

  it('shows the printed range when it has one it cannot compute from', () => {
    const state = openPhase('Wed Hours vary', 'Wed', 13 * 60)
    expect(state.phase).toBe('unknown')
    expect(state.openNow).toBeNull()
    expect(state.label).toBe('Hours vary')
  })

  /** Inherited from `openState`, and the whole reason there is no parser here. */
  it('inherits the closing meridiem into the opening one', () => {
    expect(openPhase('Wed 12 to 5 PM', 'Wed', 13 * 60).phase).toBe('open')
    expect(openPhase('Wed 2 to 8 PM', 'Wed', 9 * 60).label).toBe('Closed · opens 2 PM')
  })

  it('reads a whole week rather than the first clause', () => {
    const week = 'Mon Closed, Tue 10 AM to 6 PM, Wed 10 AM to 8 PM'
    expect(openPhase(week, 'Mon', 13 * 60).phase).toBe('closed')
    expect(openPhase(week, 'Wed', 18 * 60).phase).toBe('open')
  })
})

describe('assembleDirectory', () => {
  // 2:00 PM in Russellville, a Wednesday.
  const now = '2026-08-05T19:00:00.000Z'

  it('keeps every listing, including the ones it cannot place', () => {
    const payload = assembleDirectory({
      now,
      town: TOWN,
      items: [business(), business({ id: 'b2', geo: undefined })],
    })
    // Nearby drops an unplaceable listing because it cannot rank one. Browse
    // does not need a map, so the directory is the whole directory.
    expect(payload.places.map((p) => p.id)).toEqual(['b1', 'b2'])
    expect(payload.intro.total).toBe(2)
  })

  it('ignores everything that is not a business', () => {
    const payload = assembleDirectory({
      now,
      town: TOWN,
      items: [
        business(),
        {
          id: 's1',
          type: 'story',
          title: 'The lake is four feet low',
          description: '',
          source: 'courier',
          tags: [],
          community: 'Russellville',
          publishedAt: now,
          createdAt: now,
          updatedAt: now,
        } as unknown as TownSquareItem,
      ],
    })
    expect(payload.places).toHaveLength(1)
  })

  it('counts groups and raw categories from one pass, so they cannot disagree', () => {
    const payload = assembleDirectory({
      now,
      town: TOWN,
      items: [
        business({ id: 'a', category: 'Mexican restaurant', hours: 'Wed 11 AM to 9 PM' }),
        business({ id: 'b', category: 'Mexican restaurant' }),
        business({ id: 'c', category: 'Taco restaurant' }),
        business({ id: 'd', category: 'Tire shop' }),
      ],
    })

    const eat = payload.groups.find((g) => g.id === 'eat')
    expect(eat?.count).toBe(3)
    expect(eat?.openCount).toBe(1)
    expect(eat?.categories).toEqual(['Mexican restaurant', 'Taco restaurant'])

    expect(payload.tail[0]).toEqual({ category: 'Mexican restaurant', count: 2, group: 'eat' })
    expect(payload.groups.reduce((n, g) => n + g.count, 0)).toBe(payload.intro.total)
  })

  it('orders the doors by size, biggest first', () => {
    const payload = assembleDirectory({
      now,
      town: TOWN,
      items: [
        business({ id: 'a', category: 'Tire shop' }),
        business({ id: 'b', category: 'Auto body shop' }),
        business({ id: 'c', category: 'Bakery' }),
      ],
    })
    expect(payload.groups.map((g) => g.id)).toEqual(['auto', 'eat'])
  })

  /** A group with no listings does not appear. There are no churches in the scrape. */
  it('omits a group nothing landed in', () => {
    const payload = assembleDirectory({ now, town: TOWN, items: [business()] })
    expect(payload.groups.map((g) => g.id)).toEqual(['shop'])
  })

  it('states the size of the gap as well as the size of the directory', () => {
    const payload = assembleDirectory({
      now,
      town: TOWN,
      items: [
        business({ id: 'a', hours: 'Wed 9 AM to 5 PM', website: 'https://example.com' }),
        business({ id: 'b', hours: undefined, website: undefined }),
      ],
    })
    expect(payload.intro.withHours).toBe(1)
    expect(payload.intro.unknownHours).toBe(1)
    expect(payload.intro.openNow).toBe(1)
    expect(payload.intro.withWebsite).toBe(1)
    expect(payload.intro.categories).toBe(1)
  })

  it('never coerces an unreadable hours string to closed', () => {
    const payload = assembleDirectory({ now, town: TOWN, items: [business({ hours: undefined })] })
    expect(payload.places[0]?.openNow).toBeNull()
    expect(payload.places[0]?.phase).toBe('unknown')
  })

  /**
   * The bug a screenshot caught on the shipped directory card: Monday's opening
   * hours on a card somebody is reading on a Wednesday.
   */
  it('reads today out of a week of hours', () => {
    const payload = assembleDirectory({
      now,
      town: TOWN,
      items: [business({ hours: 'Mon 6 AM to 11 AM, Wed 1 PM to 9 PM' })],
    })
    expect(payload.places[0]?.detail).toBe('Open until 9 PM')
  })

  it('says when the directory was read, and only when they all agree', () => {
    const agreed = assembleDirectory({ now, town: TOWN, items: [business(), business({ id: 'b2' })] })
    expect(agreed.scrapedLabel).toBe('10 December 2025')

    const mixed = assembleDirectory({
      now,
      town: TOWN,
      items: [business(), business({ id: 'b2', createdAt: '2026-01-04T12:00:00-06:00' })],
    })
    expect(mixed.scrapedLabel).toBeNull()
  })

  /**
   * The half of Nearby this screen absorbed. Without the corridors and the
   * framing box in this payload the map would need a second 240 KB fetch of the
   * same 741 listings, which is the duplication the merge existed to remove.
   */
  it('carries the drawn map: corridors and a framing box', () => {
    const payload = assembleDirectory({
      now,
      town: TOWN,
      // Five addresses on one road is the floor a corridor has to clear; four
      // can be a coincidence of buildings sharing a street name.
      items: Array.from({ length: 6 }, (_, i) =>
        business({
          id: `b${i}`,
          address: `${100 + i * 20} N Commerce Ave, Russellville, AR`,
          geo: { lat: 35.27 + i * 0.002, lng: -93.13 },
        }),
      ),
    })
    expect(payload.streets.length).toBeGreaterThan(0)
    expect(payload.bounds).not.toBeNull()
  })

  /**
   * The map frames on real points only. A (0, 0) sentinel is the Gulf of
   * Guinea, and framing on it opens the map on the Atlantic with Russellville
   * somewhere off the top edge.
   */
  it('frames the map on placeable listings and ignores the sentinels', () => {
    const withSentinel = assembleDirectory({
      now,
      town: TOWN,
      items: [business({ id: 'real' }), business({ id: 'nowhere', geo: undefined })],
    })
    const withoutIt = assembleDirectory({ now, town: TOWN, items: [business({ id: 'real' })] })
    expect(withSentinel.bounds).toEqual(withoutIt.bounds)
    // …and the unplaceable listing is still in the directory, because browse
    // does not need a map.
    expect(withSentinel.places).toHaveLength(2)
  })

  it('draws no map control when nothing can be placed', () => {
    const payload = assembleDirectory({
      now,
      town: TOWN,
      items: [business({ geo: { lat: 0, lng: 0 } })],
    })
    expect(payload.bounds).toBeNull()
    expect(payload.places).toHaveLength(1)
  })

  /**
   * Two cuts of one category, both true. Fifteen doors for the browse grid,
   * five glyphs for the map, because fifteen shapes at 12px is a legend.
   */
  it('carries both the fine group and the coarse map bucket', () => {
    const payload = assembleDirectory({
      now,
      town: TOWN,
      items: [business({ category: 'Nail salon' })],
    })
    expect(payload.places[0]?.group).toBe('beauty')
    expect(payload.places[0]?.kind).toBe('service')
  })

  it('carries no distance, no ranking and no position', () => {
    const payload = assembleDirectory({ now, town: TOWN, items: [business()] })
    expect(JSON.stringify(payload)).not.toContain('distance')
    expect(JSON.stringify(payload)).not.toContain('miles')
    expect(payload.places[0]).toHaveProperty('lat')
  })

  /** There are no photographs in this data and none are invented here. */
  it('has no image field anywhere in the payload', () => {
    const payload = assembleDirectory({ now, town: TOWN, items: [business()] })
    expect(JSON.stringify(payload)).not.toContain('image')
    expect(JSON.stringify(payload)).not.toContain('photo')
  })
})

describe('placeableGeo', () => {
  it('refuses Null Island, a swapped pair and a missing coordinate', () => {
    expect(placeableGeo({ lat: 0, lng: 0 })).toBeNull()
    expect(placeableGeo({ lat: -93.1338, lng: 35.2784 })).toBeNull()
    expect(placeableGeo(undefined)).toBeNull()
    expect(placeableGeo({ lat: Number.NaN, lng: -93 })).toBeNull()
    expect(placeableGeo({ lat: 35.2784, lng: -93.1338 })).toEqual({ lat: 35.2784, lng: -93.1338 })
  })
})
