import { describe, expect, it } from 'vitest'
import { waited } from './when.js'

const HOUR = 60 * 60 * 1000
const NOW = Date.UTC(2026, 7, 5, 12, 0, 0)

describe('waited', () => {
  it('does not count minutes', () => {
    expect(waited(NOW - 20 * 60 * 1000, NOW)).toBe('waiting under an hour')
  })

  it('singularises one hour and one day', () => {
    expect(waited(NOW - HOUR, NOW)).toBe('waiting 1 hour')
    expect(waited(NOW - 24 * HOUR, NOW)).toBe('waiting 1 day')
  })

  it('stays in hours right up to a day', () => {
    expect(waited(NOW - 23 * HOUR, NOW)).toBe('waiting 23 hours')
  })

  /**
   * Rounds rather than truncates, which is the whole reason this is not one
   * line of `Math.floor`. A submission that has been in the queue for 47 hours
   * has been waiting two days by any reading a person would give it, and
   * "waiting 1 day" on it understates the one number the row exists to carry.
   */
  it('rounds to the day a person would say', () => {
    expect(waited(NOW - 47 * HOUR, NOW)).toBe('waiting 2 days')
    expect(waited(NOW - 30 * HOUR, NOW)).toBe('waiting 1 day')
  })
})
