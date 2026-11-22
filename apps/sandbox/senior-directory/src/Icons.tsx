/**
 * A picture for every listing. Seniors have told us cards with an image are
 * easier to scan, so each card and need tile gets one.
 *
 * Inline SVG, drawn here, rather than photos: a creation may only load images
 * from hosts its manifest declares, and listings have no photos to load. Each
 * need has an icon; a few kinds of place get a more specific one (an eye
 * clinic shows an eye, not a tooth).
 */

import type { ReactElement } from 'react'
import type { DirectoryEntry } from './data/directory.js'
import type { NeedId } from './data/needs.js'

export type IconName =
  | 'house'
  | 'heart'
  | 'bell'
  | 'brain'
  | 'cross'
  | 'stretch'
  | 'tooth'
  | 'eye'
  | 'pill'
  | 'coin'
  | 'hall'
  | 'shield'
  | 'bag'
  | 'flower'

const NEED_ICON: Record<NeedId, IconName> = {
  living: 'house',
  home: 'heart',
  memory: 'brain',
  doctors: 'cross',
  therapy: 'stretch',
  'teeth-eyes': 'tooth',
  pharmacy: 'pill',
  money: 'coin',
  community: 'hall',
  everyday: 'bag',
  farewell: 'flower',
}

/** More specific pictures inside a need, tried before the need's own icon. */
const OVERRIDES: Array<[RegExp, IconName]> = [
  [/\beye|optom|vision/i, 'eye'],
  [/alarm/i, 'bell'],
  [/police|sheriff/i, 'shield'],
]

export function iconForNeed(need: NeedId): IconName {
  return NEED_ICON[need]
}

export function iconForEntry(e: Pick<DirectoryEntry, 'name' | 'category' | 'need'>): IconName {
  const text = `${e.name} ${e.category}`
  for (const [re, icon] of OVERRIDES) if (re.test(text)) return icon
  return NEED_ICON[e.need]
}

/** 24×24 line drawings, stroked in currentColor. */
const PATHS: Record<IconName, ReactElement> = {
  house: (
    <>
      <path d="M3 11.5 12 4l9 7.5" />
      <path d="M5.5 9.5V20h13V9.5" />
      <path d="M10 20v-5.5h4V20" />
    </>
  ),
  heart: (
    <path d="M12 20s-7.5-4.6-7.5-10A4.3 4.3 0 0 1 12 7.4 4.3 4.3 0 0 1 19.5 10c0 5.4-7.5 10-7.5 10Z" />
  ),
  bell: (
    <>
      <path d="M6 16.5V11a6 6 0 0 1 12 0v5.5l1.5 2h-15Z" />
      <path d="M10 20.5a2 2 0 0 0 4 0" />
    </>
  ),
  brain: (
    <>
      <path d="M12 5.5v13" />
      <path d="M12 5.5A3 3 0 0 0 6.6 6 3 3 0 0 0 4.5 10a3 3 0 0 0 .6 4.5A3 3 0 0 0 8 19a2.9 2.9 0 0 0 4-.5" />
      <path d="M12 5.5A3 3 0 0 1 17.4 6a3 3 0 0 1 2.1 4 3 3 0 0 1-.6 4.5A3 3 0 0 1 16 19a2.9 2.9 0 0 1-4-.5" />
      <path d="M8.5 9.5c1 .2 1.8 1 2 2M7.5 14c1.2-.4 2.5 0 3 1M15.5 9.5c-1 .2-1.8 1-2 2M16.5 14c-1.2-.4-2.5 0-3 1" />
    </>
  ),
  cross: (
    <>
      <rect x="3.5" y="3.5" width="17" height="17" rx="4" />
      <path d="M12 8v8M8 12h8" />
    </>
  ),
  stretch: (
    <>
      <circle cx="12" cy="4.8" r="1.8" />
      <path d="M5 9.5 12 8l7 1.5" />
      <path d="M12 8v6l-3 6M12 14l3 6" />
    </>
  ),
  tooth: (
    <path d="M12 6.2C10.3 4.6 6 3.8 5.2 7.5c-.5 2.4.6 4 1.1 6.4.5 2.5.6 6.1 2.2 6.1 1.5 0 1.6-4.8 3.5-4.8s2 4.8 3.5 4.8c1.6 0 1.7-3.6 2.2-6.1.5-2.4 1.6-4 1.1-6.4C18 3.8 13.7 4.6 12 6.2Z" />
  ),
  eye: (
    <>
      <path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z" />
      <circle cx="12" cy="12" r="3" />
    </>
  ),
  pill: (
    <>
      <rect x="2.8" y="8.2" width="18.4" height="7.6" rx="3.8" transform="rotate(-45 12 12)" />
      <path d="m9.3 9.3 5.4 5.4" />
    </>
  ),
  coin: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M14.8 9.2c-.4-1-1.5-1.6-2.8-1.6-1.6 0-2.8.8-2.8 2.1 0 2.9 5.8 1.6 5.8 4.6 0 1.3-1.3 2.1-3 2.1-1.4 0-2.6-.6-3-1.7M12 6v1.6M12 16.4V18" />
    </>
  ),
  hall: (
    <>
      <path d="M3.5 9 12 4l8.5 5Z" />
      <path d="M6 9.5v8M10 9.5v8M14 9.5v8M18 9.5v8M3.5 20h17" />
    </>
  ),
  shield: (
    <>
      <path d="M12 3.5 19 6v5.5c0 4.4-3 7.6-7 9-4-1.4-7-4.6-7-9V6Z" />
      <path d="m9 12 2 2 4-4" />
    </>
  ),
  bag: (
    <>
      <path d="M5 8h14l-1 12H6Z" />
      <path d="M9 10V7a3 3 0 0 1 6 0v3" />
    </>
  ),
  flower: (
    <>
      <path d="M12 21v-8" />
      <path d="M12 13c-3.5 0-5.5-2.5-5.5-6.5 2 0 3.5.8 4.3 2L12 4l1.2 4.5c.8-1.2 2.3-2 4.3-2 0 4-2 6.5-5.5 6.5Z" />
      <path d="M12 17.5c-1.6-1.8-3.6-2.3-5.5-2 .5 2.3 2.6 3.6 5.5 3.5M12 17.5c1.6-1.8 3.6-2.3 5.5-2-.5 2.3-2.6 3.6-5.5 3.5" />
    </>
  ),
}

export function Icon({ name, size = 28 }: { name: IconName; size?: number }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {PATHS[name]}
    </svg>
  )
}
