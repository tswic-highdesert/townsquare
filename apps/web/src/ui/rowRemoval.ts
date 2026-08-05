/**
 * Where focus goes when a row deletes itself.
 *
 * A secondary action that removes its own row is the case this whole component
 * exists to get right, and it is the one that breaks silently: the button the
 * user just pressed stops existing, focus falls to `<body>`, and a keyboard or
 * screen-reader user is returned to the top of the page with no announcement
 * that anything happened. Nothing throws, nothing looks wrong in a screenshot,
 * and the list is now unusable without a mouse.
 *
 * The rule: land on the row that took the removed row's place, because that is
 * where the eye already is. If it was the last row, step back to the new last
 * row. If it was the only row, there is no row left to hold focus, so the list
 * itself takes it and the empty state gets announced.
 *
 * Kept separate from the component and free of the DOM, because it is the part
 * that can be wrong.
 */

export type FocusTarget = { kind: 'row'; index: number } | { kind: 'list' }

export interface RemovalInput {
  /** How many rows there were *before* the removal. */
  count: number
  /** Which one went. */
  removed: number
}

export function nextFocusAfterRemoval({ count, removed }: RemovalInput): FocusTarget {
  const left = count - 1
  if (left <= 0) return { kind: 'list' }

  // Clamp rather than trust the caller: a stale index from an out-of-date
  // render would otherwise send focus somewhere that does not exist, which is
  // the same failure this function exists to prevent.
  const target = Math.min(Math.max(removed, 0), left - 1)
  return { kind: 'row', index: target }
}

/**
 * What a screen reader is told after a row goes.
 *
 * The removal itself is silent otherwise: focus moving is not an announcement,
 * and a resident who cannot see the list has no way to know whether the press
 * worked. One polite sentence naming the thing and what is left.
 */
export function removalAnnouncement(label: string, remaining: number): string {
  if (remaining === 0) return `${label} removed. Nothing left in this list.`
  return `${label} removed. ${remaining} ${remaining === 1 ? 'item' : 'items'} left.`
}
