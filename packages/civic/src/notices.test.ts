import { describe, expect, it } from 'vitest'
import {
  assembleNotices,
  fromAuthored,
  noticeDigest,
  presentFor,
  toCivicNotice,
  type IngestedNotice,
} from './notices.js'

const NOW = Date.UTC(2026, 5, 8, 15, 0)
const HOUR = 60 * 60 * 1000

const sourceNames = { 'nws-weather': 'NWS Little Rock', 'city-russellville': 'City of Russellville' }
const fetchedAt = { 'nws-weather': NOW - 40_000, 'city-russellville': NOW - 11 * 60 * 1000 }

const ingested = (over: Partial<IngestedNotice> = {}): IngestedNotice => ({
  id: 'nws-1',
  title: 'Tornado warning for Russellville and central Pope County until 11:45 pm',
  description: 'Take shelter now. Interior room, lowest floor, away from windows.',
  source: 'nws-weather',
  severity: 'emergency',
  isActive: true,
  createdAt: new Date(NOW - HOUR).toISOString(),
  updatedAt: new Date(NOW - HOUR).toISOString(),
  url: 'https://alerts.weather.gov',
  ...over,
})

describe('provenance is two shapes and never one', () => {
  it('carries the source, the fetch time and the page for an ingested notice', () => {
    const notice = toCivicNotice(ingested(), sourceNames, fetchedAt, NOW)
    expect(notice.provenance).toEqual({
      kind: 'ingested',
      sourceId: 'nws-weather',
      sourceName: 'NWS Little Rock',
      publishedAt: NOW - HOUR,
      fetchedAt: NOW - 40_000,
      url: 'https://alerts.weather.gov',
    })
  })

  it('carries the organisation and the staff handle for an authored one', () => {
    const notice = fromAuthored({
      id: 'c-1',
      title: 'Wednesday supper moves to 5:30 this week',
      body: 'The fellowship hall is being refinished, so supper is early and in the gym.',
      severity: 'informational',
      orgName: 'First United Methodist Church',
      handle: 'rev.tillman',
      publishedAt: NOW - HOUR,
    })
    expect(notice.provenance).toEqual({
      kind: 'authored',
      orgName: 'First United Methodist Church',
      handle: 'rev.tillman',
      postedAt: NOW - HOUR,
    })
    // No fetch time, because "when did you last check" is a question that only
    // means something about a source we poll.
    expect(notice.provenance).not.toHaveProperty('fetchedAt')
  })

  it('falls back to the raw source id rather than inventing a friendly name', () => {
    const notice = toCivicNotice(ingested({ source: 'some-new-scraper' }), sourceNames, {}, NOW)
    if (notice.provenance.kind !== 'ingested') throw new Error('expected ingested')
    expect(notice.provenance.sourceName).toBe('some-new-scraper')
  })

  it('translates the feed spelling on the way in', () => {
    const notice = toCivicNotice(ingested({ severity: 'warning' }), sourceNames, fetchedAt, NOW)
    expect(notice.severity).toBe('advisory')
  })
})

describe('the stream', () => {
  it('is empty when the town is quiet, which is most days', () => {
    // Not a failure state and not an error. Section 9 says the notice card is
    // not rendered at all on a normal day.
    expect(
      assembleNotices({ ingested: [], authored: [], sourceNames, fetchedAt, now: NOW }),
    ).toEqual([])
  })

  it('drops an expired notice rather than showing it struck through', () => {
    const live = assembleNotices({
      ingested: [ingested({ expires: new Date(NOW - 1000).toISOString() })],
      authored: [],
      sourceNames,
      fetchedAt,
      now: NOW,
    })
    expect(live).toHaveLength(0)
  })

  it('drops an inactive one', () => {
    const live = assembleNotices({
      ingested: [ingested({ isActive: false })],
      authored: [],
      sourceNames,
      fetchedAt,
      now: NOW,
    })
    expect(live).toHaveLength(0)
  })

  it('sorts loudest first, newest within a rung, across both origins', () => {
    const live = assembleNotices({
      ingested: [
        ingested({ id: 'a', severity: 'warning', createdAt: new Date(NOW - HOUR).toISOString() }),
        ingested({ id: 'b', severity: 'emergency' }),
      ],
      authored: [
        {
          id: 'c',
          title: 'Boil order north of Main',
          body: 'Rolling boil for one minute.',
          severity: 'urgent',
          orgName: 'Russellville Water Utility',
          handle: 'j.arnold',
          publishedAt: NOW - 2 * HOUR,
        },
      ],
      sourceNames,
      fetchedAt,
      now: NOW,
    })
    expect(live.map((n) => n.id)).toEqual(['b', 'c', 'a'])
  })
})

describe('the digest behind "hide until it changes"', () => {
  it('ignores a re-fetch that changed nothing a resident would notice', () => {
    const first = toCivicNotice(ingested(), sourceNames, { 'nws-weather': NOW - 60_000 }, NOW)
    const later = toCivicNotice(ingested(), sourceNames, { 'nws-weather': NOW }, NOW)
    expect(later.digest).toBe(first.digest)
  })

  it('changes when the source narrows the warning', () => {
    const first = toCivicNotice(ingested(), sourceNames, fetchedAt, NOW)
    const narrowed = toCivicNotice(
      ingested({ description: 'Warning narrowed to east of Highway 7.' }),
      sourceNames,
      fetchedAt,
      NOW,
    )
    expect(narrowed.digest).not.toBe(first.digest)
  })

  it('changes when the expiry moves, because that is the fact people act on', () => {
    const a = noticeDigest({ title: 't', detail: 'd', severity: 'urgent', expiresAt: NOW })
    const b = noticeDigest({ title: 't', detail: 'd', severity: 'urgent', expiresAt: NOW + HOUR })
    expect(a).not.toBe(b)
  })
})

describe('one resident, one stream', () => {
  const stream = () =>
    assembleNotices({ ingested: [ingested()], authored: [], sourceNames, fetchedAt, now: NOW })

  it('takes over for somebody who has not seen it', () => {
    const shown = presentFor(stream(), [], NOW - HOUR + 1000)
    expect(shown[0]!.presentation).toBe('takeover')
    expect(shown[0]!.seen).toBe(false)
  })

  it('is a bar for somebody who has', () => {
    const notices = stream()
    const shown = presentFor(
      notices,
      [{ noticeId: notices[0]!.id, seenAtDigest: notices[0]!.digest, hiddenAtDigest: null }],
      NOW,
    )
    expect(shown[0]!.presentation).toBe('bar')
  })

  it('is a line for somebody who hid it, until the source changes it', () => {
    const notices = stream()
    const hidden = [
      {
        noticeId: notices[0]!.id,
        seenAtDigest: notices[0]!.digest,
        hiddenAtDigest: notices[0]!.digest,
      },
    ]
    expect(presentFor(notices, hidden, NOW)[0]!.presentation).toBe('line')

    const updated = assembleNotices({
      ingested: [ingested({ description: 'Warning narrowed to east of Highway 7.' })],
      authored: [],
      sourceNames,
      fetchedAt,
      now: NOW,
    })
    // Hiding is not unsubscribing. Same notice, new words, straight back.
    expect(presentFor(updated, hidden, NOW - HOUR + 1000)[0]!.presentation).toBe('takeover')
  })
})
