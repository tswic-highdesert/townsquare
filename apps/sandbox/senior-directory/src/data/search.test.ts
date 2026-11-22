import { describe, expect, it } from 'vitest'
import type { DirectoryEntry } from './directory.js'
import { needOf } from './needs.js'
import { isInTown, mapsUrl, matches, stem, telOf } from './search.js'

function entry(name: string, category: string, extra: Partial<DirectoryEntry> = {}): DirectoryEntry {
  return {
    id: name,
    name,
    category,
    address: '100 Main St, Russellville, AR',
    city: 'Russellville',
    phone: null,
    email: null,
    website: null,
    websiteAssumed: false,
    memberSince: null,
    geo: null,
    sources: ['chamber'],
    need: needOf({ name, category }),
    ...extra,
  }
}

const rose = entry('Rose Drug', 'Pharmaceuticals')
const dentist = entry('Russellville Family Dentistry', '')
const stMarys = entry("Saint Mary's Regional Health System", 'Healthcare')

describe('stem', () => {
  it.each([
    ['pharmacies', 'pharmacy'],
    ['dentists', 'dentist'],
    ['glasses', 'glass'],
    ['class', 'class'],
    ['bus', 'bus'],
  ])('%s → %s', (word, out) => expect(stem(word)).toBe(out))
})

describe('matches', () => {
  it('finds by name, any case', () => expect(matches(rose, 'rose DRUG')).toBe(true))
  it('finds by need, in the plural', () => expect(matches(rose, 'pharmacies')).toBe(true))
  it('matches the start of a word', () => expect(matches(dentist, 'dentist')).toBe(true))
  it('ignores apostrophes', () => expect(matches(stMarys, 'marys')).toBe(true))
  it('needs every word', () => expect(matches(rose, 'rose dentist')).toBe(false))
  it('treats an empty query as everything', () => expect(matches(rose, '   ')).toBe(true))
  it('does not match the middle of a word', () => expect(matches(rose, 'ose')).toBe(false))
})

describe('isInTown', () => {
  it('is true for the home city, any case', () => expect(isInTown({ city: 'RUSSELLVILLE' })).toBe(true))
  it('is true for town listings, which carry no city', () => expect(isInTown({ city: null })).toBe(true))
  it('is false elsewhere', () => expect(isInTown({ city: 'Conway' })).toBe(false))
})

describe('links', () => {
  it('dials US numbers with the country code', () => expect(telOf('(479) 968-2456')).toBe('+14799682456'))
  it('leaves other numbers as digits', () => expect(telOf('911')).toBe('911'))
  it('maps by name and address', () =>
    expect(mapsUrl(rose)).toBe(
      'https://www.google.com/maps/search/?api=1&query=Rose%20Drug%2C%20100%20Main%20St%2C%20Russellville%2C%20AR',
    ))
  it('maps by coordinates when it has them', () =>
    expect(mapsUrl({ ...rose, geo: { lat: 35.27, lng: -93.13 } })).toContain('query=35.27%2C-93.13'))
})
