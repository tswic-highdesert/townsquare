import type { InputHTMLAttributes, ReactNode } from 'react'
import { Icon } from '../Icon.js'
import { cx } from './cx.js'
import { canStep, clampStep, type StepBounds } from './stepper.js'

/**
 * Controls that pick something.
 *
 * Checkbox for many, radio for one, switch for a setting that takes effect the
 * instant you flip it. If flipping it needs a Save button afterwards, it is a
 * checkbox wearing a switch, and residents find that out the hard way.
 *
 * All three hide a real `<input>` rather than drawing a div with a click
 * handler: the label association, the keyboard behaviour, the form
 * participation and the screen-reader role all come free and all get
 * reimplemented badly otherwise.
 */

type Native = Omit<InputHTMLAttributes<HTMLInputElement>, 'type' | 'className' | 'children'>

export interface ChoiceProps extends Native {
  children: ReactNode
  className?: string
}

export function Checkbox({ children, className, ...rest }: ChoiceProps) {
  return (
    <label className={cx('ts-check', className)}>
      <input type="checkbox" {...rest} />
      <span className="ts-check-box" aria-hidden="true">
        <Icon name="check" size={14} />
      </span>
      <span>{children}</span>
    </label>
  )
}

export function Radio({ children, className, ...rest }: ChoiceProps) {
  return (
    <label className={cx('ts-radio', className)}>
      <input type="radio" {...rest} />
      <span className="ts-radio-dot" aria-hidden="true" />
      <span>{children}</span>
    </label>
  )
}

export function Switch({ children, className, ...rest }: ChoiceProps) {
  return (
    <label className={cx('ts-switch', className)}>
      {/*
       * Sage when on, not terracotta. A switch that is already on is a state,
       * not an action, and sage is what this system uses for "alive and
       * confirmed". Terracotta on a toggle reads as a button you have not
       * pressed yet.
       */}
      <input type="checkbox" role="switch" {...rest} />
      <span className="ts-switch-track" aria-hidden="true">
        <span className="ts-switch-knob" />
      </span>
      <span>{children}</span>
    </label>
  )
}

export interface SegmentedOption<T extends string> {
  value: T
  label: string
}

export interface SegmentedControlProps<T extends string> {
  /**
   * What the whole control is for. A screen reader hearing three unlabelled
   * tabs learns nothing about what they sort.
   */
  label: string
  options: ReadonlyArray<SegmentedOption<T>>
  value: T
  onChange: (value: T) => void
  className?: string
}

/**
 * A segment is a view of the same list.
 *
 * If pressing it changes *what the list is* rather than how it is ordered or
 * filtered, it is a tab and belongs in the navigation, not here. The tablist
 * role is honest about that: these are views of one thing.
 */
export function SegmentedControl<T extends string>({
  label,
  options,
  value,
  onChange,
  className,
}: SegmentedControlProps<T>) {
  return (
    <div className={cx('ts-seg', className)} role="tablist" aria-label={label}>
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          role="tab"
          className="ts-seg-btn"
          aria-selected={opt.value === value}
          onClick={() => onChange(opt.value)}
        >
          {opt.label}
        </button>
      ))}
    </div>
  )
}

export interface StepperProps extends StepBounds {
  value: number
  onChange: (value: number) => void
  /** What one unit is, for the two buttons: "volunteer" gives "One more volunteer". */
  unit: string
  className?: string
}

export function Stepper({ value, onChange, unit, className, ...bounds }: StepperProps) {
  return (
    <div className={cx('ts-stepper', className)}>
      <button
        type="button"
        className="ts-step-btn"
        aria-label={`One fewer ${unit}`}
        disabled={!canStep(value, -1, bounds)}
        onClick={() => onChange(clampStep(value, -1, bounds))}
      >
        <Icon name="minus" size={16} />
      </button>
      {/*
       * Polite rather than assertive, and on the value rather than the buttons:
       * somebody holding the minus button wants the number read once it settles,
       * not eleven times on the way down.
       */}
      <span className="ts-step-val" aria-live="polite">
        {value}
      </span>
      <button
        type="button"
        className="ts-step-btn"
        aria-label={`One more ${unit}`}
        disabled={!canStep(value, 1, bounds)}
        onClick={() => onChange(clampStep(value, 1, bounds))}
      >
        <Icon name="plus" size={16} />
      </button>
    </div>
  )
}
