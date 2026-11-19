import type { ReactNode } from 'react'
import { Icon, type IconName } from '../Icon.js'
import { cx } from './cx.js'
import { tn } from '../i18n/index.js'

/**
 * A person, with no photograph and no name.
 *
 * Town Square never stores an address and verified never means publicly
 * identified, so an avatar here is initials on a colour and nothing else.
 * There is no image slot on purpose: the moment one exists, somebody uploads a
 * face and the pseudonymity the whole identity model rests on becomes a
 * setting people forget to check.
 */

export type AvatarSize = 24 | 34 | 48

export interface AvatarProps {
  /** Two letters. Derived from the handle by the caller, never from a real name. */
  initials: string
  size?: AvatarSize
  /**
   * The ring IS the badge.
   *
   * A separate tick would be a mark a creation could draw for itself, and it
   * would read as "official" in a town where verification only ever means ten
   * neighbours vouched. A ring is a property of the person, not a stamp on
   * them.
   */
  verified?: boolean
  /** Which token fills it. One of the four the palette allows for a person. */
  tone?: 'navy' | 'terracotta' | 'sage' | 'ink'
  className?: string
}

export function Avatar({ initials, size = 34, verified, tone = 'navy', className }: AvatarProps) {
  return (
    <span
      className={cx('ts-av', className)}
      data-size={size}
      data-tone={tone}
      data-verified={verified || undefined}
      // Decorative. The handle beside it is the identity; the circle is not.
      aria-hidden="true"
    >
      {initials}
    </span>
  )
}

export interface AvatarStackProps {
  people: ReadonlyArray<{ initials: string; tone?: AvatarProps['tone'] }>
  /** How many to draw before the rest become a count. */
  shown?: number
  size?: AvatarSize
  className?: string
}

/**
 * Ten vouches, three faces, one honest count.
 *
 * The overflow chip is not decoration: showing three of ten and stopping would
 * quietly understate how vouched somebody is, and the count is the only part
 * of this that is load-bearing.
 */
export function AvatarStack({ people, shown = 3, size = 34, className }: AvatarStackProps) {
  const visible = people.slice(0, shown)
  const rest = people.length - visible.length
  return (
    <span className={cx('ts-av-stack', className)}>
      {visible.map((p, i) => (
        <Avatar key={i} initials={p.initials} tone={p.tone} size={size} />
      ))}
      {rest > 0 ? (
        <span className="ts-av" data-size={size} data-overflow aria-hidden="true">
          +{rest}
        </span>
      ) : null}
      {/* English keeps its existing wording for one; Spanish gets a real singular. */}
      <span className="ts-sr-only">{tn(people.length, '{count} neighbours', '{count} neighbours')}</span>
    </span>
  )
}

/**
 * A creation's icon, degrading to its initials.
 *
 * If the bundle never loads we draw the letters rather than a broken-image
 * glyph, because a creation that fails to boot is already telling the resident
 * bad news and does not need to look broken as well as be broken.
 */
export function Tile({
  icon,
  initials,
  className,
}: {
  icon?: IconName
  initials?: string
  className?: string
}) {
  return (
    <span className={cx('ts-tile', className)} data-fallback={icon ? undefined : true} aria-hidden="true">
      {icon ? <Icon name={icon} size={22} /> : initials}
    </span>
  )
}

/**
 * A rule, optionally with a word sitting in it.
 *
 * The labelled variant is mono and uppercase because it is labelling the page
 * rather than saying anything: "Earlier this week" here is a signpost, not a
 * sentence.
 */
export function Divider({ children, className }: { children?: ReactNode; className?: string }) {
  if (!children) return <div className={cx('ts-divider', className)} role="presentation" />
  return (
    <div className={cx('ts-divider', className)} data-labelled role="presentation">
      <span>{children}</span>
    </div>
  )
}
