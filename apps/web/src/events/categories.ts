/**
 * The four tints, and what carries each of them besides colour.
 *
 * Four buckets, not forty. The value of tinting an event at all is instant
 * scanning, and that dies the moment there are enough categories that two of
 * them look alike. The buckets themselves are decided server side by
 * `categorize` in `apps/api/src/today.ts`, which is deliberately narrow: a
 * category that is wrong is worse than no category, because the tint exists so
 * a resident can skip what they do not care about and one that misfires teaches
 * them to stop trusting all four.
 *
 * Every category has a glyph and a word as well as a tint, so colour is never
 * the only carrier of the meaning.
 */

import type { IconName } from '../Icon.js'
import type { EventCategory } from './eventsData.js'

export const CATEGORY_ICON: Record<EventCategory, IconName> = {
  civic: 'gavel',
  music: 'music',
  sport: 'sport',
  community: 'users',
}

export const CATEGORY_WORD: Record<EventCategory, string> = {
  civic: 'Civic',
  music: 'Music',
  sport: 'Sport',
  community: 'Community',
}
