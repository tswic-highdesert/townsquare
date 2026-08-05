/**
 * Keyboard containment for a dialog, split into a part that can be tested and
 * a part that has to touch the DOM.
 *
 * The rules come from `design/hifi-v2/sections/10-states.html`: Tab is trapped
 * between the first and last focusable element inside, Shift+Tab from the
 * first wraps to the last, and focus lands on the heading rather than on a
 * button, because landing on "Remove listing" is how an accident happens.
 */

/**
 * Everything a browser will hand focus to, in document order.
 *
 * `[tabindex="-1"]` is excluded on purpose: the dialog heading carries it so
 * it can be focused programmatically on open, and it must not then become a
 * stop somebody has to Tab back through.
 */
export const FOCUSABLE =
  'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])'

export interface WrapInput {
  /** How many focusable elements the dialog contains. */
  count: number
  /**
   * Where focus is now, as an index into that list.
   *
   * `-1` means focus is on the heading, which is where it lands on open and is
   * not itself a tab stop. Shift+Tab from there has to go somewhere, and the
   * end of the dialog is the only place that keeps the user inside it.
   */
  current: number
  shiftKey: boolean
}

/**
 * The index Tab should move to, or `null` to let the browser do it.
 *
 * Returning null for the ordinary case matters: intercepting every Tab means
 * reimplementing focus order, and the browser is better at that than we are.
 * We only step in at the two edges where it would leave.
 */
export function wrapFocus({ count, current, shiftKey }: WrapInput): number | null {
  if (count === 0) return null
  if (shiftKey) {
    // From the first element, or from the heading, go to the end.
    return current <= 0 ? count - 1 : null
  }
  return current === count - 1 ? 0 : null
}

/**
 * Which dismissals a dialog accepts.
 *
 * Escape closes everything, including a destructive confirm: Escape is the
 * cancel path and cancel is always safe. The scrim is different. Tapping it
 * closes an informational sheet, and does not close either confirm, because a
 * stray thumb on a phone should not answer a question for you.
 */
export function acceptsScrimDismiss(kind: 'sheet' | 'confirm' | 'alert'): boolean {
  return kind === 'sheet'
}
