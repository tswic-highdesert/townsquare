/**
 * What Today promises a resident, tested without a browser or a live scrape.
 *
 * The screen's whole claim is that it is true at the moment you open it, so
 * the properties worth pinning are the ones that decide truth: which day
 * "today" means, what has already happened, and which sections vanish when
 * nothing real is behind them.
 */

import { describe, expect, it } from 'vitest'
import {
  assembleToday,
  categorize,
  greetingFor,
  hoursToday,
  readingMinutes,
  rotate,
  townDay,
  type TodaySource,
  type TownSquareItem,
} from './today.js'

const TOWN = { id: 'russellville-ar', name: 'Russellville', timezone: 'America/Chicago' }

const SOURCES = new Map<string, TodaySource>([
  ['the-courier', { id: 'the-courier', name: 'The Courier', type: 'media' }],
  ['city-russellville', { id: 'city-russellville', name: 'City of Russellville', type: 'government' }],
  ['library', { id: 'library', name: 'Pope County Library', type: 'community' }],
])

function story(over: Partial<TownSquareItem> & { id: string; publishedAt: string }): TownSquareItem {
  return {
    type: 'story',
    title: 'A story',
    description: 'Summary.',
    body: 'Body text.',
    source: 'the-courier',
    tags: [],
    community: 'Russellville',
    createdAt: over.publishedAt,
    updatedAt: over.publishedAt,
    ...over,
  } as TownSquareItem
}

function event(over: { id: string; startDate: string } & Record<string, unknown>): TownSquareItem {
  return {
    type: 'event',
    title: 'An event',
    description: '',
    location: 'Somewhere',
    source: 'library',
    tags: [],
    community: 'Russellville',
    createdAt: over.startDate,
    updatedAt: over.startDate,
    ...over,
  } as TownSquareItem
}

function base(over: Partial<Parameters<typeof assembleToday>[0]> = {}) {
  return assembleToday({
    now: '2026-08-03T14:00:00.000Z', // 9:00am in Russellville
    town: TOWN,
    items: [],
    creations: [],
    sources: SOURCES,
    ...over,
  })
}

describe('townDay', () => {
  it('answers in the town timezone, not the server one', () => {
    // 02:00 UTC on the 4th is still the evening of the 3rd in Chicago, and a
    // resident opening the app then is looking at Monday.
    expect(townDay('2026-08-04T02:00:00.000Z', 'America/Chicago')).toBe('2026-08-03')
    expect(townDay('2026-08-04T02:00:00.000Z', 'UTC')).toBe('2026-08-04')
  })
})

describe('greetingFor', () => {
  it('turns over at noon and at five, in town time', () => {
    expect(greetingFor('2026-08-03T14:00:00.000Z', TOWN.timezone)).toBe('Good morning')
    expect(greetingFor('2026-08-03T18:00:00.000Z', TOWN.timezone)).toBe('Good afternoon')
    expect(greetingFor('2026-08-03T23:00:00.000Z', TOWN.timezone)).toBe('Good evening')
  })
})

describe('readingMinutes', () => {
  it('never rounds a real article down to nothing', () => {
    expect(readingMinutes('a few words')).toBe(1)
    expect(readingMinutes(Array(880).fill('word').join(' '))).toBe(4)
  })
})

describe('categorize', () => {
  it('sorts the four buckets the events list tints', () => {
    expect(categorize({ title: 'City Council — regular session', source: 'x' })).toBe('civic')
    expect(categorize({ title: 'Front Porch Concert: The Hollers', source: 'x' })).toBe('music')
    expect(categorize({ title: 'Tech Cats vs. Henderson', source: 'x' })).toBe('sport')
    expect(categorize({ title: 'Adult Cards Club', source: 'x' })).toBe('community')
  })

  it('falls back to community rather than guessing wrong', () => {
    // Real titles from the Arkansas Tech calendar. An earlier pass matched a
    // bare `session` and `run`, and tinted both of these as civic business.
    expect(categorize({ title: 'July/August Summer Session Ends', source: 'x' })).toBe('community')
    expect(categorize({ title: 'Summer camp registration runs through Friday', source: 'x' })).toBe(
      'community',
    )
  })
})

describe('hoursToday', () => {
  const week = 'Mon Closed, Tue 10 AM to 6 PM, Wed 10 AM to 6 PM, Thu 10 AM to 8 PM'

  it("reads the day being asked about, not the first one in the string", () => {
    expect(hoursToday(week, 'Wed')).toBe('10 AM to 6 PM')
    expect(hoursToday(week, 'Mon')).toBe('Closed')
  })

  it('is null when the day is missing, so the caller can say something else', () => {
    expect(hoursToday(week, 'Sun')).toBeNull()
    expect(hoursToday(undefined, 'Wed')).toBeNull()
  })
})

describe('rotate', () => {
  it('is stable within a day and moves between days', () => {
    const list = ['a', 'b', 'c', 'd', 'e']
    expect(rotate(list, '2026-08-03', 2)).toEqual(rotate(list, '2026-08-03', 2))
    expect(rotate(list, '2026-08-03', 2)).not.toEqual(rotate(list, '2026-08-04', 2))
  })

  it('is empty rather than undefined when there is nothing to rotate', () => {
    expect(rotate([], '2026-08-03', 2)).toEqual([])
  })
})

describe('assembleToday', () => {
  it('leaves every section empty rather than inventing one', () => {
    const today = base()
    expect(today.lead).toBeNull()
    expect(today.events.items).toEqual([])
    expect(today.events.total).toBe(0)
    expect(today.neighbors.featured).toBeNull()
    expect(today.cityHall.notice).toBeNull()
    expect(today.cityHall.items).toEqual([])
    expect(today.directory).toEqual([])
  })

  it('leads with the newest story that has actually been published', () => {
    const today = base({
      items: [
        story({ id: 'old', publishedAt: '2026-08-01T12:00:00.000Z', title: 'Older' }),
        story({ id: 'new', publishedAt: '2026-08-03T11:40:00.000Z', title: 'Newest' }),
        // A source with a clock skew, or a scheduled post. Either way it is not
        // news yet, and a lead story dated in the future reads as a bug.
        story({ id: 'future', publishedAt: '2026-08-04T12:00:00.000Z', title: 'Tomorrow' }),
      ],
    })
    expect(today.lead?.title).toBe('Newest')
    expect(today.lead?.source).toBe('The Courier')
    expect(today.lead?.timeLabel).toBe('6:40am')
  })

  it("counts everything today but only shows what has not finished", () => {
    const today = base({
      items: [
        event({ id: 'past', startDate: '2026-08-03T12:00:00.000Z', title: 'Sunrise walk' }),
        event({ id: 'soon', startDate: '2026-08-03T22:30:00.000Z', title: 'City Council' }),
        event({ id: 'later', startDate: '2026-08-04T01:00:00.000Z', title: 'Late show' }),
        event({ id: 'tomorrow', startDate: '2026-08-05T15:00:00.000Z', title: 'Not today' }),
      ],
    })
    // 'later' is 8pm on the 3rd in Chicago, so it is still today.
    expect(today.events.total).toBe(3)
    expect(today.events.items.map((e) => e.id)).toEqual(['soon', 'later'])
    expect(today.events.items[0]).toMatchObject({ timeLabel: '5:30', meridiem: 'PM', category: 'civic' })
  })

  it('keeps an event that started but has not ended', () => {
    const today = base({
      items: [
        event({
          id: 'running',
          startDate: '2026-08-03T13:00:00.000Z',
          endDate: '2026-08-03T16:00:00.000Z',
          title: 'Farmers market',
        }),
      ],
    })
    expect(today.events.items.map((e) => e.id)).toEqual(['running'])
  })

  it('shows one notice at most, worst first, and drops expired ones', () => {
    const notice = (id: string, severity: string, extra: Record<string, unknown> = {}) =>
      ({
        id,
        type: 'notice',
        title: id,
        description: '',
        severity,
        isActive: true,
        source: 'city-russellville',
        tags: [],
        community: 'Russellville',
        createdAt: '2026-08-01T00:00:00.000Z',
        updatedAt: '2026-08-01T00:00:00.000Z',
        ...extra,
      }) as TownSquareItem

    const today = base({
      items: [
        notice('info', 'info'),
        notice('urgent', 'urgent'),
        notice('stale', 'emergency', { expires: '2026-08-02T00:00:00.000Z' }),
        notice('inactive', 'emergency', { isActive: false }),
      ],
    })
    expect(today.cityHall.notice?.id).toBe('urgent')
  })

  it("lists what city hall has scheduled next, and not what is already in today's list", () => {
    const today = base({
      items: [
        event({
          id: 'today-council',
          startDate: '2026-08-03T22:30:00.000Z',
          source: 'city-russellville',
          title: 'Council tonight',
        }),
        event({
          id: 'thursday-planning',
          startDate: '2026-08-06T22:30:00.000Z',
          source: 'city-russellville',
          title: 'Planning commission',
        }),
        event({
          id: 'library-thursday',
          startDate: '2026-08-06T15:00:00.000Z',
          source: 'library',
          title: 'Story time',
        }),
      ],
    })
    expect(today.cityHall.items.map((i) => i.id)).toEqual(['thursday-planning'])
    expect(today.cityHall.items[0]?.detail).toBe('City of Russellville · Thursday')
  })

  it('pushes all-day markers under the things that happen at a time', () => {
    const today = base({
      items: [
        event({
          id: 'marker',
          startDate: '2026-08-03T05:00:00.000Z', // midnight in Chicago
          isAllDay: true,
          title: 'Summer session ends',
        }),
        event({ id: 'concert', startDate: '2026-08-03T23:00:00.000Z', title: 'Front Porch Concert' }),
      ],
    })
    expect(today.events.items.map((e) => e.id)).toEqual(['concert', 'marker'])
    // Midnight is an artefact of the all-day entry, not a claim about when.
    expect(today.events.items[1]).toMatchObject({ timeLabel: 'All', meridiem: 'day' })
  })

  it('features one creation and keeps the rest as rows', () => {
    const make = (slug: string) => ({
      slug,
      name: slug,
      tagline: 't',
      description: 'd',
      author: 'Dana Whitfield',
    })
    const today = base({ creations: [make('a'), make('b'), make('c'), make('d'), make('e')] })
    expect(today.neighbors.featured?.slug).toBe('a')
    expect(today.neighbors.featured?.authorInitials).toBe('DW')
    expect(today.neighbors.rest.map((c) => c.slug)).toEqual(['b', 'c', 'd'])
    expect(today.footer.creationCount).toBe(5)
  })

  it('refuses to invent a person out of a creation name', () => {
    const today = base({
      creations: [{ slug: 'burrito-index', name: 'The Burrito Index', tagline: 't', description: 'd' }],
    })
    expect(today.neighbors.featured?.author).toBeNull()
    expect(today.neighbors.featured?.authorInitials).toBeNull()
  })

  it('counts the sources behind the screen', () => {
    const today = base({
      items: [
        story({ id: 's1', publishedAt: '2026-08-03T11:00:00.000Z', source: 'the-courier' }),
        story({ id: 's2', publishedAt: '2026-08-03T11:00:00.000Z', source: 'the-courier' }),
        event({ id: 'e1', startDate: '2026-08-03T22:00:00.000Z', source: 'library' }),
      ],
    })
    expect(today.footer.sourceCount).toBe(2)
  })
})
