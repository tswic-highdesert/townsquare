/**
 * The ranking on the Nearby screen.
 *
 * This is the half of Nearby that decides what a resident sees first, and it
 * runs in the browser rather than the API because the position never leaves the
 * device. That does not make it any less business logic, so it is tested the
 * same way `assembleToday` is — as a pure function, with no browser involved.
 */

import { describe, expect, it } from 'vitest'
import {
  formatDistance,
  milesBetween,
  rankPlaces,
  reachLabel,
  type NearbyPlace,
} from './nearbyData.js'

/** Downtown Russellville, and a point almost exactly a mile east of it. */
const COURTHOUSE = { lat: 35.2784, lng: -93.1338 }
const A_MILE_EAST = { lat: 35.2784, lng: -93.1160 }

function place(over: Partial<NearbyPlace> & Pick<NearbyPlace, 'id'>): NearbyPlace {
  return {
    kind: 'shop',
    name: over.id,
    detail: '',
    lat: COURTHOUSE.lat,
    lng: COURTHOUSE.lng,
    phone: null,
    address: null,
    url: null,
    openNow: null,
    ...over,
  }
}

describe('milesBetween', () => {
  it('measures a known mile', () => {
    expect(milesBetween(COURTHOUSE, A_MILE_EAST)).toBeCloseTo(1, 1)
  })

  it('is zero at the same point and symmetric', () => {
    expect(milesBetween(COURTHOUSE, COURTHOUSE)).toBe(0)
    expect(milesBetween(A_MILE_EAST, COURTHOUSE)).toBeCloseTo(
      milesBetween(COURTHOUSE, A_MILE_EAST),
      9,
    )
  })
})

describe('formatDistance', () => {
  it('uses feet where a decimal mile says nothing', () => {
    expect(formatDistance(0.01)).toBe('50 ft')
    expect(formatDistance(0.05)).toBe('250 ft')
  })

  it('uses one decimal through the walkable range', () => {
    expect(formatDistance(0.34)).toBe('0.3 mi')
    expect(formatDistance(2.06)).toBe('2.1 mi')
  })

  /** A handful of listings are geocoded to the next county. */
  it('stops pretending to precision at distance', () => {
    expect(formatDistance(23.4)).toBe('23 mi')
  })
})

describe('rankPlaces with a position', () => {
  const places = [
    place({ id: 'far', lat: 35.2784, lng: -93.116 }),
    place({ id: 'near', lat: 35.2786, lng: -93.134 }),
  ]

  it('sorts by distance and carries it', () => {
    const ranked = rankPlaces(places, {
      position: COURTHOUSE,
      kind: null,
      query: '',
      limit: 10,
    })
    expect(ranked.map((p) => p.id)).toEqual(['near', 'far'])
    expect(ranked[0]?.miles).toBeLessThan(0.05)
  })

  it('heads the list with how far it actually reaches', () => {
    const ranked = rankPlaces(places, { position: COURTHOUSE, kind: null, query: '', limit: 10 })
    expect(reachLabel(ranked)).toBe('Within 1.0 mi')
  })
})

describe('rankPlaces with no position', () => {
  const places = [
    place({ id: 'zebra-shop', name: 'Zebra Hardware', openNow: true }),
    place({ id: 'apple-shop', name: 'Apple Hardware', openNow: true }),
    place({ id: 'closed', name: 'Closed Hardware', openNow: false }),
    place({ id: 'unknown', name: 'Unreadable Hardware', openNow: null }),
  ]

  /**
   * The whole point of the fallback: a refusal must not empty the screen, and
   * it must not invent a distance from the middle of town either. Unknown
   * hours sort ahead of known-closed — "we cannot read them" is a better bet
   * than "it is shut".
   */
  it('leads with what is open, then unknown, then closed', () => {
    const ranked = rankPlaces(places, { position: null, kind: null, query: '', limit: 10 })
    expect(ranked.map((p) => p.id)).toEqual([
      'apple-shop',
      'zebra-shop',
      'unknown',
      'closed',
    ])
  })

  it('claims no distance it cannot measure', () => {
    const ranked = rankPlaces(places, { position: null, kind: null, query: '', limit: 10 })
    expect(ranked.every((p) => p.miles === null)).toBe(true)
    expect(reachLabel(ranked)).toBeNull()
  })
})

describe('rankPlaces filtering', () => {
  const places = [
    place({ id: 'taco', kind: 'eat', name: 'Taquería El Sol', address: '200 W Main St' }),
    place({ id: 'wood', kind: 'shop', name: 'Hickory & Ash', detail: 'Woodshop' }),
    place({ id: 'hall', kind: 'civic', name: 'City Hall' }),
  ]

  it('narrows to one bucket', () => {
    const ranked = rankPlaces(places, { position: null, kind: 'eat', query: '', limit: 10 })
    expect(ranked.map((p) => p.id)).toEqual(['taco'])
  })

  it('searches the name, the detail line and the address', () => {
    const byName = rankPlaces(places, { position: null, kind: null, query: 'hickory', limit: 10 })
    expect(byName.map((p) => p.id)).toEqual(['wood'])

    const byDetail = rankPlaces(places, { position: null, kind: null, query: 'woodshop', limit: 10 })
    expect(byDetail.map((p) => p.id)).toEqual(['wood'])

    const byAddress = rankPlaces(places, { position: null, kind: null, query: 'main st', limit: 10 })
    expect(byAddress.map((p) => p.id)).toEqual(['taco'])
  })

  it('combines the chip and the search rather than choosing between them', () => {
    const ranked = rankPlaces(places, { position: null, kind: 'shop', query: 'hall', limit: 10 })
    expect(ranked).toEqual([])
  })

  it('honours the limit', () => {
    expect(rankPlaces(places, { position: null, kind: null, query: '', limit: 2 })).toHaveLength(2)
  })
})
