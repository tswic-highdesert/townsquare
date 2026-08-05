import { describe, expect, it } from 'vitest'
import { whenUsed } from './connectApi.js'

/**
 * Last used is the field a resident actually decides on, so it has to be right
 * at the boundaries rather than approximately right in the middle.
 */
describe('whenUsed', () => {
  const now = Date.parse('2026-08-05T12:00:00Z')
  const ago = (ms: number) => new Date(now - ms).toISOString()

  it('says a token has never been used rather than leaving the field blank', () => {
    // A blank here reads as "we do not know", and the honest answer — nothing
    // has ever authenticated with this — is the one that makes it safe to kill.
    expect(whenUsed(null, now)).toBe('Never used')
  })

  it('counts in the units a person thinks in', () => {
    expect(whenUsed(ago(30_000), now)).toBe('Used just now')
    expect(whenUsed(ago(60_000), now)).toBe('Used 1 minute ago')
    expect(whenUsed(ago(14 * 60_000), now)).toBe('Used 14 minutes ago')
    expect(whenUsed(ago(2 * 3_600_000), now)).toBe('Used 2 hours ago')
    expect(whenUsed(ago(6 * 86_400_000), now)).toBe('Used 6 days ago')
  })
})
