import { describe, expect, it } from 'vitest'
import { assembleNearby, placeKind, type PlaceKind } from './nearby.js'
import type { TownSquareItem } from './today.js'

const TOWN = { id: 'russellville-ar', name: 'Russellville', timezone: 'America/Chicago' }

function business(over: Partial<Record<string, unknown>> = {}): TownSquareItem {
  return {
    id: 'b1',
    type: 'business',
    title: 'Hickory & Ash',
    name: 'Hickory & Ash',
    description: '',
    source: 'directory',
    tags: [],
    community: 'Russellville',
    category: 'Furniture store',
    address: '100 N Commerce Ave, Russellville, AR',
    phone: '(479) 555-0100',
    geo: { lat: 35.2784, lng: -93.1338 },
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...over,
  } as unknown as TownSquareItem
}

describe('placeKind', () => {
  /**
   * The cases that were actually wrong at some point, not a sample of the easy
   * ones. Every row here comes from `businesses.ts` verbatim.
   */
  const cases: ReadonlyArray<readonly [string, PlaceKind]> = [
    ['Mexican restaurant', 'eat'],
    ['Coffee shop', 'eat'],
    ['Sandwich shop', 'eat'],
    ['Bubble tea store', 'eat'],

    // Ends in the word `shop` and is a trade, not a shop.
    ['Auto repair shop', 'service'],
    ['Tire shop', 'service'],
    ['Auto body shop', 'service'],
    ['Mobile phone repair shop', 'service'],

    // Carries a clinical word and sells things.
    ['Medical supply store', 'shop'],
    ['Health food store', 'shop'],
    ['Vitamin & supplements store', 'shop'],

    // The stems. `cardiolog` inside `\b(…)\b` matches none of these.
    ['Cardiologist', 'care'],
    ['Dermatologist', 'care'],
    ['Pediatrician', 'care'],
    ['Chiropractor', 'care'],
    ['Obstetrician-gynecologist', 'care'],
    ['Psychologist', 'care'],
    ['Otolaryngologist', 'care'],
    ['Pharmacy', 'care'],

    ['City Hall', 'civic'],
    ['Public library', 'civic'],
    ['State park', 'civic'],
    ['Post office', 'civic'],

    // `school` on its own is not civic: the town's schools are dance, martial
    // arts, massage and flight schools, and they are businesses.
    ['Dance school', 'service'],
    ['Beauty school', 'service'],
    ['Flight school', 'service'],

    ['Furniture store', 'shop'],
    ['Used car dealer', 'shop'],
    ['Attorney', 'service'],
    ['Nail salon', 'service'],
  ]

  for (const [category, expected] of cases) {
    it(`${category} → ${expected}`, () => {
      expect(placeKind(category)).toBe(expected)
    })
  }

  it('is a park, unless it is an RV park', () => {
    expect(placeKind('Park')).toBe('civic')
    expect(placeKind('Memorial park')).toBe('civic')
    expect(placeKind('RV park')).toBe('service')
  })

  it('falls back to service rather than guessing', () => {
    expect(placeKind('Frozen food manufacturer')).toBe('service')
    expect(placeKind('')).toBe('service')
  })
})

describe('assembleNearby', () => {
  const now = '2026-08-05T19:00:00.000Z' // 2:00 PM in Russellville, a Wednesday

  it('drops anything it cannot place', () => {
    const payload = assembleNearby({
      now,
      town: TOWN,
      items: [business(), business({ id: 'b2', geo: undefined })],
    })
    expect(payload.places.map((p) => p.id)).toEqual(['b1'])
  })

  /**
   * The one that was actually in the data. A source with no coordinate emits
   * zeroes, which is a real point six thousand miles away, so it sorts to the
   * top of a list ranked by distance rather than falling off it.
   */
  it('refuses Null Island and a swapped pair', () => {
    const payload = assembleNearby({
      now,
      town: TOWN,
      items: [
        business({ id: 'zeroes', geo: { lat: 0, lng: 0 } }),
        business({ id: 'swapped', geo: { lat: -93.1338, lng: 35.2784 } }),
        business({ id: 'real' }),
      ],
    })
    expect(payload.places.map((p) => p.id)).toEqual(['real'])
  })

  it('carries no events, because the calendar carries no coordinates', () => {
    const payload = assembleNearby({
      now,
      town: TOWN,
      items: [
        business(),
        {
          id: 'e1',
          type: 'event',
          title: 'Craft Club',
          description: '',
          source: 'library',
          tags: [],
          community: 'Russellville',
          startDate: '2026-08-05T23:00:00.000Z',
          endDate: '2026-08-06T01:00:00.000Z',
          location: 'Dover Public Library',
          isAllDay: false,
          // The value `library.ts` stamps on every event it produces, whether
          // the event is in Russellville, Dover, Atkins or Hector.
          geo: { lat: 35.2784, lng: -93.1338 },
          createdAt: '2026-08-01T00:00:00.000Z',
          updatedAt: '2026-08-01T00:00:00.000Z',
        } as unknown as TownSquareItem,
      ],
    })
    expect(payload.places.map((p) => p.id)).toEqual(['b1'])
  })

  it('says whether a business is open right now', () => {
    const payload = assembleNearby({
      now,
      town: TOWN,
      items: [business({ hours: 'Wed 9 AM to 4 PM' })],
    })
    expect(payload.places[0]?.openNow).toBe(true)
    expect(payload.places[0]?.detail).toBe('Open until 4 PM')
  })

  it('falls back to the category rather than asserting an open state', () => {
    const payload = assembleNearby({ now, town: TOWN, items: [business({ hours: undefined })] })
    expect(payload.places[0]?.openNow).toBeNull()
    expect(payload.places[0]?.detail).toBe('Furniture store')
  })

  it('counts each kind, so the chips do not have to', () => {
    const payload = assembleNearby({
      now,
      town: TOWN,
      items: [business(), business({ id: 'b2', category: 'Mexican restaurant' })],
    })
    expect(payload.counts).toEqual({ eat: 1, shop: 1, care: 0, civic: 0, service: 0 })
  })

  it('carries no distance and no position, because it never receives one', () => {
    const payload = assembleNearby({ now, town: TOWN, items: [business()] })
    expect(JSON.stringify(payload)).not.toContain('distance')
    expect(payload.places[0]).toHaveProperty('lat')
  })
})
