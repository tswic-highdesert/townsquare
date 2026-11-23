/**
 * Everything the calendar knows about "now".
 *
 * This lives on the client on purpose, and the purpose is the one thing the
 * designer says out loud about the now line: *"now" on a screen someone left
 * open for an hour is a lie.* The API is cached for a minute and its payload
 * carries only absolute instants; a server-rendered "in 31 min" is already
 * wrong when it arrives and absurd by the time somebody looks up from their
 * phone. So the server states facts and this module states the moment.
 *
 * It is a plain module with no React in it because it is where the date bugs
 * live, and a date bug found by a unit test is cheaper than one found by a
 * neighbour standing outside a library that closed an hour ago.
 */

import { intlLocale, t, tn } from '../i18n/index.js'

/** The shape this module needs. `EventRow` from the API satisfies it. */
export interface Timed {
  startsAt: string
  endsAt: string | null
  allDay: boolean
}

export type RowState = 'done' | 'now' | 'soon' | 'upcoming' | 'allday'

/** How far ahead counts as "soon". An hour: long enough to still leave. */
export const SOON_MS = 60 * 60 * 1000

/**
 * Where a row sits relative to this minute.
 *
 * The all-day case is the trap and it is the first branch. An all-day entry
 * stores a midnight start, so the ordinary "has it finished" test — start is in
 * the past, no end — marks every one of them done at 12:01am, on the one screen
 * whose job is to say what is on today. An all-day entry is true until the day
 * is over, and the day it belongs to is the server's decision, not this
 * module's: if the row is on the screen, its day is current.
 */
export function rowState(row: Timed, nowMs: number): RowState {
  if (row.allDay) return 'allday'

  const start = Date.parse(row.startsAt)
  const end = row.endsAt ? Date.parse(row.endsAt) : null

  if (end !== null && nowMs >= end) return 'done'
  if (end !== null && nowMs >= start) return 'now'
  // No published end time, which is 40% of the feed. A thing that started is
  // running until something says otherwise; guessing a length would be the same
  // invention as guessing an end time on the row itself.
  if (end === null && nowMs >= start) return 'now'
  if (start - nowMs <= SOON_MS) return 'soon'
  return 'upcoming'
}

/**
 * `in 31 min`, `on now`, `in 3 hr`, or nothing.
 *
 * Nothing is the common case, and that is deliberate: a chip on every row is a
 * chip nobody reads. It appears only where it changes what a resident does in
 * the next hour.
 */
export function relativeLabel(row: Timed, nowMs: number): string | null {
  const state = rowState(row, nowMs)
  if (state === 'now') return t('on now')
  if (state !== 'soon') return null

  const minutes = Math.round((Date.parse(row.startsAt) - nowMs) / 60_000)
  if (minutes <= 0) return t('starting now')
  if (minutes === 1) return t('in a minute')
  return t('in {minutes} min', { minutes })
}

/**
 * How long ago something started, for a row that is already running.
 *
 * "Started 25 minutes ago" is the answer to a real question — is it worth
 * going — in a way that "on now" alone is not.
 */
export function startedLabel(row: Timed, nowMs: number): string | null {
  if (rowState(row, nowMs) !== 'now') return null
  const minutes = Math.round((nowMs - Date.parse(row.startsAt)) / 60_000)
  if (minutes < 1) return t('just started')
  if (minutes < 60) return t('started {minutes} min ago', { minutes })
  const hours = Math.round(minutes / 60)
  return hours === 1 ? t('started an hour ago') : t('started {hours} hr ago', { hours })
}

/**
 * The rows that have already finished, split off the front of the list.
 *
 * They collapse, they do not disappear. Three events that already happened are
 * still the answer to "did I miss it", which is a question this screen is asked
 * constantly. Only a leading run is taken: a finished thing sitting between two
 * upcoming ones stays where it is, because pulling it out of sequence would
 * break the one property the agenda has, which is that it reads down the day.
 */
export function splitEarlier<T extends Timed>(
  rows: readonly T[],
  nowMs: number,
): { earlier: T[]; rest: T[] } {
  let cut = 0
  while (cut < rows.length) {
    const row = rows[cut]
    if (!row || rowState(row, nowMs) !== 'done') break
    cut += 1
  }
  return { earlier: rows.slice(0, cut), rest: rows.slice(cut) }
}

/**
 * Which row the now line sits above, or null.
 *
 * A list item in document order, never an overlay: it is announced in reading
 * order and it can never land on top of a title. Null when everything on the
 * day is still ahead or all of it is behind, because a now line at the very top
 * or the very bottom of a list is a rule pretending to be information.
 */
export function nowLineIndex(rows: readonly Timed[], nowMs: number): number | null {
  const timed = rows.filter((r) => !r.allDay)
  if (timed.length === 0) return null

  const index = rows.findIndex((r) => !r.allDay && Date.parse(r.startsAt) > nowMs)
  if (index <= 0) return null

  const previous = rows.slice(0, index).filter((r) => !r.allDay).pop()
  if (!previous || Date.parse(previous.startsAt) > nowMs) return null
  return index
}

/**
 * `2:14 pm` in the town's timezone.
 *
 * Through `Intl` with the town's zone, and not the browser's, for exactly the
 * reason the server does it: a resident travelling for work opening the town's
 * calendar should see the town's clock. A now line reading 8:14 pm beside a
 * 5:30 council meeting is a screen arguing with itself.
 */
export function townClock(nowMs: number, timezone: string): string {
  const text = new Intl.DateTimeFormat(intlLocale(), {
    timeZone: timezone,
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).format(new Date(nowMs))
  return text.toLowerCase()
}

/**
 * A town day (`YYYY-MM-DD`) in the reader's language. Midday UTC is the safe
 * hour to format a bare date, the same one the API uses.
 */
export function dayText(day: string, opts: Intl.DateTimeFormatOptions): string {
  return new Intl.DateTimeFormat(intlLocale(), { timeZone: 'UTC', ...opts }).format(new Date(`${day}T12:00:00Z`))
}

/** `miércoles, 5 de agosto`: a weekday with its date. */
export function longDay(day: string): string {
  return dayText(day, { weekday: 'long', day: 'numeric', month: 'long' })
}

/** Spanish writes weekdays and months in lower case; a label that opens with one does not. */
export function capitalize(text: string): string {
  return text.charAt(0).toLocaleUpperCase(intlLocale()) + text.slice(1)
}

/** The count half of a day's spoken label: `nothing on`, `3 things on`. */
export function dayCount(count: number): string {
  return count === 0 ? t('nothing on') : tn(count, '{count} thing on', '{count} things on')
}

/** Whole days from `a` to `b`, both town days. Positive when `b` is later. */
export function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000)
}
