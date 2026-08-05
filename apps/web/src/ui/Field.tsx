import { useId } from 'react'
import type {
  InputHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
} from 'react'
import { Icon } from '../Icon.js'
import { cx } from './cx.js'

/**
 * Text entry, and the wiring that makes an error mean something.
 *
 * The rule these all share: an invalid field moves its border **and** adds a
 * line of text under itself **and** sets `aria-invalid` with `aria-describedby`
 * pointing at that line. Colour has never told anyone what they typed wrong,
 * and a border a shade warmer is not a message.
 *
 * The error border is terracotta and 1.5px rather than brick, for the reason
 * written on the button: a resident who learns that the alarm colour means
 * "that handle is taken" has been taught to ignore it by the time the river is
 * up. Validate on blur, clear on input, and never while a finger is still
 * typing.
 */

interface FieldShellProps {
  label: string
  /** The quiet line under the field. Replaced by `error` when there is one. */
  help?: ReactNode
  error?: ReactNode
  /** Shown instead of help when the field validates cleanly. Sage, with a tick. */
  ok?: ReactNode
  children: (ids: { id: string; describedBy: string | undefined; invalid: boolean }) => ReactNode
  className?: string
}

function FieldShell({ label, help, error, ok, children, className }: FieldShellProps) {
  const id = useId()
  const noteId = `${id}-note`
  const note = error ?? ok ?? help
  return (
    <div className={cx('ts-field', className)} data-state={error ? 'error' : ok ? 'ok' : undefined}>
      <label className="ts-field-label" htmlFor={id}>
        {label}
      </label>
      {children({ id, describedBy: note ? noteId : undefined, invalid: Boolean(error) })}
      {error ? (
        <p className="ts-field-err" id={noteId}>
          <Icon name="alert-circle" size={14} />
          <span>{error}</span>
        </p>
      ) : ok ? (
        <p className="ts-field-ok" id={noteId}>
          <Icon name="check" size={14} />
          <span>{ok}</span>
        </p>
      ) : help ? (
        <p className="ts-field-help" id={noteId}>
          {help}
        </p>
      ) : null}
    </div>
  )
}

type NativeInput = Omit<InputHTMLAttributes<HTMLInputElement>, 'id' | 'className'>

export interface TextInputProps extends NativeInput {
  label: string
  help?: ReactNode
  error?: ReactNode
  ok?: ReactNode
  className?: string
}

export function TextInput({ label, help, error, ok, className, ...rest }: TextInputProps) {
  return (
    <FieldShell label={label} help={help} error={error} ok={ok} className={className}>
      {({ id, describedBy, invalid }) => (
        <input
          {...rest}
          id={id}
          className="ts-input"
          aria-invalid={invalid || undefined}
          aria-describedby={describedBy}
        />
      )}
    </FieldShell>
  )
}

export interface TextareaProps
  extends Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, 'id' | 'className'> {
  label: string
  help?: ReactNode
  error?: ReactNode
  /**
   * The character counter. Only rendered when `maxLength` is set.
   *
   * It stays ink45 until you are within `warnAt` of the limit and only then
   * goes terracotta. A red number at character 12 of 280 is noise, and noise
   * at character 12 is how somebody learns to stop reading it by 260.
   */
  warnAt?: number
  className?: string
}

export function Textarea({
  label,
  help,
  error,
  warnAt = 40,
  className,
  value,
  maxLength,
  ...rest
}: TextareaProps) {
  const used = typeof value === 'string' ? value.length : 0
  const near = maxLength !== undefined && maxLength - used <= warnAt

  return (
    <FieldShell label={label} help={help} error={error} className={className}>
      {({ id, describedBy, invalid }) => (
        <div className="ts-textarea-wrap">
          <textarea
            {...rest}
            value={value}
            maxLength={maxLength}
            id={id}
            className="ts-textarea"
            aria-invalid={invalid || undefined}
            aria-describedby={describedBy}
          />
          {maxLength === undefined ? null : (
            <span className="ts-counter" data-near={near || undefined}>
              {used} / {maxLength}
            </span>
          )}
        </div>
      )}
    </FieldShell>
  )
}

export interface SelectProps
  extends Omit<SelectHTMLAttributes<HTMLSelectElement>, 'id' | 'className'> {
  label: string
  help?: ReactNode
  error?: ReactNode
  children: ReactNode
  className?: string
}

export function Select({ label, help, error, children, className, ...rest }: SelectProps) {
  return (
    <FieldShell label={label} help={help} error={error} className={className}>
      {({ id, describedBy, invalid }) => (
        <div className="ts-select-wrap">
          <select
            {...rest}
            id={id}
            className="ts-select"
            aria-invalid={invalid || undefined}
            aria-describedby={describedBy}
          >
            {children}
          </select>
          <Icon name="chevron-down" size={16} className="ts-select-arrow" />
        </div>
      )}
    </FieldShell>
  )
}

export interface SearchInputProps extends Omit<NativeInput, 'type' | 'value'> {
  label: string
  value: string
  onClear: () => void
  help?: ReactNode
  className?: string
}

export function SearchInput({
  label,
  value,
  onClear,
  help,
  className,
  ...rest
}: SearchInputProps) {
  return (
    <FieldShell label={label} help={help} className={className}>
      {({ id, describedBy }) => (
        <div className="ts-search">
          <Icon name="search" size={16} className="ts-search-icon" />
          <input
            {...rest}
            value={value}
            id={id}
            type="search"
            className="ts-input ts-search-input"
            aria-describedby={describedBy}
          />
          {value ? (
            // A real 32px button, not a decorative glyph the finger keeps
            // missing on the way to the keyboard.
            <button type="button" className="ts-search-clear" aria-label="Clear the search" onClick={onClear}>
              <Icon name="close" size={14} />
            </button>
          ) : null}
        </div>
      )}
    </FieldShell>
  )
}

/**
 * An error attached to something that is not a field.
 *
 * Same shape and same colour as the one under an input, so a resident reads
 * them as the same kind of statement. Give it `role="alert"` only when it
 * appears in response to something they just did.
 */
export function InlineError({
  children,
  live,
  className,
}: {
  children: ReactNode
  live?: boolean
  className?: string
}) {
  return (
    <p className={cx('ts-field-err', className)} role={live ? 'alert' : undefined}>
      <Icon name="alert-circle" size={14} />
      <span>{children}</span>
    </p>
  )
}
