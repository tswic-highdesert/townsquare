/**
 * The Tier 1 read API's rules, without a socket.
 *
 * What is worth proving here is what a creation would notice if it broke: a
 * page that repeats or skips a row, a field leaking that the allowlist should
 * have kept out, and a stale notice that one call lists and the next calls
 * missing.
 */

import { describe, expect, it } from 'vitest'
import type { TownSquareItem } from './today.js'
import { ReadRequestError, findItem, listBusinesses, listItems } from './townRead.js'

const NOW = Date.parse('2026-08-05T14:00:00-05:00')

const common = { description: '', source: 'city-russellville', tags: [], community: 'Russellville' }

const ITEMS: TownSquareItem[] = [
  {
    ...common,
    type: 'event',
    id: 'council',
    title: 'City council, regular session',
    location: '203 S Commerce Ave',
    startDate: '2026-08-05T17:30:00-05:00',
    contactEmail: 'clerk@example.gov',
    createdAt: '2026-08-03T00:00:00Z',
    updatedAt: '2026-08-03T00:00:00Z',
  },
  {
    ...common,
    type: 'notice',
    id: 'boil',
    title: 'Boil water notice',
    severity: 'warning',
    isActive: true,
    createdAt: '2026-08-04T00:00:00Z',
    updatedAt: '2026-08-04T00:00:00Z',
  },
  {
    ...common,
    type: 'notice',
    id: 'old-notice',
    title: 'Road closed',
    severity: 'info',
    isActive: true,
    expires: '2026-08-01T00:00:00Z',
    createdAt: '2026-07-30T00:00:00Z',
    updatedAt: '2026-07-30T00:00:00Z',
  },
  {
    ...common,
    type: 'story',
    id: 'story-1',
    title: 'Library expands hours',
    description: 'The library will open Sundays.',
    body: 'The library will open Sundays.',
    author: 'By Travis Simpson tsimpson@couriernews.com',
    publishedAt: '2026-08-05T08:00:00Z',
    imageUrl: '/api/images/story-1',
    createdAt: '2026-08-05T08:00:00Z',
    updatedAt: '2026-08-05T08:00:00Z',
  },
  {
    ...common,
    type: 'business',
    id: 'b-taq',
    title: 'Taqueria Guadalajara',
    name: 'Taqueria Guadalajara',
    category: 'Mexican restaurant',
    address: '100 Main St',
    hours: 'Mon 11 AM to 9 PM',
    email: 'owner@example.com',
    tags: ['restaurant', 'burrito'],
    geo: { lat: 35.27, lng: -93.13 },
    createdAt: '2026-07-01T00:00:00Z',
    updatedAt: '2026-07-01T00:00:00Z',
  },
  {
    ...common,
    type: 'business',
    id: 'b-home',
    title: 'Arkansas Home Health',
    name: 'Arkansas Home Health',
    category: 'Home health care service',
    address: '200 Main St',
    createdAt: '2026-07-01T00:00:00Z',
    updatedAt: '2026-08-02T00:00:00Z',
  },
  {
    ...common,
    type: 'business',
    id: 'b-bakery',
    title: 'Bakery on Main',
    name: 'bakery on Main',
    category: 'Bakery',
    address: '300 Main St',
    createdAt: '2026-07-01T00:00:00Z',
    updatedAt: '2026-07-01T00:00:00Z',
  },
]

describe('listItems', () => {
  it('serves events, notices and stories newest first, and never businesses', () => {
    const page = listItems(ITEMS, {}, NOW)
    expect(page.items.map((i) => i.id)).toEqual(['story-1', 'boil', 'council'])
    expect(page.nextCursor).toBeNull()
  })

  it('leaves out a notice that has expired or gone inactive', () => {
    expect(listItems(ITEMS, { type: 'notice' }, NOW).items.map((i) => i.id)).toEqual(['boil'])
  })

  it('filters by type and by a case-insensitive search', () => {
    expect(listItems(ITEMS, { type: 'event' }, NOW).items.map((i) => i.id)).toEqual(['council'])
    expect(listItems(ITEMS, { q: 'SUNDAYS' }, NOW).items.map((i) => i.id)).toEqual(['story-1'])
    expect(listItems(ITEMS, { q: 'commerce' }, NOW).items.map((i) => i.id)).toEqual(['council'])
  })

  it('pages with a cursor that neither repeats nor skips a row', () => {
    const first = listItems(ITEMS, { limit: 2 }, NOW)
    expect(first.items.map((i) => i.id)).toEqual(['story-1', 'boil'])
    expect(first.nextCursor).toEqual(expect.any(String))

    const second = listItems(ITEMS, { limit: 2, cursor: first.nextCursor! }, NOW)
    expect(second.items.map((i) => i.id)).toEqual(['council'])
    expect(second.nextCursor).toBeNull()
  })

  it('keeps a cursor exact when a new item lands between pages', () => {
    const first = listItems(ITEMS, { limit: 1 }, NOW)
    const newer: TownSquareItem = {
      ...common,
      type: 'story',
      id: 'story-2',
      title: 'Newer',
      body: '',
      publishedAt: '2026-08-05T13:00:00Z',
      createdAt: '2026-08-05T13:00:00Z',
      updatedAt: '2026-08-05T13:00:00Z',
    }
    const second = listItems([newer, ...ITEMS], { limit: 1, cursor: first.nextCursor! }, NOW)
    expect(second.items.map((i) => i.id)).toEqual(['boil'])
  })

  it('keeps only rows updated at or after `since`', () => {
    expect(listItems(ITEMS, { since: '2026-08-04' }, NOW).items.map((i) => i.id)).toEqual(['story-1', 'boil'])
  })

  it('refuses a malformed since, limit or cursor as invalid_request', () => {
    expect(() => listItems(ITEMS, { since: 'last tuesday' }, NOW)).toThrow(ReadRequestError)
    expect(() => listItems(ITEMS, { limit: 0 }, NOW)).toThrow(ReadRequestError)
    expect(() => listItems(ITEMS, { limit: 201 }, NOW)).toThrow(ReadRequestError)
    expect(() => listItems(ITEMS, { limit: 2.5 }, NOW)).toThrow(ReadRequestError)
    expect(() => listItems(ITEMS, { cursor: 'not-a-cursor' }, NOW)).toThrow(ReadRequestError)
  })

  it('refuses a businesses cursor handed to the items list', () => {
    const businesses = listBusinesses(ITEMS, { limit: 1 })
    expect(() => listItems(ITEMS, { cursor: businesses.nextCursor! }, NOW)).toThrow(ReadRequestError)
  })

  it('projects an allowlist, so a scraped contact or article body never reaches a creation', () => {
    const [story] = listItems(ITEMS, { type: 'story' }, NOW).items
    expect(story).toMatchObject({ id: 'story-1', author: 'Travis Simpson', publishedAt: '2026-08-05T08:00:00Z' })
    expect(story).not.toHaveProperty('body')
    expect(story).not.toHaveProperty('imageUrl')
    expect(story).not.toHaveProperty('community')

    const [event] = listItems(ITEMS, { type: 'event' }, NOW).items
    expect(event).toMatchObject({ startDate: '2026-08-05T17:30:00-05:00', location: '203 S Commerce Ave' })
    expect(event).not.toHaveProperty('contactEmail')
  })
})

describe('findItem', () => {
  it('returns a live item by id', () => {
    expect(findItem(ITEMS, 'council', NOW)).toMatchObject({ id: 'council', type: 'event' })
  })

  it('returns null for a missing id, a stale notice, or a business', () => {
    expect(findItem(ITEMS, 'nope', NOW)).toBeNull()
    expect(findItem(ITEMS, 'old-notice', NOW)).toBeNull()
    expect(findItem(ITEMS, 'b-taq', NOW)).toBeNull()
  })
})

describe('listBusinesses', () => {
  it('lists the directory by name, case-insensitively', () => {
    expect(listBusinesses(ITEMS, {}).items.map((b) => b.id)).toEqual(['b-home', 'b-bakery', 'b-taq'])
  })

  it('keeps the tag match creations already rely on: a substring of a tag or the category', () => {
    expect(listBusinesses(ITEMS, { tag: 'home health' }).items.map((b) => b.id)).toEqual(['b-home'])
    expect(listBusinesses(ITEMS, { tag: 'BURRITO' }).items.map((b) => b.id)).toEqual(['b-taq'])
    expect(listBusinesses(ITEMS, { tag: 'restaurant' }).items.map((b) => b.id)).toEqual(['b-taq'])
  })

  it('searches name, category and address with q', () => {
    expect(listBusinesses(ITEMS, { q: '300 main' }).items.map((b) => b.id)).toEqual(['b-bakery'])
    expect(listBusinesses(ITEMS, { q: 'taqueria' }).items.map((b) => b.id)).toEqual(['b-taq'])
  })

  it('pages through the whole directory', () => {
    const seen: string[] = []
    let cursor: string | undefined
    do {
      const page = listBusinesses(ITEMS, { limit: 1, ...(cursor ? { cursor } : {}) })
      seen.push(...page.items.map((b) => b.id))
      cursor = page.nextCursor ?? undefined
    } while (cursor)
    expect(seen).toEqual(['b-home', 'b-bakery', 'b-taq'])
  })

  it('honours since for a nightly sync', () => {
    expect(listBusinesses(ITEMS, { since: '2026-08-01' }).items.map((b) => b.id)).toEqual(['b-home'])
  })

  it('keeps the fields creations already read, adds hours and tags, and nothing else', () => {
    const [taq] = listBusinesses(ITEMS, { tag: 'burrito' }).items
    expect(taq).toEqual({
      id: 'b-taq',
      name: 'Taqueria Guadalajara',
      category: 'Mexican restaurant',
      address: '100 Main St',
      phone: undefined,
      website: undefined,
      geo: { lat: 35.27, lng: -93.13 },
      hours: 'Mon 11 AM to 9 PM',
      tags: ['restaurant', 'burrito'],
    })
    expect(JSON.parse(JSON.stringify(taq))).not.toHaveProperty('email')
  })
})
