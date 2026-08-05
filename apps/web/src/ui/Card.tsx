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
  /**
   * Turn off the 16px inset.
   *
   * For a card whose children own their own edges: a full-bleed image, a row
   * list that already pads itself, a screen that lays its own grid inside.
   * The default stays padded because the common case is a card with copy in
   * it, and an unpadded default would put every headline against the border.
   */
  padded?: boolean
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
  padded = true,
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
    'data-bare': padded ? undefined : '',
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
 * The image at the top of a card. Radius 12 against the card's 16, so the
 * inner curve nests instead of fighting the outer one.
 *
 * **With no `src` this renders nothing.** That reverses what it used to do,
 * and the reasoning is worth keeping, because both sides are defensible and
 * the argument came from a real screen.
 *
 * The case for a placeholder is that a card changing height is a list that
 * jumps. The case against is that roughly half this town's stories carry art
 * and none of the university's do, so a reserved grey rectangle is what a
 * resident sees most days of the week, and it reads as a photo that failed to
 * load rather than as a story that never had one.
 *
 * Two things settled it. The house rule everywhere in this repo is that a
 * surface with no real source is omitted rather than mocked, and a grey
 * rectangle standing in for a photograph that does not exist is exactly a
 * mocked surface. And the design sheet already decided this for the loading
 * case: section 10 draws its second skeleton row without a thumbnail, on the
 * grounds that "a skeleton that always draws a thumb teaches a layout that
 * will not arrive". Drawing a placeholder that always arrives empty is the
 * same mistake one step later.
 *
 * The jump is real, but it belongs to whoever knows whether art is coming. A
 * list that knows it is loading reserves the space with a `Skeleton`; a list
 * showing a story that has no art should not reserve space for one. Pass
 * `placeholder` where you genuinely want the rectangle held.
 */
export function CardMedia({
  src,
  alt,
  placeholder,
  className,
}: {
  src?: string
  alt?: string
  /** Hold the space with a stone fill even when there is no image. */
  placeholder?: boolean
  className?: string
}) {
  if (!src) {
    if (!placeholder) return null
    return <div className={cx('ts-card-media', className)} aria-hidden="true" />
  }
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
  /**
   * The right-hand end: a chip, a time, a status, or a thumbnail.
   *
   * Not a second tap target. When the row is pressable the whole row is the
   * target, and anything genuinely separate — Call, Directions — belongs
   * outside the row rather than inside its trailing slot.
   *
   * Sized by the content rather than by `--ts-row-lead`, because the news
   * feed's 68px thumbnail trails a headline that leads, and forcing it into
   * the leading block's square would invert the thing section 3 argues for.
   */
  trailing?: ReactNode
  /**
   * Drop the chevron on a row that is still pressable.
   *
   * A chevron and a trailing thumbnail compete for the same corner, and the
   * chevron loses that argument: the photo is already telling you there is
   * something here. Only ever set this on a row whose affordance is carried
   * some other way.
   */
  chevron?: boolean
  /** Draws a chevron and makes the whole row one target. */
  href?: string
  /**
   * The href leaves town.
   *
   * Adds `target="_blank"` and `rel="noopener noreferrer"`. The second half is
   * the load-bearing one: the shell holds the session cookie, and a source's
   * page getting a handle on this window is not a risk worth taking to save an
   * attribute. Most rows in this product link to a scraped source, so this is
   * the common case rather than the exception — it is opt-in anyway, because a
   * row that silently opened a tab would be worse than one that did not.
   */
  external?: boolean
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
export function Row({
  lead,
  title,
  meta,
  trailing,
  chevron = true,
  href,
  external,
  onClick,
  className,
}: RowProps) {
  const inner = (
    <>
      {lead ? <span className="ts-row-lead">{lead}</span> : null}
      <span className="ts-row-body">
        <span className="ts-row-title">{title}</span>
        {meta ? <span className="ts-row-meta">{meta}</span> : null}
      </span>
      {trailing ? <span className="ts-row-trailing">{trailing}</span> : null}
      {chevron && (href || onClick) ? (
        <Icon name="chevron-right" size={16} className="ts-row-chev" />
      ) : null}
    </>
  )

  // The divider inset depends on whether there is a leading block to clear, and
  // CSS cannot ask that question of its own children.
  const props = { className: cx('ts-row', className), 'data-lead': lead ? '' : undefined }
  if (href) {
    return (
      <a
        {...props}
        href={href}
        target={external ? '_blank' : undefined}
        rel={external ? 'noopener noreferrer' : undefined}
      >
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
