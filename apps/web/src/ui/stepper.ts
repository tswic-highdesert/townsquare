/**
 * Stepper arithmetic, kept away from the component that draws it.
 *
 * A stepper is three lines of JSX and one place to get it wrong: the bounds.
 * A value that can be nudged past its maximum, or a minus button that stays
 * live at the floor, is the kind of bug that reaches a resident because it
 * only shows up at the edges nobody clicks through by hand.
 */

export interface StepBounds {
  min: number
  max: number
  /** How far one press moves. Defaults to 1. */
  step?: number
}

export function clampStep(value: number, delta: number, bounds: StepBounds): number {
  const step = bounds.step ?? 1
  const next = value + delta * step
  return Math.min(bounds.max, Math.max(bounds.min, next))
}

/**
 * Whether a direction is still available.
 *
 * The buttons are disabled rather than hidden, so the control keeps its width
 * and the finger keeps its target. A stepper that loses a button at the floor
 * shifts the number under the thumb that just pressed it.
 */
export function canStep(value: number, delta: number, bounds: StepBounds): boolean {
  return clampStep(value, delta, bounds) !== value
}
