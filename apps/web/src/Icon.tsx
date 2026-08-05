/**
 * The shell's icons, drawn here rather than fetched.
 *
 * `design/hifi` uses Material Symbols, which is a ~3.5MB variable font. Neither
 * way of getting it is acceptable: a Google Fonts link puts a third party in the
 * load path of the town's home screen and would need a `font-src` hole that
 * `packages/tokens` deliberately does not have, and vendoring the whole family
 * to draw sixteen glyphs is worse. Subsetting it properly needs a build step
 * that does not exist yet — when it does, this file is the thing to delete.
 *
 * Until then: one coherent stroked set on a 24px grid, sized and coloured by
 * `currentColor` so a caller styles it like text. This is a deliberate,
 * documented deviation from the hi-fi's icon style, and the only one.
 */

export type IconName =
  | 'add'
  | 'arrow-out'
  | 'bag'
  | 'bookmark'
  | 'bookmarks'
  | 'calendar'
  | 'chevron-right'
  | 'clock'
  | 'compass'
  | 'cutlery'
  | 'document'
  | 'gavel'
  | 'group'
  | 'heartbeat'
  | 'home'
  | 'leaf'
  | 'music'
  | 'newspaper'
  | 'pin'
  | 'search'
  | 'sport'
  | 'storefront'
  | 'target'
  | 'toolbox'
  | 'verified'
  | 'warning'

/**
 * Every path is drawn in a 24×24 box and stroked, never filled.
 *
 * Mixing filled and stroked glyphs is what makes a hand-rolled set look
 * hand-rolled. One weight, one join, one grid.
 */
const PATHS: Record<IconName, string> = {
  add: 'M12 5v14M5 12h14',
  'arrow-out': 'M7 17 17 7M9 7h8v8',
  bag: 'M5 8h14l1 12H4zM9 8V6.2a3 3 0 0 1 6 0V8',
  /**
   * Saved is a colour, not a fill.
   *
   * The obvious way to show a bookmark is set is to fill it, and this set has
   * exactly one weight and one treatment — a single filled glyph among twenty
   * stroked ones is what makes a hand-rolled set look hand-rolled. Terracotta
   * on the same outline says it just as clearly.
   */
  bookmark: 'M6 4h12v16l-6-4-6 4z',
  bookmarks: 'M8 3h8v14l-4-2.5L8 17zM5 7v13l3-2',
  calendar: 'M4 6h16v14H4zM4 10h16M8 3v4M16 3v4',
  'chevron-right': 'm9 5 7 7-7 7',
  clock: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM12 7v5l3.5 2',
  compass: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zm3.5 5.5-2 5-5 2 2-5z',
  // A fork and a knife. A single plate reads as a circle at 18px.
  cutlery: 'M7 3v5a2 2 0 0 0 4 0V3M9 8v13M16.5 21V3c2 1.5 3 4.5 3 7.5s-1 4.5-3 4.5',
  document: 'M6 3h8l4 4v14H6zM14 3v4h4M9 12h6M9 16h6',
  // A gavel reads as civic business at 18px only if the head is unmistakable.
  gavel: 'm4 20 7-7M9 4l7 7M13.5 2.5 18 7M11 5.5 15.5 10M4.5 16.5 9 21',
  group: 'M9 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM3 19a6 6 0 0 1 12 0M16 6.5a3 3 0 0 1 0 5M17 19a6 6 0 0 0-2-4.3',
  // A pulse trace, not a heart. A heart at this size reads as a "like".
  heartbeat: 'M3 12h4l2.5-5 3.5 10 2.5-5h5.5',
  home: 'M4 10.5 12 4l8 6.5V20H4zM10 20v-6h4v6',
  leaf: 'M5 19C5 11 10 6 19 5c1 9-4 14-12 14zM5 19c3-4 6-6.5 10-8',
  music: 'M9 18a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5zM11.5 15.5V5l8-2v10.5M19.5 16a2.5 2.5 0 1 1-5 0 2.5 2.5 0 0 1 5 0z',
  newspaper: 'M3 5h14v15H5a2 2 0 0 1-2-2zM17 9h4v9a2 2 0 0 1-2 2h-2zM6 8h8M6 12h8M6 16h5',
  pin: 'M12 21.5S19 15 19 10a7 7 0 0 0-14 0c0 5 7 11.5 7 11.5zM12 8.2a2 2 0 1 0 0 4 2 2 0 0 0 0-4z',
  search: 'M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zM16.2 16.2 21 21',
  sport: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM12 3c3 4 3 14 0 18M12 3c-3 4-3 14 0 18M3.5 9h17M3.5 15h17',
  storefront: 'M4 9h16v11H4zM4 9 5.5 4h13L20 9M4 9a2.7 2.7 0 0 0 5.3 0 2.7 2.7 0 0 0 5.4 0 2.7 2.7 0 0 0 5.3 0M9.5 20v-6h5v6',
  // The crosshair on a recenter control, which is the only thing it labels.
  target: 'M12 5a7 7 0 1 0 0 14 7 7 0 0 0 0-14zM12 2v3M12 19v3M2 12h3M19 12h3M12 10.7a1.3 1.3 0 1 0 0 2.6 1.3 1.3 0 0 0 0-2.6z',
  toolbox: 'M3 9h18v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1zM3 13h18M9 9V6.5A1.5 1.5 0 0 1 10.5 5h3A1.5 1.5 0 0 1 15 6.5V9',
  verified: 'M12 3l7 3v5.6c0 4.3-3 7.6-7 9.4-4-1.8-7-5.1-7-9.4V6zM9 12l2.2 2.2L15.5 10',
  warning: 'M12 4 2.5 20h19zM12 10v4.5M12 17.5v.01',
}

export interface IconProps {
  name: IconName
  /** Matches the surrounding text size unless the caller says otherwise. */
  size?: number
  className?: string
}

export function Icon({ name, size = 20, className }: IconProps) {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
      // Decorative in every current use: each icon sits beside a text label
      // that already says what it means, and a screen reader announcing
      // "newspaper newspaper" is worse than silence.
      aria-hidden="true"
      focusable="false"
    >
      <path d={PATHS[name]} />
    </svg>
  )
}

/**
 * The Town Square mark.
 *
 * Kept out of `PATHS` because it is not an icon: it is the brand, it is the one
 * thing on the screen a creation must never be able to draw, and it comes from
 * `brand/mark.png` rather than from anybody's hand. See the warning in
 * `brand/README.md` — a previous pass shipped a `build.py` approximation of it
 * and that was wrong.
 */
export function Mark({ size = 22, className }: { size?: number; className?: string }) {
  return (
    <span
      className={className}
      role="img"
      aria-label="Town Square"
      style={{
        width: size,
        height: size,
        flex: 'none',
        display: 'inline-block',
        backgroundImage: 'url(/brand/mark-ui-256.png)',
        backgroundSize: 'contain',
        backgroundPosition: 'center',
        backgroundRepeat: 'no-repeat',
      }}
    />
  )
}
