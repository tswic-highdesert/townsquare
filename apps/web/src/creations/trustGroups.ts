/**
 * The trust page, arranged by consequence rather than by capability.
 *
 * `describeManifest` in `@townsquare/host` already turns a frozen manifest into
 * plain English, and that property — every line derived from the manifest, none
 * of it from anything the creation says about itself — is the whole reason a
 * creation cannot write its own trust page. Nothing here weakens it: this file
 * only *sorts* those lines and counts them. It never adds a line, never edits
 * one, and takes the manifest as its only input.
 *
 * Two groups get the terracotta inset and sit at the top: what outlives the
 * visit, and what leaves town. Everything else is true of nearly every creation
 * and reads as background reassurance, which is exactly what it is.
 *
 * The tally is the load-bearing part. It makes the sheet skimmable without
 * making it skippable: a resident who reads one line reads the count, and the
 * count is generated from the same fields as the list under it, so it cannot
 * drift from what the list says.
 */

import { describeManifest, type TrustLine } from '@townsquare/host'
import type { Manifest } from '@townsquare/manifest'
import { getLocale, t, tn } from '../i18n/index.js'

/** How loudly the tally reads. Never brick: see the note on `tone` below. */
export type TrustTone = 'calm' | 'notable' | 'heavy'

export interface TrustGroup {
  /** The mono eyebrow above the group. */
  title: string
  lines: TrustLine[]
}

export interface TrustSummary {
  tone: TrustTone
  /** One sentence, counted from the manifest, shown above the groups. */
  tally: string
  /** Only groups with something in them. An empty group is a heading about nothing. */
  groups: TrustGroup[]
  /**
   * Whether the resident should be offered a way out beside the way in.
   *
   * A demanding manifest is a judgement call, not an emergency, so what it
   * earns is a second button and a sentence saying it is fine to walk away —
   * not a warning colour. Making this screen frightening would teach residents
   * to fear the trust sheet rather than read it, and it is only useful if they
   * read it every time.
   */
  counsel: boolean
}

/** Three or more things beyond the visit is where a resident should slow down. */
const HEAVY_AT = 3

const LEAVES_VISIT: ReadonlySet<TrustLine['kind']> = new Set(['writes_records'])
const LEAVES_TOWN: ReadonlySet<TrustLine['kind']> = new Set(['network'])

export function summariseTrust(manifest: Manifest): TrustSummary {
  const lines = describeManifest(manifest)

  const groups: TrustGroup[] = [
    { title: t('Leaves the visit'), lines: lines.filter((l) => LEAVES_VISIT.has(l.kind)) },
    { title: t('Leaves town'), lines: lines.filter((l) => LEAVES_TOWN.has(l.kind)) },
    {
      title: t('Background'),
      lines: lines.filter((l) => !LEAVES_VISIT.has(l.kind) && !LEAVES_TOWN.has(l.kind)),
    },
  ].filter((g) => g.lines.length > 0)

  // Counted off the manifest, not off the lines: `describeManifest` folds four
  // record types into one sentence, and "one thing" would then be a true
  // sentence about a list and a false one about the town.
  const writes = manifest.permissions.write.length
  const hosts = manifest.permissions.network.length
  const total = writes + hosts

  if (total === 0) {
    return {
      tone: 'calm',
      tally: t('Nothing here leaves the visit or leaves town.'),
      groups,
      counsel: false,
    }
  }

  const heavy = total >= HEAVY_AT
  return {
    tone: heavy ? 'heavy' : 'notable',
    tally: tally(writes, hosts, heavy),
    groups,
    counsel: heavy,
  }
}

function tally(writes: number, hosts: number, heavy: boolean): string {
  const more = heavy ? ` ${t('That is more than most.')}` : ''

  if (writes > 0 && hosts > 0) {
    const total = writes + hosts
    const sentence = tn(
      hosts,
      '{total} things here outlive the visit, and {hosts} of them leave town.',
      '{total} things here outlive the visit, and {hosts} of them leave town.',
      { total: cap(count(total)), hosts: count(hosts) },
    )
    return `${sentence}${more}`
  }
  if (writes > 0) {
    return writes === 1
      ? `${t('One thing here outlives the visit. It is marked.')}${more}`
      : `${t('{total} things here outlive the visit. They are marked.', { total: cap(count(writes)) })}${more}`
  }
  return hosts === 1
    ? `${t('One thing here leaves town. It is marked.')}${more}`
    : `${t('{total} things here leave town. They are marked.', { total: cap(count(hosts)) })}${more}`
}

/**
 * Small counts as words.
 *
 * "3 things here outlive the visit" reads as a metric on a dashboard; "Three
 * things" reads as a person telling you something, which is the voice the rest
 * of this screen is written in.
 */
const WORDS = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten']
// Feminine, to agree with "cosas" in the Spanish tally.
const WORDS_ES = ['cero', 'una', 'dos', 'tres', 'cuatro', 'cinco', 'seis', 'siete', 'ocho', 'nueve', 'diez']

export function count(n: number): string {
  return (getLocale() === 'es' ? WORDS_ES[n] : WORDS[n]) ?? String(n)
}

function cap(word: string): string {
  return word.charAt(0).toUpperCase() + word.slice(1)
}
