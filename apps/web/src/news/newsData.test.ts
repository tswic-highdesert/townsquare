/**
 * The staleness rule behind the news banner.
 *
 * It runs in the browser rather than the API because it is a question about
 * elapsed time, and the answer changes while a tab sits open with nobody
 * touching it. That does not make it any less the business logic of the
 * screen, so it is tested as a pure function, the same way `rankPlaces` and
 * `assembleToday` are.
 *
 * What is being pinned here is the one thing the banner exists to prevent:
 * stale news shown as if it were current. The threshold is deliberately well
 * inside the API's one-minute cache, so crossing it means a build actually
 * failed rather than that a refresh is merely due.
 */

import { describe, expect, it } from 'vitest'
import { isStale, STALE_AFTER_MS } from './newsData.js'

const NOW = Date.parse('2026-08-05T20:00:00.000Z')
const ago = (ms: number) => new Date(NOW - ms).toISOString()

describe('isStale', () => {
  it('is quiet on a payload a healthy API would produce', () => {
    // The route caches for a minute, so anything inside that is normal.
    expect(isStale(ago(0), NOW)).toBe(false)
    expect(isStale(ago(60_000), NOW)).toBe(false)
    expect(isStale(ago(9 * 60_000), NOW)).toBe(false)
  })

  it('speaks up once the age can only mean a build failed', () => {
    expect(isStale(ago(STALE_AFTER_MS + 1000), NOW)).toBe(true)
    expect(isStale(ago(60 * 60_000), NOW)).toBe(true)
  })

  it('does not fire exactly on the threshold', () => {
    // Ten minutes is the last honest moment, not the first dishonest one.
    expect(isStale(ago(STALE_AFTER_MS), NOW)).toBe(false)
    expect(isStale(ago(STALE_AFTER_MS + 1), NOW)).toBe(true)
  })

  it('stays quiet when the browser clock is behind the server’s', () => {
    // Skew between a phone and the API is normal and is not an outage. A
    // negative age must never be read as a very old payload.
    expect(isStale(ago(-30 * 60_000), NOW)).toBe(false)
  })

  it('says nothing rather than something wrong about an unreadable date', () => {
    // A banner claiming an outage because a field did not parse is a worse
    // failure than a banner that never appears.
    expect(isStale('not a date', NOW)).toBe(false)
    expect(isStale('', NOW)).toBe(false)
  })
})
