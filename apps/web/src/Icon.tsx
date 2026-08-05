/**
 * The shell's icons, from one sprite served off our own origin.
 *
 * This file used to hand-draw eighteen glyphs, because the alternative on the
 * table was Material Symbols: a ~3.5MB variable font, fetched either from
 * Google (a third party in the load path of the town's home screen, and a
 * `font-src` hole `packages/tokens` deliberately does not have) or vendored
 * whole to draw sixteen shapes. Both were worse than drawing them.
 *
 * `design/hifi-v2/icons.svg` changed the arithmetic. It is 121 symbols on the
 * same 24px stroked grid, it is ours, and it is one request that caches. It is
 * still not a webfont and there is still no third party: the dev server serves
 * the file straight out of `design/` (see `vite.config.ts`), for the same
 * reason the typefaces come from `packages/tokens/fonts` and the mark comes
 * from `brand/png` — a copy in `public/` is a second source of truth that
 * drifts the first time one side is edited.
 *
 * Two glyphs are still drawn here, and the comments on them say why.
 */

/**
 * Every symbol in `design/hifi-v2/icons.svg`, by name.
 *
 * Kept as a value and not only a type so the specimen page can render all of
 * them, which is also how a symbol that goes missing gets noticed. The `i-`
 * prefix lives in the sprite, not in the name a caller types.
 */
export const SPRITE_ICONS = [
  'home', 'compass', 'calendar', 'group', 'grid', 'search', 'menu', 'close',
  'chevron-right', 'chevron-left', 'chevron-down', 'chevron-up',
  'arrow-right', 'arrow-left', 'arrow-up', 'arrow-down', 'arrow-out',
  'plus', 'minus', 'check', 'more-horizontal', 'more-vertical',
  'filter', 'sort', 'refresh', 'drag', 'expand', 'collapse',
  'newspaper', 'document', 'bookmark', 'bookmark-filled', 'share', 'link',
  'quote', 'image', 'play', 'pause', 'mic', 'headphones', 'video',
  'tag', 'list', 'layers', 'book', 'storefront', 'map-pin', 'map', 'directions',
  'phone', 'mail', 'globe', 'clock', 'ticket', 'coffee', 'utensils', 'gavel',
  'megaphone', 'warning', 'shield', 'flag', 'vote', 'building', 'bus', 'tree',
  'sun', 'cloud-rain', 'user', 'users', 'user-plus', 'badge-check', 'handshake',
  'heart', 'star', 'sparkle', 'code', 'terminal', 'puzzle', 'plug', 'package',
  'wand', 'key', 'lock', 'unlock', 'eye', 'eye-off', 'database', 'cloud-upload',
  'download', 'git-branch', 'history', 'settings', 'sliders', 'trash', 'edit',
  'copy', 'external', 'bell', 'bell-off', 'leaf', 'music', 'sport', 'camera',
  'dollar', 'chart', 'info', 'help', 'check-circle', 'alert-circle', 'x-circle',
  'loader', 'pin', 'archive', 'send', 'message', 'thumb-up', 'inbox',
  'lightbulb', 'scale', 'wrench', 'zap',
] as const

export type SpriteIcon = (typeof SPRITE_ICONS)[number]

type LocalIcon = 'heartbeat' | 'target'

/**
 * The two shapes the sprite does not have, still drawn by hand.
 *
 * Both were deliberate choices when this file drew everything, and the reasons
 * did not stop being true when the sprite arrived. Falling back to the nearest
 * sprite glyph would quietly reverse a decision somebody made on purpose,
 * which is a worse outcome than two paths.
 */
const LOCAL_PATHS: Record<LocalIcon, string> = {
  /**
   * A pulse trace, not a heart. The sprite's nearest glyph is `heart`, and a
   * heart at 18px beside a business name reads as "like this place" rather
   * than "this is the health category".
   */
  heartbeat: 'M3 12h4l2.5-5 3.5 10 2.5-5h5.5',
  /**
   * The crosshair on the map's recenter control, which is the only thing it
   * labels. The sprite has `map-pin` and `pin`, and both of those mean "a
   * place". This button means "the place you are".
   */
  target:
    'M12 5a7 7 0 1 0 0 14 7 7 0 0 0 0-14zM12 2v3M12 19v3M2 12h3M19 12h3M12 10.7a1.3 1.3 0 1 0 0 2.6 1.3 1.3 0 0 0 0-2.6z',
}

/**
 * Names the shipped screens already use, pointed at their sprite equivalents.
 *
 * Three screens are live and more agents are writing against this API right
 * now, so the old names keep working rather than turning a sprite swap into a
 * rename across six files. New code should use the sprite name.
 */
const ALIASES = {
  add: 'plus',
  bag: 'package',
  /** The saved tab and a saved card should be the same glyph, and now are. */
  bookmarks: 'bookmark',
  cutlery: 'utensils',
  /** In the Map/List switch this labels the map, not a pushpin. */
  pin: 'map-pin',
  toolbox: 'wrench',
  /** The ring is the badge on a person. This is the badge on everything else. */
  verified: 'badge-check',
} as const satisfies Record<string, SpriteIcon>

export type IconName = SpriteIcon | LocalIcon | keyof typeof ALIASES

/** One path, so a host that relocates the sprite relocates it once. */
export const SPRITE_HREF = '/icons.svg'

export interface IconProps {
  name: IconName
  /** Matches the surrounding text size unless the caller says otherwise. */
  size?: number
  className?: string
  /**
   * Give the glyph a name when it is the only thing saying what a control does.
   *
   * The default is silence, because an icon in this app almost always sits
   * beside a text label that already says it, and a screen reader announcing
   * "newspaper newspaper" is worse than nothing. When an icon is genuinely
   * alone the label usually belongs on the button rather than the glyph, which
   * is what `IconButton` in `src/ui/` does.
   */
  label?: string
}

export function Icon({ name, size = 20, className, label }: IconProps) {
  const resolved: string = name in ALIASES ? ALIASES[name as keyof typeof ALIASES] : name
  const local = LOCAL_PATHS[resolved as LocalIcon]

  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      // The sprite's symbols carry no stroke attributes of their own. These are
      // what make a sprite glyph and a locally drawn one indistinguishable, and
      // what lets a caller colour an icon by setting `color` on its parent.
      stroke="currentColor"
      strokeWidth={1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden={label ? undefined : true}
      role={label ? 'img' : undefined}
      aria-label={label}
      focusable="false"
    >
      {local ? <path d={local} /> : <use href={`${SPRITE_HREF}#i-${resolved}`} />}
    </svg>
  )
}

/**
 * The Town Square mark.
 *
 * Kept out of the sprite because it is not an icon: it is the brand, it is the
 * one thing on the screen a creation must never be able to draw, and it comes
 * from `brand/mark.png` rather than from anybody's hand. See the warning in
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
