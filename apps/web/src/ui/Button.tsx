import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { Icon, type IconName } from '../Icon.js'
import { cx } from './cx.js'

/**
 * The button, and the only button.
 *
 * Four intents and three sizes, from `design/hifi-v2/sections/01-foundations`.
 * Two of the decisions in here are load-bearing and worth knowing before
 * adding a fifth variant:
 *
 * **Destructive is an outlined terracotta, never brick.** `--ts-brick` is the
 * single alarm register in this system. It appears when the water plant issues
 * a boil order and when the river is forecast over the levee, and its whole
 * value is that a resident has almost never seen it. Spend it on "remove
 * creation" and you have taught the town that the loudest colour in the app
 * means a form did something. Destructive borrows terracotta and changes
 * shape instead: transparent fill, full-weight border, terracotta label.
 * Confirming a genuinely irreversible action is the dialog's job, not the
 * button's colour.
 *
 * **Loading keeps the label.** It swaps the leading slot for a spinner rather
 * than replacing the text, so the button does not resize under the finger that
 * just pressed it, and it stays disabled with `aria-busy`, because a second
 * press would submit a second vouch.
 */

export type ButtonVariant = 'primary' | 'secondary' | 'quiet' | 'destructive' | 'on-navy'
export type ButtonSize = 'sm' | 'md' | 'lg'

export interface ButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> {
  variant?: ButtonVariant
  size?: ButtonSize
  /** A glyph before the label. Replaced by the spinner while loading. */
  icon?: IconName
  /** A glyph after the label. "Open site" and its outward arrow. */
  trailingIcon?: IconName
  /** Fills its container. Used for the one committing action at the foot of a form. */
  full?: boolean
  loading?: boolean
  children: ReactNode
}

export function Button({
  variant = 'secondary',
  size = 'md',
  icon,
  trailingIcon,
  full,
  loading,
  disabled,
  className,
  children,
  ...rest
}: ButtonProps) {
  const glyph = size === 'lg' ? 18 : 16

  return (
    <button
      type="button"
      {...rest}
      className={cx('ts-btn', className)}
      data-variant={variant}
      data-size={size}
      data-full={full || undefined}
      data-loading={loading || undefined}
      // Disabled as well as busy. `aria-busy` alone tells a screen reader the
      // control is working; it does not stop a second submit.
      disabled={disabled || loading}
      aria-busy={loading || undefined}
    >
      {loading ? <Spinner size={glyph} /> : icon ? <Icon name={icon} size={glyph} /> : null}
      <span>{children}</span>
      {trailingIcon && !loading ? <Icon name={trailingIcon} size={glyph} /> : null}
    </button>
  )
}

export interface IconButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> {
  name: IconName
  /**
   * Required, not optional.
   *
   * There is no such thing as an obvious glyph. A bookmark could be save,
   * read later, or a filter, and the only person who finds out which is the
   * one who cannot see it.
   */
  label: string
  variant?: ButtonVariant
  size?: ButtonSize
  loading?: boolean
}

export function IconButton({
  name,
  label,
  variant = 'quiet',
  size = 'md',
  loading,
  disabled,
  className,
  ...rest
}: IconButtonProps) {
  return (
    <button
      type="button"
      {...rest}
      className={cx('ts-btn', className)}
      data-variant={variant}
      data-size={size}
      data-icon-only
      data-loading={loading || undefined}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      aria-label={label}
      title={label}
    >
      {loading ? <Spinner size={20} /> : <Icon name={name} size={20} />}
    </button>
  )
}

/**
 * The spinner, and only ever inside a control.
 *
 * A full-screen spinner is a skeleton somebody did not bother to draw: it says
 * "wait" without saying what for or what shape it will be. `Skeleton` is
 * almost always the right answer instead.
 */
export function Spinner({ size = 16, className }: { size?: number; className?: string }) {
  return (
    <span
      className={cx('ts-spinner', className)}
      style={{ width: size, height: size }}
      aria-hidden="true"
    />
  )
}
