import { describe, expect, it } from 'vitest'
import { assessPause, LADDER, pauseNotice } from './rate.js'

const NOW = Date.UTC(2026, 5, 8, 22, 0)
const HOUR = 60 * 60 * 1000
const DAY = 24 * HOUR

/** `n` contributions, one an hour, the most recent an hour ago. */
const spread = (n: number) => Array.from({ length: n }, (_, i) => NOW - (i + 1) * HOUR)

describe('the ladder', () => {
  it('says nothing at all below seven', () => {
    for (let n = 0; n <= LADDER.quiet; n++) {
      const state = assessPause(spread(n), n, NOW)
      expect(state.level).toBe('clear')
      expect(pauseNotice(state)).toBeNull()
    }
  })

  it('says one quiet line at seven, and stops nobody', () => {
    const state = assessPause(spread(7), 7, NOW)
    expect(state.level).toBe('noticed')
    expect(state.retryAt).toBeNull()
    expect(pauseNotice(state)).toBe('Eighth one today. No trouble, just so you know.')
  })

  it('pauses at nine', () => {
    expect(assessPause(spread(8), 8, NOW).level).toBe('noticed')
    expect(assessPause(spread(9), 9, NOW).level).toBe('paused')
  })

  it('lifts a day after the oldest one, not at midnight', () => {
    const counted = spread(9)
    const oldest = Math.min(...counted)
    expect(assessPause(counted, 9, NOW).retryAt).toBe(oldest + DAY)
  })

  it('rolls: anything older than a day is not in the window at all', () => {
    const counted = [...spread(4), NOW - DAY - HOUR, NOW - DAY - 2 * HOUR]
    expect(assessPause(counted, 6, NOW).count).toBe(4)
  })

  it('waits for the tenth-oldest when somebody is well past the limit', () => {
    // Twelve inside the window. Three have to fall out before publishing opens,
    // so the answer is the fourth-oldest plus a day.
    const counted = spread(12).sort((a, b) => a - b)
    const state = assessPause(counted, 12, NOW)
    expect(state.retryAt).toBe(counted[12 - LADDER.pause]! + DAY)
  })

  it('marks an escalation on attempts rather than on what got through', () => {
    // Nine landed and six more were refused. A limit measured only by
    // successes cannot see somebody hammering at it.
    expect(assessPause(spread(9), 9, NOW).escalated).toBe(false)
    expect(assessPause(spread(9), LADDER.escalate, NOW).escalated).toBe(true)
  })

  it('always says what still works, because that is the useful sentence', () => {
    const state = assessPause(spread(9), 9, NOW)
    expect(state.stillAllowed.join(' ')).toContain('Drafts still save')
    expect(state.stillAllowed.join(' ')).toContain('Corrections')
  })
})
