import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { Icon, type IconName } from '../Icon.js'
import { cx } from './cx.js'

/**
 * The three small round things, which are three different things.
 *
 * A **chip** is a control: you press it and the list under it changes.
 * A **pill** is a statement: it tells you something is open, verified, or
 * pending, and nothing happens when you touch it.
 * A **tag** is a chip you have already picked up, and the only one with an X.
 *
 * They look similar because they are the same size class, and keeping them in
 * one file is how they stay that way.
 */

export interface FilterChipProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> {
  label: string
  /**
   * How many results are behind this filter.
   *
   * Inside the chip rather than beside it, because a filter with no results
   * should say so before you press it rather than after.
   */
  count?: number
  selected?: boolean
}

export function FilterChip({ label, count, selected, className, ...rest }: FilterChipProps) {
  return (
    <button
      type="button"
      {...rest}
      className={cx('ts-chip', className)}
      // Selection is navy, not terracotta: terracotta means "this does
      // something", and a filter chip has already done it.
      aria-pressed={selected ?? false}
    >
      {label}
      {count === undefined ? null : <span className="ts-chip-count">{count}</span>}
    </button>
  )
}

export type PillTone = 'sage' | 'gold' | 'live' | 'quiet' | 'pending' | 'brick'

export interface StatusPillProps {
  tone: PillTone
  /**
   * A glyph, always, unless the tone draws its own (`live` has a pulsing dot).
   *
   * The state has to survive being printed, dimmed, or read by somebody who
   * cannot separate sage from stone. Colour is confirmation here, never the
   * message.
   */
  icon?: IconName
  children: ReactNode
  className?: string
}

export function StatusPill({ tone, icon, children, className }: StatusPillProps) {
  return (
    <span className={cx('ts-pill', className)} data-tone={tone}>
      {tone === 'live' ? (
        <span className="ts-live-dot" aria-hidden="true" />
      ) : icon ? (
        <Icon name={icon} size={14} />
      ) : null}
      {children}
    </span>
  )
}

export interface TagProps {
  label: string
  /** Omit and the tag is not removable, which is the rarer case. */
  onRemove?: () => void
  className?: string
}

export function Tag({ label, onRemove, className }: TagProps) {
  return (
    <span className={cx('ts-tag', className)}>
      {label}
      {onRemove ? (
        <button
          type="button"
          className="ts-tag-x"
          // Names what it removes, not "remove". A screen reader going through
          // six filters hears six identical buttons otherwise.
          aria-label={`Remove the ${label} filter`}
          onClick={onRemove}
        >
          <Icon name="close" size={14} />
        </button>
      ) : null}
    </span>
  )
}

/**
 * The one mark a creation can never draw for itself.
 *
 * Mono because it labels the thing rather than describing it, which is the
 * only job monospace still has in this system.
 */
export function AppChip({ inverse, className }: { inverse?: boolean; className?: string }) {
  return (
    <span className={cx('ts-appchip', className)} data-inverse={inverse || undefined}>
      APP
    </span>
  )
}
