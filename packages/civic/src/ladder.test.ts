import { describe, expect, it } from 'vitest'
import {
  decayFor,
  fromFeedSeverity,
  heldByQuietHours,
  LADDER,
  rank,
  reaches,
  SEVERITIES,
  TAKEOVER_MINUTES,
} from './ladder.js'

describe('the ladder', () => {
  it('has four rungs, in order, quietest first', () => {
    expect(SEVERITIES).toEqual(['informational', 'advisory', 'urgent', 'emergency'])
    expect(rank('informational')).toBeLessThan(rank('advisory'))
    expect(rank('advisory')).toBeLessThan(rank('urgent'))
    expect(rank('urgent')).toBeLessThan(rank('emergency'))
  })

  it('lets only three of the four rungs reach a lock screen', () => {
    // The single most load-bearing decision in section 9. A leaf pickup
    // schedule and a planning agenda are things you go and look at.
    const pushes = SEVERITIES.filter((s) => LADDER[s].pushes)
    expect(pushes).toEqual(['advisory', 'urgent', 'emergency'])
  })

  it('gives exactly one rung the power to break through silent', () => {
    const breaks = SEVERITIES.filter((s) => LADDER[s].breaksThroughSilent)
    expect(breaks).toEqual(['emergency'])
  })

  it('states each consequence in physical terms rather than policy terms', () => {
    // The copy is the definition: "wakes up a phone" is checkable, "high
    // priority" is not, and a rung nobody can picture is a rung nobody obeys.
    expect(LADDER.informational.consequence).toContain('No phone makes a sound')
    expect(LADDER.emergency.consequence).toContain('cannot be turned off')
  })
})

describe('the feed spelling, translated once', () => {
  it('maps the feed onto the same four rungs', () => {
    expect(fromFeedSeverity('emergency')).toBe('emergency')
    expect(fromFeedSeverity('urgent')).toBe('urgent')
    expect(fromFeedSeverity('warning')).toBe('advisory')
    expect(fromFeedSeverity('info')).toBe('informational')
  })

  it('rounds an unrecognised value down, never up', () => {
    // A scraper emitting something nobody anticipated must not be able to wake
    // the town up. Lossy in the safe direction, and the resident can raise
    // their own threshold.
    expect(fromFeedSeverity('catastrophic')).toBe('informational')
    expect(fromFeedSeverity(undefined)).toBe('informational')
    expect(fromFeedSeverity(null)).toBe('informational')
    expect(fromFeedSeverity('')).toBe('informational')
  })
})

describe('who a notice reaches', () => {
  it('respects a threshold', () => {
    expect(reaches('advisory', 'urgent')).toBe(false)
    expect(reaches('urgent', 'urgent')).toBe(true)
  })

  it('ignores the threshold entirely for an emergency', () => {
    // Including the loudest possible setting, which is the case somebody would
    // otherwise get right by accident and then break.
    expect(reaches('emergency', 'emergency')).toBe(true)
    expect(reaches('emergency', 'urgent')).toBe(true)
    expect(reaches('emergency', 'informational')).toBe(true)
  })

  it('holds everything but an emergency during quiet hours', () => {
    expect(heldByQuietHours('advisory')).toBe(true)
    expect(heldByQuietHours('urgent')).toBe(true)
    expect(heldByQuietHours('emergency')).toBe(false)
  })
})

describe('how urgency decays', () => {
  const base = { severity: 'urgent' as const, ageMs: 0, seen: false }

  it('takes over on arrival, and only for the rungs that take over', () => {
    expect(decayFor(base)).toBe('takeover')
    expect(decayFor({ ...base, severity: 'emergency' })).toBe('takeover')
    expect(decayFor({ ...base, severity: 'advisory' })).toBe('bar')
    expect(decayFor({ ...base, severity: 'informational' })).toBe('card')
  })

  it('collapses to a bar once it has been seen', () => {
    expect(decayFor({ ...base, seen: true })).toBe('bar')
  })

  it('collapses to a bar after half an hour even if nobody looked', () => {
    // A takeover on day one is right. A takeover on day three is an app you
    // delete, and the four-day river is what actually kills emergency design.
    expect(decayFor({ ...base, ageMs: TAKEOVER_MINUTES * 60_000 - 1 })).toBe('takeover')
    expect(decayFor({ ...base, ageMs: TAKEOVER_MINUTES * 60_000 + 1 })).toBe('bar')
  })

  it('stays hidden while the notice is unchanged', () => {
    expect(
      decayFor({ ...base, hiddenAtDigest: 'abc', digest: 'abc' }),
    ).toBe('line')
  })

  it('comes straight back the moment the source changes it', () => {
    // This is what "hide this until it changes" promises, and it is the reason
    // the dismissal is safe to offer on an emergency at all.
    expect(
      decayFor({ ...base, hiddenAtDigest: 'abc', digest: 'def' }),
    ).toBe('takeover')
  })
})
