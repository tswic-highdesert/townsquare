import type { ReactNode } from 'react'
import { Icon, type IconName } from '../Icon.js'
import { cx } from './cx.js'

/**
 * Card and Row: two of the three shapes everything else is built from.
 *
 * `design/hifi-v2/sections/11-system.html` measures all three and makes the
 * argument for having them at all — six people each rolling their own row is
 * the specific way a design system stops being one, and it happens quietly,
 * because every individual row looks fine.
 *
 * **These do not replace the card and row CSS in `today.css` and
 * `nearby.css`.** Those three screens ship, their styles were tuned against
 * real content and real bugs, and destabilising them to prove a point about
 * consistency would be a bad trade. Migrating them onto these is a deliberate
 * follow-up for when the surrounding screens have settled. New screens should
 * start here.
 */

/* ── card ───────────────────────────────────────────────────────────────── */

export interface CardProps {
  children: ReactNode
  /**
   * How far off the page it sits. `flat` is a card in a list, `raised` is one
   * that stands alone, `lifted` is one that has been picked up.
   *
   * The restraint rule from the house style applies above this: one dark card
   * per screen, one tinted card per screen. A screen where three cards are
   * lifted has no lead.
   */
  elevation?: 'flat' | 'raised' | 'lifted'
  /** Navy fill and cream ink. The one dark card. Sets the dark focus halo too. */
  dark?: boolean
  /** The single tinted card. Gold wash, for the town speaking. */
  tone?: 'civic'
  /** Renders as a link and takes the whole card as one target. */
  href?: string
  onClick?: () => void
  className?: string
}

/**
 * One card is one target.
 *
 * A card containing a headline, a source and a time is still one thing a
 * finger presses, so it is one tab stop and one hit area rather than three.
 * Where a card genuinely has secondary actions, Nearby's Call and Directions
 * are the pattern: separate buttons outside the card's own target, never
 * nested inside a link.
 */
export function Card({
  children,
  elevation = 'flat',
  dark,
  tone,
  href,
  onClick,
  className,
}: CardProps) {
  const props = {
    className: cx('ts-card', className),
    'data-elevation': elevation,
    'data-dark': dark || undefined,
    'data-on-dark': dark || undefined,
    'data-tone': tone,
  }
  if (href) {
    return (
      <a {...props} href={href}>
        {children}
      </a>
    )
  }
  if (onClick) {
    return (
      <button {...props} type="button" onClick={onClick}>
        {children}
      </button>
    )
  }
  return <div {...props}>{children}</div>
}

/**
 * The image at the top of a card.
 *
 * Radius 12 against the card's 16, so the inner curve nests instead of
 * fighting the outer one. With no `src` it draws a stone placeholder rather
 * than collapsing, because roughly half the town's stories carry no photo and
 * a card that changes height on that is a list that jumps.
 */
export function CardMedia({
  src,
  alt,
  className,
}: {
  src?: string
  alt?: string
  className?: string
}) {
  if (!src) return <div className={cx('ts-card-media', className)} aria-hidden="true" />
  return <img className={cx('ts-card-media', className)} src={src} alt={alt ?? ''} />
}

export function CardBody({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cx('ts-card-body', className)}>{children}</div>
}

/**
 * The mono, uppercase, tracked label above a card title.
 *
 * Structural voice: it labels the card rather than saying anything. The moment
 * it starts carrying a sentence it should be a `CardMeta` in the serif.
 */
export function CardEyebrow({ children, className }: { children: ReactNode; className?: string }) {
  return <p className={cx('ts-card-eyebrow', className)}>{children}</p>
}

export function CardTitle({
  children,
  as: As = 'h3',
  className,
}: {
  children: ReactNode
  as?: 'h2' | 'h3' | 'h4'
  className?: string
}) {
  return <As className={cx('ts-card-title', className)}>{children}</As>
}

/** The byline, the source, the time. Editorial voice, never mono. */
export function CardMeta({ children, className }: { children: ReactNode; className?: string }) {
  return <p className={cx('ts-card-meta', className)}>{children}</p>
}

/* ── row ────────────────────────────────────────────────────────────────── */

export interface RowProps {
  /**
   * The fixed-width block on the left: a thumbnail, a date block, an icon
   * tile. Fixed at `--ts-row-lead` so every title in a list starts on the same
   * x, which is the difference between a list and a pile.
   */
  lead?: ReactNode
  title: ReactNode
  meta?: ReactNode
  /** The right-hand end: a chip, a time, a status. Not a second tap target. */
  trailing?: ReactNode
  /** Draws a chevron and makes the whole row one target. */
  href?: string
  onClick?: () => void
  className?: string
}

/**
 * One row, one target, 44px minimum even when the copy is one line.
 *
 * The divider is drawn on the row rather than between rows, and inset past the
 * leading block rather than running edge to edge, so a list reads as a stack
 * of things rather than a table.
 */
export function Row({ lead, title, meta, trailing, href, onClick, className }: RowProps) {
  const inner = (
    <>
      {lead ? <span className="ts-row-lead">{lead}</span> : null}
      <span className="ts-row-body">
        <span className="ts-row-title">{title}</span>
        {meta ? <span className="ts-row-meta">{meta}</span> : null}
      </span>
      {trailing ? <span className="ts-row-trailing">{trailing}</span> : null}
      {href || onClick ? <Icon name="chevron-right" size={16} className="ts-row-chev" /> : null}
    </>
  )

  // The divider inset depends on whether there is a leading block to clear, and
  // CSS cannot ask that question of its own children.
  const props = { className: cx('ts-row', className), 'data-lead': lead ? '' : undefined }
  if (href) {
    return (
      <a {...props} href={href}>
        {inner}
      </a>
    )
  }
  if (onClick) {
    return (
      <button {...props} type="button" onClick={onClick}>
        {inner}
      </button>
    )
  }
  return <div {...props}>{inner}</div>
}

/**
 * A list of rows, and the only place density is set.
 *
 * `compact` overrides four variables and nothing else. It is the same Row
 * component, not a variant of it, which is the whole point: two components
 * that have to stay in sync forever will not. The tap target still floors at
 * 44px, so compact buys vertical space and never accessibility, and a creation
 * rendered inside a compact list inherits the density too.
 */
export function RowList({
  children,
  density = 'comfortable',
  /** Draws the surface, border and radius around the rows. */
  framed = true,
  label,
  className,
}: {
  children: ReactNode
  density?: 'comfortable' | 'compact'
  framed?: boolean
  label?: string
  className?: string
}) {
  return (
    <ul
      className={cx('ts-rows', className)}
      data-density={density === 'compact' ? 'compact' : undefined}
      data-framed={framed || undefined}
      aria-label={label}
    >
      {children}
    </ul>
  )
}

/** A row inside a `RowList`. Wraps it in the `<li>` the list needs. */
export function RowItem(props: RowProps) {
  return (
    <li>
      <Row {...props} />
    </li>
  )
}

/**
 * The date block a calendar row leads with.
 *
 * Mono and uppercase, because it labels the row rather than saying anything,
 * and tabular so a column of them does not shuffle between the 9th and the
 * 13th.
 */
export function RowDate({
  weekday,
  day,
  className,
}: {
  weekday: string
  day: number | string
  className?: string
}) {
  return (
    <span className={cx('ts-row-date', className)}>
      <span className="ts-row-date-d">{weekday}</span>
      <span className="ts-row-date-n">{day}</span>
    </span>
  )
}

/** An icon tile in a row's leading slot. Same shape as `Tile`, row-sized. */
export function RowIcon({ name, className }: { name: IconName; className?: string }) {
  return (
    <span className={cx('ts-row-icon', className)}>
      <Icon name={name} size={20} />
    </span>
  )
}
