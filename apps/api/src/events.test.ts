/**
 * What the calendar promises, tested without a browser or a live scrape.
 *
 * Every bug found on this surface so far has been a date bug, so the properties
 * pinned here are the date ones: which calendar day an event belongs to, what
 * "all day" means when the stored start is midnight, and which end times are
 * artefacts of the iCal conversion rather than facts about the world.
 */

import { describe, expect, it } from 'vitest'
import {
  assembleDay,
  assembleDetail,
  assembleMonth,
  daysBetween,
  directionsFor,
  eventDay,
  honestEnd,
  lengthLabel,
  segmentDay,
  shiftDay,
  whenExact,
  whenPlain,
  type EventRow,
  type SourceInfo,
} from './events.js'
import type { TownSquareItem } from './today.js'

const TOWN = { id: 'russellville-ar', name: 'Russellville', timezone: 'America/Chicago' }
const TZ = TOWN.timezone

const SOURCES = new Map<string, SourceInfo>([
  ['arkansas-tech', { id: 'arkansas-tech', name: 'Arkansas Tech', url: 'https://atu.edu' }],
  ['city-russellville', { id: 'city-russellville', name: 'City of Russellville' }],
])

type EventOver = Partial<Extract<TownSquareItem, { type: 'event' }>> & {
  id: string
  startDate: string
}

function event(over: EventOver): TownSquareItem {
  return {
    type: 'event',
    title: 'Something on',
    description: '',
    source: 'city-russellville',
    tags: [],
    community: 'Russellville',
    location: 'Downtown',
    createdAt: over.startDate,
    updatedAt: over.startDate,
    ...over,
  } as TownSquareItem
}

function base(items: TownSquareItem[], now = '2026-08-05T14:14:00-05:00') {
  return { now, town: TOWN, items, sources: SOURCES }
}

/** Pull every row out of the segment list, gaps dropped. */
function rowsOf(segments: ReturnType<typeof assembleDay>['segments']): EventRow[] {
  return segments.flatMap((s) => (s.kind === 'rows' ? s.rows : []))
}

describe('the town day', () => {
  it('files an event by the town clock, not the server clock', () => {
    // 11pm Chicago on the 5th is 4am UTC on the 6th. A server in London that
    // read the UTC day would move every evening event to the next morning.
    const late = event({ id: 'a', startDate: '2026-08-05T23:00:00-05:00' })
    expect(eventDay(late as never, TZ)).toBe('2026-08-05')
  })

  it('shifts and subtracts days without drifting across a DST boundary', () => {
    // 1 November 2026 is the Sunday the clocks go back in Chicago.
    expect(shiftDay('2026-10-31', 1)).toBe('2026-11-01')
    expect(daysBetween('2026-10-31', '2026-11-02')).toBe(2)
  })
})

describe('honestEnd', () => {
  it('refuses an end for an all-day entry', () => {
    // The stored pair is a midnight start and a 23:59:59 end, both artefacts.
    // "All day, to 11:59 pm" is a sentence about the data model.
    const allDay = event({
      id: 'a',
      startDate: '2026-08-05T00:00:00-05:00',
      endDate: '2026-08-06T23:59:59-05:00',
      isAllDay: true,
    })
    expect(honestEnd(allDay as never, TZ)).toBeNull()
  })

  it('refuses an end equal to the start', () => {
    const zero = event({
      id: 'a',
      startDate: '2026-08-05T17:30:00-05:00',
      endDate: '2026-08-05T17:30:00-05:00',
    })
    expect(honestEnd(zero as never, TZ)).toBeNull()
  })

  it('refuses an end on a later calendar day', () => {
    // `packages/feed/src/lib/ical.ts` turns an exclusive DTEND into 23:59:59 of
    // the excluded day, so a two-hour game arrives claiming to run two days.
    const spilled = event({
      id: 'a',
      startDate: '2026-08-05T19:00:00-05:00',
      endDate: '2026-08-06T23:59:59-05:00',
    })
    expect(honestEnd(spilled as never, TZ)).toBeNull()
  })

  it('keeps a real end on the same day', () => {
    const real = event({
      id: 'a',
      startDate: '2026-08-05T19:00:00-05:00',
      endDate: '2026-08-05T21:30:00-05:00',
    })
    expect(honestEnd(real as never, TZ)).toBe('2026-08-05T21:30:00-05:00')
  })
})

describe('the day agenda', () => {
  const items = [
    event({ id: 'council', title: 'City council, regular session', startDate: '2026-08-05T17:30:00-05:00' }),
    event({ id: 'party', title: 'Summer reading wrap party', startDate: '2026-08-05T13:00:00-05:00' }),
    event({
      id: 'session',
      title: 'July/August summer session ends',
      startDate: '2026-08-05T00:00:00-05:00',
      isAllDay: true,
    }),
    event({ id: 'volley', title: 'Tech volleyball vs. Henderson', startDate: '2026-08-05T14:45:00-05:00' }),
    event({ id: 'tomorrow', title: 'Chamber coffee', startDate: '2026-08-06T07:30:00-05:00' }),
  ]

  it('puts all-day markers last, whatever their midnight start says', () => {
    const rows = rowsOf(assembleDay(base(items)).segments)
    expect(rows.map((r) => r.id)).toEqual(['party', 'volley', 'council', 'session'])
  })

  it('labels an all-day entry rather than claiming midnight', () => {
    const rows = rowsOf(assembleDay(base(items)).segments)
    const marker = rows.find((r) => r.id === 'session')
    expect(marker?.timeLabel).toBe('All')
    expect(marker?.meridiem).toBe('day')
  })

  it('counts everything on the day, including what already finished', () => {
    // "Did I miss it" is a question this screen is asked constantly, and a
    // count that drops the morning makes the day look emptier than it was.
    expect(assembleDay(base(items)).total).toBe(4)
  })

  it('carries tomorrow on the same scroll', () => {
    const day = assembleDay(base(items))
    expect(day.next?.day).toBe('2026-08-06')
    expect(day.next?.label).toBe('Tomorrow, Thursday 6 August')
  })

  it('omits tomorrow entirely when tomorrow is empty', () => {
    const day = assembleDay(base(items.filter((i) => i.id !== 'tomorrow')))
    expect(day.next).toBeNull()
  })

  it('reports nothing on rather than inventing a filler row', () => {
    const day = assembleDay({ ...base(items), day: '2026-08-04' })
    expect(day.total).toBe(0)
    expect(rowsOf(day.segments)).toEqual([])
  })
})

describe('the week strip', () => {
  it('runs Sunday to Saturday around the chosen day, with real counts', () => {
    const items = [
      event({ id: 'a', startDate: '2026-08-05T17:30:00-05:00' }),
      event({ id: 'b', startDate: '2026-08-05T19:00:00-05:00' }),
      event({ id: 'c', startDate: '2026-08-08T09:00:00-05:00' }),
    ]
    const week = assembleDay(base(items)).week
    expect(week.map((c) => c.day)).toEqual([
      '2026-08-02', '2026-08-03', '2026-08-04', '2026-08-05',
      '2026-08-06', '2026-08-07', '2026-08-08',
    ])
    expect(week.map((c) => c.count)).toEqual([0, 0, 0, 2, 0, 0, 1])
  })

  it('speaks the count, because dots are a glance and not a label', () => {
    const items = [event({ id: 'a', startDate: '2026-08-05T17:30:00-05:00' })]
    const week = assembleDay(base(items)).week
    expect(week[3]?.label).toBe('Wednesday 5 August, today, 1 thing on')
    expect(week[2]?.label).toBe('Tuesday 4 August, nothing on')
  })
})

describe('gaps', () => {
  const row = (over: Partial<EventRow> & { id: string; startsAt: string }): EventRow => ({
    title: 'x',
    detail: '',
    location: '',
    endsAt: null,
    allDay: false,
    timeLabel: '',
    meridiem: '',
    endLabel: null,
    category: 'community',
    source: 's',
    sourceName: 'S',
    url: null,
    ...over,
  })

  it('writes a sentence when the town goes quiet for long enough', () => {
    const segments = segmentDay(
      [
        row({ id: 'a', startsAt: '2026-08-05T16:00:00-05:00' }),
        row({ id: 'b', startsAt: '2026-08-05T17:30:00-05:00' }),
      ],
      TZ,
    )
    expect(segments.map((s) => s.kind)).toEqual(['rows', 'gap', 'rows'])
    const gap = segments[1]
    expect(gap?.kind === 'gap' && gap.lengthLabel).toBe('1 hr 30 min')
    expect(gap?.kind === 'gap' && gap.line).toContain('5:30 pm')
  })

  it('measures from a real end where there is one', () => {
    // 4pm to 5:30pm is 90 minutes of clock, but the first thing runs until 5.
    // Naming a gap that does not exist is the same lie as hiding one that does.
    const segments = segmentDay(
      [
        row({ id: 'a', startsAt: '2026-08-05T16:00:00-05:00', endsAt: '2026-08-05T17:00:00-05:00' }),
        row({ id: 'b', startsAt: '2026-08-05T17:30:00-05:00' }),
      ],
      TZ,
    )
    expect(segments).toHaveLength(1)
  })

  it('never opens a gap against an all-day marker', () => {
    // An all-day row sits at midnight, so measuring against it would report a
    // nine-hour lull before breakfast on every day that has one.
    const segments = segmentDay(
      [
        row({ id: 'a', startsAt: '2026-08-05T09:00:00-05:00' }),
        row({ id: 'marker', startsAt: '2026-08-05T00:00:00-05:00', allDay: true }),
      ],
      TZ,
    )
    expect(segments).toHaveLength(1)
  })

  it('says the length the way a person would', () => {
    expect(lengthLabel(45)).toBe('45 min')
    expect(lengthLabel(120)).toBe('2 hr')
    expect(lengthLabel(215)).toBe('3 hr 35 min')
  })
})

describe('the month grid', () => {
  const items = [
    event({ id: 'a1', title: 'City council', startDate: '2026-08-05T17:30:00-05:00' }),
    event({ id: 'a2', title: 'The Hollers', startDate: '2026-08-05T19:00:00-05:00' }),
    event({ id: 'a3', title: 'Volleyball vs. HSU', startDate: '2026-08-05T14:45:00-05:00' }),
    event({ id: 'a4', title: 'Story time', startDate: '2026-08-05T10:00:00-05:00' }),
    event({ id: 'b1', title: 'Farmers market', startDate: '2026-08-08T07:00:00-05:00' }),
    event({ id: 'c1', title: 'Open mic', startDate: '2026-09-13T20:00:00-05:00' }),
  ]

  it('is always a rectangle of whole weeks', () => {
    const month = assembleMonth(base(items))
    for (const week of month.weeks) expect(week).toHaveLength(7)
    expect(month.weeks[0]?.[0]?.day).toBe('2026-07-26')
  })

  it('caps the cell at three titles and hands the rest to the bar', () => {
    const cell = assembleMonth(base(items))
      .weeks.flat()
      .find((c) => c.day === '2026-08-05')
    expect(cell?.chips).toHaveLength(3)
    expect(cell?.more).toBe(1)
    expect(cell?.count).toBe(4)
  })

  it('scales the load bar against the busiest day in this month', () => {
    // Against the feed's busiest day the whole month would flatten to stubs.
    // A month is read against itself.
    const cells = assembleMonth(base(items)).weeks.flat()
    expect(cells.find((c) => c.day === '2026-08-05')?.load).toBe(1)
    expect(cells.find((c) => c.day === '2026-08-08')?.load).toBe(0.25)
  })

  it('counts only the days inside the month, not the grid padding', () => {
    expect(assembleMonth(base(items)).total).toBe(5)
  })

  it('stops navigating at the edges of the data', () => {
    const august = assembleMonth(base(items))
    expect(august.prevMonth).toBeNull()
    expect(august.nextMonth).toBe('2026-09')
    expect(assembleMonth({ ...base(items), month: '2026-09' }).nextMonth).toBeNull()
  })

  it('places a multi-day event once, on the day it starts', () => {
    // The exclusive-DTEND artefact means a span is a claim we cannot make. See
    // `eventDay`. Spanning would print every ATU game on two cells.
    const spanning = [
      event({
        id: 'span',
        title: 'Softball vs East Central',
        startDate: '2026-08-07T00:00:00-05:00',
        endDate: '2026-08-08T23:59:59-05:00',
        isAllDay: true,
      }),
    ]
    const cells = assembleMonth(base(spanning)).weeks.flat()
    expect(cells.find((c) => c.day === '2026-08-07')?.count).toBe(1)
    expect(cells.find((c) => c.day === '2026-08-08')?.count).toBe(0)
  })
})

describe('the detail', () => {
  const market = event({
    id: 'market',
    title: 'Farmers market',
    description: 'Around forty growers most Saturdays.',
    startDate: '2026-08-08T07:00:00-05:00',
    endDate: '2026-08-08T12:00:00-05:00',
    location: '100 W Main St, Russellville, AR 72801',
    source: 'city-russellville',
  })

  it('answers roughly when before it answers exactly when', () => {
    const detail = assembleDetail({ ...base([market]), id: 'market' })
    expect(detail?.whenPlain).toBe('Saturday morning')
    expect(detail?.whenExact).toBe('Sat 8 August, 7:00 am to 12:00 pm')
  })

  it('says today and tomorrow rather than naming the weekday', () => {
    expect(whenPlain('2026-08-05T19:00:00-05:00', TZ, '2026-08-05', false)).toBe('Today evening')
    expect(whenPlain('2026-08-06T09:00:00-05:00', TZ, '2026-08-05', false)).toBe('Tomorrow morning')
  })

  it('dates anything past the coming week, because a bare weekday is a trap', () => {
    expect(whenPlain('2026-08-26T09:00:00-05:00', TZ, '2026-08-05', false)).toBe(
      'Wednesday 26 August morning',
    )
  })

  it('refuses to round an all-day entry up to a morning', () => {
    expect(whenPlain('2026-08-08T00:00:00-05:00', TZ, '2026-08-05', true)).toBe('Saturday, all day')
    const allDay = event({ id: 'x', startDate: '2026-08-08T00:00:00-05:00', isAllDay: true })
    expect(whenExact(allDay as never, TZ)).toBe('Sat 8 August, all day')
  })

  it('drops a description that is only the title again', () => {
    const echo = event({ id: 'e', title: 'Open mic', description: 'Open mic', startDate: '2026-08-13T20:00:00-05:00' })
    expect(assembleDetail({ ...base([echo]), id: 'e' })?.description).toBeNull()
  })

  it('lists what else is on that day', () => {
    const also = event({ id: 'ride', title: 'Dam to Dam ride', startDate: '2026-08-08T07:30:00-05:00' })
    const detail = assembleDetail({ ...base([market, also]), id: 'market' })
    expect(detail?.alsoThatDay.map((r) => r.id)).toEqual(['ride'])
  })

  it('is null for an event that has rolled off the feed', () => {
    expect(assembleDetail({ ...base([market]), id: 'gone' })).toBeNull()
  })
})

describe('directions', () => {
  it('links a street address', () => {
    expect(directionsFor('320 W C St, Russellville, AR 72801')).toContain('320%20W%20C%20St')
  })

  it('refuses a venue name, a bare town, and Location TBA', () => {
    // A directions link to "Location TBA" sends a neighbour to a search page at
    // the moment they are trying to leave the house.
    expect(directionsFor('Tucker Coliseum')).toBeNull()
    expect(directionsFor('Russellville, AR')).toBeNull()
    expect(directionsFor('Location TBA')).toBeNull()
  })
})

describe('what is never in the payload', () => {
  it('carries no coordinate of any kind', () => {
    // The calendar's coordinates are a hardcoded town centre and a run of
    // literal zeroes. See the note at the top of `events.ts` and `nearby.ts`.
    const geo = event({
      id: 'lib',
      startDate: '2026-08-05T10:00:00-05:00',
      geo: { lat: 35.2784, lng: -93.1338 },
    })
    const json = JSON.stringify(assembleDay(base([geo])))
    expect(json).not.toContain('35.2784')
    expect(json).not.toContain('lat')
  })

  it('carries no relative time, because the client keeps it true', () => {
    // "In 31 min" cached for a minute is wrong within the minute and absurd on
    // a screen left open for an hour.
    const soon = event({ id: 's', startDate: '2026-08-05T14:45:00-05:00' })
    expect(JSON.stringify(assembleDay(base([soon])))).not.toContain('min')
  })
})
