/**
 * The Spanish dictionary, one file per area of the shell so two people
 * translating two screens never edit the same file.
 *
 * Each area exports `strings` (English source to Spanish) and `review`
 * (English source to a note for a native speaker). A string lands in `review`
 * when it is idiomatic, carries a civic or legal meaning, or sets the shell's
 * tone, and a fluent reader should confirm it before a city relies on it.
 * A key may appear in two areas only with the same translation; `i18n.test.ts`
 * fails on two areas disagreeing, and on a review note for a key that is not
 * translated.
 */

import type { Entry } from '../index.js'
import * as shell from './shell.js'
import * as today from './today.js'
import * as directory from './directory.js'
import * as events from './events.js'
import * as creations from './creations.js'
import * as contribute from './contribute.js'
import * as identity from './identity.js'
import * as moderation from './review.js'

export const AREAS: Record<string, { strings: Record<string, Entry>; review: Record<string, string> }> = {
  shell,
  today,
  directory,
  events,
  creations,
  contribute,
  identity,
  review: moderation,
}

export const es: Record<string, Entry> = Object.assign({}, ...Object.values(AREAS).map((area) => area.strings))

export const review: Record<string, string> = Object.assign({}, ...Object.values(AREAS).map((area) => area.review))
