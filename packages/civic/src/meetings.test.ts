import { describe, expect, it } from 'vitest'
import { assembleMeetings, bodyFor, tidyTitle, toMeeting, type IngestedEvent } from './meetings.js'

const NOW = Date.UTC(2026, 5, 8, 15, 0)
const DAY = 24 * 60 * 60 * 1000

const ev = (over: Partial<IngestedEvent> = {}): IngestedEvent => ({
  id: 'e-1',
  type: 'event',
  title: 'City Council Meeting',
  source: 'city-russellville',
  startDate: new Date(NOW + 2 * DAY).toISOString(),
  url: 'https://www.russellvillear.gov/calendar',
  ...over,
})

describe('which calendar entries are government', () => {
  it('recognises the bodies that govern the town', () => {
    expect(bodyFor('City Council Meeting')).toBe('City Council')
    expect(bodyFor('QUORUM COURT MEETING @')).toBe('Quorum Court')
    expect(bodyFor('PCLS Board of Trustees Meeting')).toBe('Board of Trustees')
    expect(bodyFor('Historic District Commission Meeting')).toBe('Historic District Commission')
  })

  it('does not sweep in everything with the word meeting in it', () => {
    // The town's calendars are full of things called meetings that are not
    // government, and a civic index with a quilting circle in it is a product
    // that looks unserious in the one place it cannot afford to.
    expect(bodyFor('Tuesday evening book club meeting')).toBeNull()
    expect(bodyFor('AA meeting, fellowship hall')).toBeNull()
    expect(bodyFor('Chamber of Commerce mixer')).toBeNull()
  })

  it('refuses an entry whose date will not parse rather than guessing one', () => {
    expect(toMeeting(ev({ startDate: 'sometime in June' }))).toBeNull()
  })
})

describe('the title', () => {
  it('drops a trailing @ the county left empty', () => {
    expect(tidyTitle('QUORUM COURT MEETING @')).toBe('Quorum Court Meeting')
  })

  it('un-shouts a title without changing a word', () => {
    expect(tidyTitle('01-01-2027 ORGANIZATIONAL/QUORUM COURT MEETING')).toBe(
      '01-01-2027 Organizational/quorum Court Meeting',
    )
  })

  it('leaves a normally cased title exactly alone', () => {
    expect(tidyTitle('Airport Advisory Board Meeting')).toBe('Airport Advisory Board Meeting')
  })
})

describe('what a meeting row can and cannot say', () => {
  it('reports the agenda and cancellation as unknown, never as absent', () => {
    const meeting = toMeeting(ev())!
    // A row that said "agenda posted" when nobody checked is worse than a row
    // that says nothing: a resident who drives to a meeting we said was on is
    // a resident we have actually cost something.
    expect(meeting.agendaState).toBe('unknown')
    expect(meeting.cancelled).toBe('unknown')
  })

  it('keeps the link back to the source page', () => {
    expect(toMeeting(ev())!.url).toBe('https://www.russellvillear.gov/calendar')
  })
})

describe('the index', () => {
  const items = [
    ev({ id: 'tonight', startDate: new Date(NOW + 6 * 60 * 60 * 1000).toISOString() }),
    ev({ id: 'thursday', title: 'Planning Commission', startDate: new Date(NOW + 3 * DAY).toISOString() }),
    ev({ id: 'later', title: 'School Board', startDate: new Date(NOW + 20 * DAY).toISOString() }),
    ev({ id: 'held', startDate: new Date(NOW - 5 * DAY).toISOString() }),
    ev({ id: 'far-off', title: 'Quorum Court', startDate: new Date(NOW + 200 * DAY).toISOString() }),
    ev({ id: 'not-civic', title: 'Farmers market' }),
  ]

  it('answers "is anything on this week" without a scroll', () => {
    const index = assembleMeetings(items, NOW)
    expect(index.thisWeek.map((m) => m.id)).toEqual(['tonight', 'thursday'])
  })

  it('separates later this month from the rest, and drops the far horizon', () => {
    const index = assembleMeetings(items, NOW)
    expect(index.laterThisMonth.map((m) => m.id)).toEqual(['later'])
    expect(index.thisWeek.concat(index.laterThisMonth).map((m) => m.id)).not.toContain('far-off')
  })

  it('keeps what has already been held, most recent first', () => {
    expect(assembleMeetings(items, NOW).recentlyHeld.map((m) => m.id)).toEqual(['held'])
  })

  it('leaves out anything that is not a governing body', () => {
    const index = assembleMeetings(items, NOW)
    const all = [...index.thisWeek, ...index.laterThisMonth, ...index.recentlyHeld]
    expect(all.map((m) => m.id)).not.toContain('not-civic')
  })

  it('names what it cannot tell a resident, on the payload itself', () => {
    // Not in a comment nobody reading the JSON will find. A client that gets
    // an empty agenda field should be able to see that we do not carry agendas
    // at all, rather than conclude the city has not posted one.
    expect(assembleMeetings(items, NOW).notCarried).toContain('agendas')
    expect(assembleMeetings(items, NOW).notCarried).toContain('vote records')
  })

  it('lists the bodies it holds a calendar for', () => {
    expect(assembleMeetings(items, NOW).bodies).toEqual([
      'City Council',
      'Planning Commission',
      'Quorum Court',
      'School Board',
    ])
  })
})
