/**
 * The severity ladder, which is one object and must stay one object.
 *
 * Section 9 of `design/hifi-v2` makes an argument worth restating here, because
 * this file exists to enforce it: **four rungs, not seven.** Every level you add
 * is a level somebody has to learn, and the ones in the middle are the ones
 * nobody can tell apart. A resident needs four answers, in this order — is this
 * for me, is it happening now, do I have to do something, and does it wake me
 * up — and four rungs answer that with one question each.
 *
 * The ladder is deliberately the *same object* in four places: the rung printed
 * on a notice card, the threshold a resident slides to choose what pushes, the
 * decision about whether a phone makes a sound, and the gate in front of an
 * organisation composing one. A second scale for any of those would produce two
 * things called "urgent" that mean different things one screen apart, which is
 * exactly how a severity system stops meaning anything.
 *
 * ## Three spellings, one ladder
 *
 * When this was written there were three vocabularies in the repo for the same
 * four rungs:
 *
 *   `packages/feed`   info | warning | urgent | emergency
 *   section 9         informational | advisory | urgent | emergency
 *   contributions     informational | advisory | urgent | emergency
 *
 * The feed's is not a different ladder, it is the same ladder with two renamed
 * middle rungs, and the National Weather Service already maps into it. So the
 * translation lives in `fromFeedSeverity` and nowhere else. The alternative —
 * letting both spellings travel — means every comparison in the system has to
 * know about both, and the first one that forgets silently sorts `warning`
 * below `advisory`.
 */

/** The four rungs, quietest first. Order is meaningful and is relied upon. */
export const SEVERITIES = ['informational', 'advisory', 'urgent', 'emergency'] as const

export type Severity = (typeof SEVERITIES)[number]

/**
 * How loud each rung is, as a number, so thresholds can be compared.
 *
 * Exported as a rank rather than left implicit in array order, because
 * `indexOf` on a readonly tuple is the kind of thing somebody refactors into a
 * `Set` and quietly breaks.
 */
export function rank(severity: Severity): number {
  return SEVERITIES.indexOf(severity)
}

/** What each rung actually does, in the physical terms the design insists on. */
export interface Rung {
  severity: Severity
  /** The word printed above the headline. Never colour alone. */
  label: string
  /** What happens to a phone. The definition, not a description of it. */
  consequence: string
  /** Whether this rung may reach a lock screen at all. */
  pushes: boolean
  /**
   * Whether this rung overrides silent mode and quiet hours.
   *
   * True for exactly one rung, and it is the one nobody can turn off.
   */
  breaksThroughSilent: boolean
  /**
   * Whether a takeover is shown on arrival.
   *
   * A takeover is for the first ten minutes. Day three of a river rise needs a
   * bar you can live above, which is what `decayFor` is for.
   */
  takesOver: boolean
}

export const LADDER: Record<Severity, Rung> = {
  informational: {
    severity: 'informational',
    label: 'Informational',
    consequence: 'Appears in the app. No phone makes a sound.',
    // The single most load-bearing line in section 9: the ladder has four rungs
    // and only three of them are allowed to reach a lock screen. Leaf pickup and
    // a planning agenda are things you go and look at, not things that interrupt.
    pushes: false,
    breaksThroughSilent: false,
    takesOver: false,
  },
  advisory: {
    severity: 'advisory',
    label: 'Advisory',
    consequence: 'A quiet push, and it stays on Today until it passes.',
    pushes: true,
    breaksThroughSilent: false,
    takesOver: false,
  },
  urgent: {
    severity: 'urgent',
    label: 'Urgent',
    consequence: 'A push, the alert bar, and a takeover when it arrives.',
    pushes: true,
    breaksThroughSilent: false,
    takesOver: true,
  },
  emergency: {
    severity: 'emergency',
    label: 'Emergency',
    consequence: 'Breaks through a silent phone. This one cannot be turned off.',
    pushes: true,
    breaksThroughSilent: true,
    takesOver: true,
  },
}

/**
 * The feed's spelling, translated once.
 *
 * `packages/feed` types its notices `info | warning | urgent | emergency`, and
 * `nws-alerts.ts` maps the National Weather Service's own scale into that
 * (Extreme, Severe, Moderate, Minor/Unknown). This is the only place either
 * spelling is allowed to meet.
 *
 * **An unrecognised value rounds down, it does not throw and it does not round
 * up.** Section 9's rule for an ambiguous upstream source is to be lossy in the
 * safe direction and let the resident raise their own threshold. A scraper
 * emitting a value nobody anticipated must not be able to wake up the town.
 */
export function fromFeedSeverity(value: string | null | undefined): Severity {
  switch (value) {
    case 'emergency':
      return 'emergency'
    case 'urgent':
      return 'urgent'
    case 'warning':
      return 'advisory'
    case 'info':
      return 'informational'
    default:
      return 'informational'
  }
}

/**
 * Whether a rung clears a resident's threshold.
 *
 * `emergency` ignores the threshold entirely, and that is stated here rather
 * than left to the caller. There is exactly one path that decides whether
 * something reaches a person, and a caller who forgot the special case would
 * produce a silence nobody notices until the night it matters.
 */
export function reaches(severity: Severity, threshold: Severity): boolean {
  if (severity === 'emergency') return true
  return rank(severity) >= rank(threshold)
}

/**
 * Whether quiet hours hold this back until morning.
 *
 * Same shape and the same exception: an emergency comes through on silent, at
 * 3am, and the design says so in a sentence rather than hiding it in a toggle.
 */
export function heldByQuietHours(severity: Severity): boolean {
  return !LADDER[severity].breaksThroughSilent
}

/**
 * How a live notice loses urgency over time.
 *
 * The thing that actually kills emergency design is a situation that lasts four
 * days: a takeover on day one is right and a takeover on day three is an app you
 * delete. So the presentation decays on a schedule a resident can feel — a
 * takeover collapses to a bar after the first view or after thirty minutes,
 * whichever comes first, and the bar collapses to a line.
 *
 * Pure, and takes the two facts it needs rather than reading a clock, so the
 * shell and any later channel decay identically.
 */
export type Presentation = 'takeover' | 'bar' | 'line' | 'card'

export const TAKEOVER_MINUTES = 30

export function decayFor(input: {
  severity: Severity
  /** Milliseconds since the notice was issued. */
  ageMs: number
  /** Whether this resident has already opened it once. */
  seen: boolean
  /** Set when the resident chose "hide this until it changes". */
  hiddenAtDigest?: string | null
  /** The digest of the notice as it stands now. */
  digest?: string | null
}): Presentation {
  const rung = LADDER[input.severity]

  // Hiding is not unsubscribing, and it is not permanent. Any change from the
  // source brings it straight back, which is what "until it changes" promises
  // and what makes the dismissal safe to offer at all.
  const stillHidden =
    input.hiddenAtDigest != null &&
    input.digest != null &&
    input.hiddenAtDigest === input.digest

  if (!rung.takesOver) return rung.pushes ? 'bar' : 'card'
  if (stillHidden) return 'line'
  if (input.seen || input.ageMs > TAKEOVER_MINUTES * 60_000) return 'bar'
  return 'takeover'
}
