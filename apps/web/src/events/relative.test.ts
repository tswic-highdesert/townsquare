/**
 * The client half of the calendar's date handling.
 *
 * Three of the four real bugs on this surface were date bugs, and two of them
 * were the same one: treating an all-day entry's midnight start as a claim
 * about midnight. That case is first here for a reason.
 */

import { describe, expect, it } from 'vitest'
import {
  nowLineIndex,
  relativeLabel,
  rowState,
  splitEarlier,
  startedLabel,
  townClock,
  type Timed,
} from './relative.js'

const at = (iso: string): number => Date.parse(iso)

function row(over: Partial<Timed> & { startsAt: string }): Timed {
  return { endsAt: null, allDay: false, ...over }
}

describe('an all-day entry', () => {
  const marker = row({ startsAt: '2026-08-05T00:00:00-05:00', allDay: true })

  it('is not finished at one minute past midnight', () => {
    // The naive "start is past, no end" test drops every all-day entry at
    // 12:01am, on the one screen whose job is to say what is on today.
    expect(rowState(marker, at('2026-08-05T00:01:00-05:00'))).toBe('allday')
  })

  it('is still not finished at eleven at night', () => {
    expect(rowState(marker, at('2026-08-05T23:00:00-05:00'))).toBe('allday')
  })

  it('never claims to be on now, and never counts down', () => {
    // "Residence halls open, in 3 min" is a sentence about a midnight artefact.
    expect(relativeLabel(marker, at('2026-08-05T00:00:00-05:00'))).toBeNull()
    expect(startedLabel(marker, at('2026-08-05T12:00:00-05:00'))).toBeNull()
  })

  it('is never collapsed into "earlier today"', () => {
    const { earlier, rest } = splitEarlier([marker], at('2026-08-05T23:00:00-05:00'))
    expect(earlier).toHaveLength(0)
    expect(rest).toHaveLength(1)
  })
})

describe('rowState', () => {
  const concert = row({
    startsAt: '2026-08-05T19:00:00-05:00',
    endsAt: '2026-08-05T21:30:00-05:00',
  })

  it('runs upcoming, soon, now, done', () => {
    expect(rowState(concert, at('2026-08-05T15:00:00-05:00'))).toBe('upcoming')
    expect(rowState(concert, at('2026-08-05T18:30:00-05:00'))).toBe('soon')
    expect(rowState(concert, at('2026-08-05T20:00:00-05:00'))).toBe('now')
    expect(rowState(concert, at('2026-08-05T21:31:00-05:00'))).toBe('done')
  })

  it('keeps a started event running when no end was published', () => {
    // 40% of the feed has no honest end. Guessing a length here would be the
    // same invention the API already refuses on the row itself.
    const trivia = row({ startsAt: '2026-08-05T18:00:00-05:00' })
    expect(rowState(trivia, at('2026-08-05T23:00:00-05:00'))).toBe('now')
  })
})

describe('the chips', () => {
  it('counts down only inside the hour', () => {
    const game = row({ startsAt: '2026-08-05T14:45:00-05:00' })
    expect(relativeLabel(game, at('2026-08-05T14:14:00-05:00'))).toBe('in 31 min')
    expect(relativeLabel(game, at('2026-08-05T11:00:00-05:00'))).toBeNull()
  })

  it('says how long ago a running thing started', () => {
    const party = row({ startsAt: '2026-08-05T13:00:00-05:00' })
    expect(startedLabel(party, at('2026-08-05T13:25:00-05:00'))).toBe('started 25 min ago')
    expect(startedLabel(party, at('2026-08-05T14:05:00-05:00'))).toBe('started an hour ago')
  })
})

describe('earlier today', () => {
  it('collapses only the leading run of finished rows', () => {
    const rows = [
      row({ startsAt: '2026-08-05T09:00:00-05:00', endsAt: '2026-08-05T10:00:00-05:00' }),
      row({ startsAt: '2026-08-05T11:00:00-05:00', endsAt: '2026-08-05T12:00:00-05:00' }),
      row({ startsAt: '2026-08-05T17:30:00-05:00' }),
    ]
    const { earlier, rest } = splitEarlier(rows, at('2026-08-05T14:14:00-05:00'))
    expect(earlier).toHaveLength(2)
    expect(rest).toHaveLength(1)
  })

  it('collapses nothing on a day that has not started', () => {
    const rows = [row({ startsAt: '2026-08-08T07:00:00-05:00' })]
    expect(splitEarlier(rows, at('2026-08-05T14:14:00-05:00')).earlier).toHaveLength(0)
  })
})

describe('the now line', () => {
  const rows = [
    row({ startsAt: '2026-08-05T13:00:00-05:00', endsAt: '2026-08-05T15:00:00-05:00' }),
    row({ startsAt: '2026-08-05T14:45:00-05:00' }),
    row({ startsAt: '2026-08-05T17:30:00-05:00' }),
  ]

  it('sits between the thing that started and the thing that has not', () => {
    expect(nowLineIndex(rows, at('2026-08-05T14:14:00-05:00'))).toBe(1)
  })

  it('is absent before the day starts and after it ends', () => {
    // A rule at the very top or the very bottom of a list is a rule pretending
    // to be information.
    expect(nowLineIndex(rows, at('2026-08-05T06:00:00-05:00'))).toBeNull()
    expect(nowLineIndex(rows, at('2026-08-05T23:00:00-05:00'))).toBeNull()
  })

  it('is absent on a day made only of all-day markers', () => {
    const markers = [row({ startsAt: '2026-08-05T00:00:00-05:00', allDay: true })]
    expect(nowLineIndex(markers, at('2026-08-05T14:00:00-05:00'))).toBeNull()
  })
})

describe('the clock on the now line', () => {
  it('is the town’s clock, not the browser’s', () => {
    // A resident travelling for work should see 2:14 pm beside a 5:30 council
    // meeting, not 8:14 pm. A screen arguing with itself is worse than no line.
    expect(townClock(at('2026-08-05T14:14:00-05:00'), 'America/Chicago')).toBe('2:14 pm')
    expect(townClock(at('2026-08-05T14:14:00-05:00'), 'Europe/London')).toBe('8:14 pm')
  })
})
