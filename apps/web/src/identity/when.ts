/**
 * Time, in the words a moderator reads it in.
 *
 * Both of these are coarse on purpose. A queue row saying "waiting 2 days" is a
 * moderator deciding what to open next; "waiting 2 days, 4 hours, 11 minutes"
 * is the same decision with more to read and no more information in it.
 *
 * Pure, and taking `now` as an argument, so the rounding can be argued about in
 * a test rather than by watching a clock.
 */

import { intlLocale, t, tn } from '../i18n/index.js'

const HOUR = 60 * 60 * 1000

export function waited(since: number, now: number = Date.now()): string {
  const hours = Math.floor((now - since) / HOUR)
  // Anything under an hour is "just now" to a person, and a queue that counted
  // minutes would be a queue that redraws while you read it.
  if (hours < 1) return t('waiting under an hour')
  if (hours < 24) return tn(hours, 'waiting {count} hour', 'waiting {count} hours')
  const days = Math.round(hours / 24)
  return tn(days, 'waiting {count} day', 'waiting {count} days')
}

/**
 * A date, spelled out.
 *
 * No year: everything a moderator is looking at happened recently, and a year
 * on every row is four characters of noise on all of them to be correct about
 * the one that is old. No time either — the hour something was reported is not
 * a thing anybody acts on.
 */
export function onDay(at: number): string {
  return new Date(at).toLocaleDateString(intlLocale(), { day: 'numeric', month: 'long' })
}
