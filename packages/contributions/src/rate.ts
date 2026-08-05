/**
 * The pause, which is not a wall.
 *
 * The most prolific contributor in town is an asset — it is the person running
 * the market booth or the school calendar, not an attacker — so the ladder is
 * arranged to make somebody notice their own volume long before it stops them,
 * and to say what the limit is actually protecting when it does.
 *
 *   1. Nothing at all, up to six a day. Most residents never see any of this.
 *   2. A quiet line at seven. No confirmation, no delay, just a sentence.
 *   3. The pause at nine. Drafting continues, publishing waits.
 *   4. A moderator is told at fifteen attempts, and the resident is told they
 *      were told. A limit nobody is watching only annoys honest people.
 *
 * Two things are load-bearing and both are shared with `Reports`:
 *
 * **The window rolls, it does not reset.** A calendar-day limit hands somebody
 * a fresh allowance at midnight, which is the hour a compromised account would
 * prefer. `retryAt` is therefore computed from when the oldest counted
 * contribution falls out of the window, so the answer is "at 6pm, about two
 * hours" and not "tomorrow".
 *
 * **Corrections do not count.** They are reviewed anyway, so the pause buys
 * nothing against them, and the one thing this product cannot afford to slow
 * down is a resident fixing the town's own data. That exemption is a property
 * of the type and lives in `policy.ts`, not here.
 */

const DAY_MS = 24 * 60 * 60 * 1000

export const LADDER = {
  /** Below this, nothing is said at all. */
  quiet: 6,
  /** At this many, a line under the publish bar. Nothing is blocked. */
  notice: 7,
  /** At this many, publishing pauses. */
  pause: 9,
  /** Attempts, not publications. Past this a moderator hears about it. */
  escalate: 15,
} as const

export type PauseLevel = 'clear' | 'noticed' | 'paused'

export interface PauseState {
  level: PauseLevel
  /** How many counted contributions are inside the rolling window. */
  count: number
  /** Attempts inside the window, refused ones included. */
  attempts: number
  /** When publishing opens again. Null unless paused. */
  retryAt: number | null
  /** True once a moderator has been told, so the resident can be told too. */
  escalated: boolean
  /** What is still possible. The most useful sentence on a rate limit screen. */
  stillAllowed: readonly string[]
}

const STILL_ALLOWED = [
  'Keep writing. Drafts still save, there is no limit on those.',
  'Corrections to listings still go through. Those are reviewed anyway.',
  'Anything already scheduled still sends on time.',
] as const

/**
 * Where a resident is on the ladder right now.
 *
 * Pure, and takes the timestamps rather than a store, so the composer can ask
 * for this before somebody types a word and get the same answer the publish
 * path will give them afterwards.
 */
export function assessPause(
  counted: readonly number[],
  attempts: number,
  now: number,
): PauseState {
  const since = now - DAY_MS
  const inWindow = counted.filter((t) => t > since).sort((a, b) => a - b)
  const count = inWindow.length
  const escalated = attempts >= LADDER.escalate

  if (count < LADDER.pause) {
    return {
      level: count >= LADDER.notice ? 'noticed' : 'clear',
      count,
      attempts,
      retryAt: null,
      escalated,
      stillAllowed: STILL_ALLOWED,
    }
  }

  // The oldest one that has to fall out of the window before the count is under
  // the limit again. With exactly nine, that is the first of them.
  const releases = inWindow[count - LADDER.pause]
  return {
    level: 'paused',
    count,
    attempts,
    retryAt: releases === undefined ? now + DAY_MS : releases + DAY_MS,
    escalated,
    stillAllowed: STILL_ALLOWED,
  }
}

/**
 * The line under the publish bar, or nothing.
 *
 * Step two of the ladder does the real work: it makes a person notice their own
 * volume without stopping them. It is phrased as an observation rather than a
 * warning, because the person reading it has done nothing wrong.
 */
export function pauseNotice(state: PauseState): string | null {
  if (state.level !== 'noticed') return null
  return `${ordinal(state.count + 1)} one today. No trouble, just so you know.`
}

function ordinal(n: number): string {
  const names = [
    '',
    'First',
    'Second',
    'Third',
    'Fourth',
    'Fifth',
    'Sixth',
    'Seventh',
    'Eighth',
    'Ninth',
  ]
  return names[n] ?? `Number ${n}`
}

/** What the pause screen says. Written from the threat model, not the number. */
export function pauseMessage(state: PauseState): string {
  return (
    `That is ${state.count} things you have added today, and they were all good ones. ` +
    `Town Square puts a pause in after ${LADDER.pause} in a day. Not because you did anything wrong. ` +
    "It is there so that if somebody's account is ever taken over, the town does not wake up to two " +
    'hundred fake events, and the pause has to apply to everyone or it protects nobody.'
  )
}
