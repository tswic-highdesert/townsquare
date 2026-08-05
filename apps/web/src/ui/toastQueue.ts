/**
 * The rules a toast stack obeys, with no React and no DOM in them.
 *
 * These are the decisions from `design/hifi-v2/sections/10-states.html`:
 * timing per kind, three at a time, identical toasts collapsing into a count,
 * and a problem toast that never leaves on its own. They live here rather than
 * inside the provider because they are the part that can be wrong, and a
 * reducer you can call in a test is the difference between "we believe the
 * fourth toast pushes the oldest out" and knowing it.
 */

export type ToastKind = 'info' | 'good' | 'warn' | 'problem'

export interface ToastAction {
  label: string
  /** Named on purpose: an action that is not undo still closes the toast. */
  onAct: () => void
  /** The glyph beside the label. Undo and retry both have one. */
  icon?: 'undo' | 'refresh'
}

export interface Toast {
  id: string
  kind: ToastKind
  message: string
  action?: ToastAction
  /**
   * How many identical toasts collapsed into this one.
   *
   * Three saves in a row is one toast saying "3 stories saved", not three
   * toasts saying the same thing while the stack eats the screen.
   */
  count: number
  /**
   * What to say once this toast has collapsed, given the count.
   *
   * The design's example is "3 stories saved.", not "Saved to your list. (3)".
   * Only the caller knows the plural of its own sentence, so it supplies it;
   * without one the count renders as a small tally instead, which is honest if
   * less graceful.
   */
  plural?: (n: number) => string
}

/** The line actually shown, once collapsing is taken into account. */
export function toastText(toast: Toast): string {
  if (toast.count < 2) return toast.message
  return toast.plural ? toast.plural(toast.count) : `${toast.message} (${toast.count})`
}

/** Three at once. The fourth pushes the oldest out early. */
export const MAX_VISIBLE = 3

/**
 * How long a toast waits before it leaves, in milliseconds. 0 means never.
 *
 * The numbers are not round for their own sake. Four seconds confirms a tap
 * the finger already knows about. Eight is long enough to read a line, notice
 * the mistake, and reach the undo button, which is the whole reason undo
 * exists. Ten gives a warning a second look. A problem needs a decision, so it
 * waits for one.
 */
export function toastDuration(kind: ToastKind, hasAction: boolean): number {
  if (kind === 'problem') return 0
  if (kind === 'warn') return 10_000
  return hasAction ? 8_000 : 4_000
}

/**
 * Add a toast, applying collapse and the cap.
 *
 * Newest goes on the end because the stack renders bottom-anchored: the eye is
 * already at the bottom of a phone, so a new toast should land where the eye
 * is and push the older ones up rather than appear above them.
 */
export function pushToast(list: readonly Toast[], next: Toast): Toast[] {
  const twin = list.findIndex((t) => t.kind === next.kind && t.message === next.message)
  if (twin !== -1) {
    const grown = { ...list[twin]!, count: list[twin]!.count + 1, action: next.action }
    // Moves to the end as well as counting up, so a repeat restarts its timer
    // in the position a fresh toast would have had.
    return [...list.slice(0, twin), ...list.slice(twin + 1), grown]
  }

  const grown = [...list, next]
  if (grown.length <= MAX_VISIBLE) return grown

  /**
   * A problem toast is never the one pushed out. It is the only kind that is
   * waiting on a decision, and dropping it to make room for "saved to your
   * list" loses the only message in the stack that mattered.
   */
  const victim = grown.findIndex((t) => t.kind !== 'problem')
  if (victim === -1) return grown
  return [...grown.slice(0, victim), ...grown.slice(victim + 1)]
}

export function dismissToast(list: readonly Toast[], id: string): Toast[] {
  return list.filter((t) => t.id !== id)
}

/**
 * What a screen reader is given for a toast.
 *
 * The same line the eye gets, without the icon and without the word "toast".
 * Hearing "saved to your list" three times says something different from
 * hearing "3 stories saved" once, and only one of them is true.
 */
export function announce(toast: Toast): string {
  return toastText(toast)
}
