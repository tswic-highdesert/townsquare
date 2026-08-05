import { describe, expect, it } from 'vitest'
import { readWhen } from './when.js'

const TZ = 'America/Chicago'
/** Monday 8 June 2026, 10am in Russellville. */
const NOW = Date.UTC(2026, 5, 8, 15, 0)

const read = (text: string) => readWhen(text, { timezone: TZ, now: NOW })

describe('reading a time the way somebody would say it', () => {
  it('says nothing about an empty field', () => {
    expect(read('   ')).toEqual({ kind: 'empty' })
  })

  it('reads a month, a day and a time, and spells the weekday out', () => {
    const result = read('sat june 14 at 7pm')
    expect(result.kind).toBe('ok')
    if (result.kind !== 'ok') return
    // 14 June 2026 is a Sunday. The weekday somebody typed is not trusted over
    // the date they typed, and spelling it out is what lets them see that.
    expect(result.reading.label).toBe('Sunday 14 June, 7pm')
  })

  it('reads the day and month in either order', () => {
    const a = read('june 14 at 7pm')
    const b = read('14 june at 7pm')
    expect(a.kind).toBe('ok')
    expect(b.kind).toBe('ok')
    if (a.kind !== 'ok' || b.kind !== 'ok') return
    expect(a.reading.startsAt).toBe(b.reading.startsAt)
  })

  it('keeps both readings when an hour has no meridiem, and picks neither', () => {
    const result = read('friday at 7')
    expect(result.kind).toBe('ambiguous')
    if (result.kind !== 'ambiguous') return
    expect(result.readings.map((r) => r.label)).toEqual([
      'Friday 12 June, 7am',
      'Friday 12 June, 7pm',
    ])
  })

  it('lets a part of the day settle the meridiem without guessing', () => {
    const morning = read('saturday at 7 in the morning')
    const evening = read('saturday at 7 in the evening')
    expect(morning.kind).toBe('ok')
    expect(evening.kind).toBe('ok')
    if (morning.kind !== 'ok' || evening.kind !== 'ok') return
    expect(morning.reading.label).toContain('7am')
    expect(evening.reading.label).toContain('7pm')
  })

  it('reads today, tonight and tomorrow', () => {
    expect(read('tonight at 6pm').kind).toBe('ok')
    const tomorrow = read('tomorrow at 6pm')
    expect(tomorrow.kind).toBe('ok')
    if (tomorrow.kind !== 'ok') return
    expect(tomorrow.reading.label).toBe('Tuesday 9 June, 6pm')
  })

  it('takes "next thursday" as the one after the coming one', () => {
    const coming = read('thursday at 6pm')
    const next = read('next thursday at 6pm')
    expect(coming.kind).toBe('ok')
    expect(next.kind).toBe('ok')
    if (coming.kind !== 'ok' || next.kind !== 'ok') return
    expect(coming.reading.label).toBe('Thursday 11 June, 6pm')
    expect(next.reading.label).toBe('Thursday 18 June, 6pm')
  })

  it('keeps minutes', () => {
    const result = read('june 14 at 6:30pm')
    expect(result.kind).toBe('ok')
    if (result.kind !== 'ok') return
    expect(result.reading.label).toBe('Sunday 14 June, 6:30pm')
  })

  it('asks for a time when it found a day and no clock', () => {
    const result = read('saturday morning')
    expect(result.kind).toBe('needs_time')
    if (result.kind !== 'needs_time') return
    expect(result.dayLabel).toBe('Saturday 13 June')
  })

  it('gives up honestly, and keeps the words that were typed', () => {
    const result = read('sometime around the fair')
    expect(result).toEqual({ kind: 'unreadable', text: 'sometime around the fair' })
  })

  it('answers in the town timezone, not the one the server booted in', () => {
    const result = read('june 14 at 7pm')
    if (result.kind !== 'ok') throw new Error('expected a reading')
    // 7pm CDT on 14 June 2026 is midnight UTC on the 15th.
    expect(new Date(result.reading.startsAt).toISOString()).toBe('2026-06-15T00:00:00.000Z')
  })

  it('survives the spring forward, which one offset pass does not', () => {
    // 8 March 2026 is the US spring change. An event at 3pm that afternoon is
    // CDT, not CST, and a single-pass conversion is an hour out.
    const result = readWhen('march 8 at 3pm', {
      timezone: TZ,
      now: Date.UTC(2026, 1, 1, 12, 0),
    })
    if (result.kind !== 'ok') throw new Error('expected a reading')
    expect(new Date(result.reading.startsAt).toISOString()).toBe('2026-03-08T20:00:00.000Z')
  })
})
