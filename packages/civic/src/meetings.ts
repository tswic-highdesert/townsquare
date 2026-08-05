/**
 * City hall: an index of when the bodies that govern this town meet.
 *
 * ## What this is not, and why
 *
 * Section 9 draws a much richer screen than this file builds, and the gap is
 * deliberate. Its meeting rows carry six states — agenda posted, agenda not out
 * yet, agenda due in four days, cancelled, minutes posted, "minutes not posted
 * yet, 28 days" — and every one of them is the interesting part of that screen.
 * Not one of them is sourceable today. What Town Square holds is a calendar
 * entry scraped from the city's and the county's public calendars: a title, a
 * start time, a place, and a link back. There is no agenda ingest, no minutes
 * ingest, and no cancellation feed.
 *
 * So those states are **absent rather than guessed**. A row that says "agenda
 * posted" when nobody looked is worse than a row that says nothing, because the
 * whole product is a claim about somebody else's document and a resident who
 * drives to a meeting we said was on is a resident we have actually cost
 * something. `agendaState` is a real field with a real `unknown` value, and the
 * shell is expected to print the honest sentence rather than leave a gap that
 * reads as our bug.
 *
 * The day an agenda scraper exists, this file gains a field and the screen
 * gains a tag. Nothing else about it changes.
 *
 * ## What is real
 *
 * Which bodies meet, when, where, and the link to the page we got it from.
 * Grouped the way the design groups it, because "is anything on tonight" and
 * "what did they decide last month" are different questions and the answer to
 * the first should never be three scrolls down.
 */

/** The bodies whose calendars we actually carry. */
export interface GoverningBody {
  id: string
  name: string
  /** The feed source id that produces this body's meetings. */
  sourceId: string
}

export interface CivicMeeting {
  id: string
  bodyName: string
  title: string
  /** Epoch ms. */
  startsAt: number
  /** Where it is held, when the calendar says. */
  location: string | null
  /** The source's own page for this meeting. */
  url: string | null
  sourceId: string
  /**
   * Whether an agenda has been published.
   *
   * `unknown` is the honest answer for every meeting today and it is a value
   * rather than a null so that a screen cannot mistake "we have not checked"
   * for "there is not one". See the note at the top of this file.
   */
  agendaState: 'unknown'
  /**
   * Whether the meeting was called off.
   *
   * Also `unknown`, for the same reason, and it matters more than it looks: the
   * design's rule is that a cancelled meeting is struck through and kept, never
   * removed, because a meeting that disappears looks like we lost it. We cannot
   * strike one through until somebody tells us it was cancelled.
   */
  cancelled: 'unknown'
}

/** The shape `packages/feed` produces for a calendar entry. */
export interface IngestedEvent {
  id: string
  type: string
  title: string
  source: string
  startDate: string
  location?: string | undefined
  url?: string | undefined
}

/**
 * Which calendar entries are meetings of a governing body.
 *
 * Matched on the body's own name in the title rather than on a keyword like
 * "meeting", because the town's calendars are full of things called meetings
 * that are not government: a book club, a chamber mixer, an AA meeting. The
 * cost of matching narrowly is that a body nobody listed is missed, which is a
 * gap somebody can see and fix. The cost of matching broadly is a civic index
 * with a quilting circle in it, which is a product that looks unserious in the
 * one place it cannot afford to.
 */
const BODY_PATTERNS: ReadonlyArray<{ name: string; pattern: RegExp }> = [
  { name: 'City Council', pattern: /\bcity council\b/i },
  { name: 'Planning Commission', pattern: /\bplanning commission\b/i },
  { name: 'Quorum Court', pattern: /\bquorum court\b/i },
  { name: 'School Board', pattern: /\bschool board\b/i },
  { name: 'Board of Trustees', pattern: /\bboard of trustees\b/i },
  { name: 'Civil Service Commission', pattern: /\bcivil service commission\b/i },
  { name: 'Historic District Commission', pattern: /\bhistoric district commission\b/i },
  { name: 'Airport Advisory Board', pattern: /\bairport advisory board\b/i },
  { name: 'Parks and Recreation Commission', pattern: /\bparks (and|&) recreation\b/i },
]

/** The body this entry belongs to, or null if it is not a government meeting. */
export function bodyFor(title: string): string | null {
  for (const body of BODY_PATTERNS) {
    if (body.pattern.test(title)) return body.name
  }
  return null
}

export function toMeeting(item: IngestedEvent): CivicMeeting | null {
  const bodyName = bodyFor(item.title)
  if (!bodyName) return null

  const startsAt = Date.parse(item.startDate)
  if (!Number.isFinite(startsAt)) return null

  return {
    id: item.id,
    bodyName,
    // The scraped title, cleaned of the shouting some calendars publish in but
    // never rewritten. "QUORUM COURT MEETING @" is the county's own text.
    title: tidyTitle(item.title),
    startsAt,
    location: item.location?.trim() || null,
    url: item.url ?? null,
    sourceId: item.source,
    agendaState: 'unknown',
    cancelled: 'unknown',
  }
}

/**
 * Strip the artefacts of a calendar export without editing what it says.
 *
 * A trailing `@` with nothing after it is a location field the county left
 * empty, and a title in full capitals is a data-entry habit rather than
 * emphasis. Neither is a word being changed: no word is added, removed or
 * reordered, and anything that is not clearly an artefact is left alone.
 */
export function tidyTitle(raw: string): string {
  const trimmed = raw.replace(/\s*@\s*$/, '').trim()
  if (trimmed !== trimmed.toUpperCase()) return trimmed
  // All capitals, so it is shouting rather than an acronym. Title-cased word by
  // word, with short connecting words left lower except at the start.
  const small = new Set(['of', 'and', 'the', 'for', 'to', 'in', 'at', 'on'])
  return trimmed
    .toLowerCase()
    .split(/\s+/)
    .map((word, at) => {
      if (at > 0 && small.has(word)) return word
      return word.charAt(0).toUpperCase() + word.slice(1)
    })
    .join(' ')
}

export interface MeetingIndex {
  /** Between now and seven days out. The question most people are asking. */
  thisWeek: CivicMeeting[]
  laterThisMonth: CivicMeeting[]
  /** Held, most recent first. Capped, because this is an index not an archive. */
  recentlyHeld: CivicMeeting[]
  /** Which bodies we carry a calendar for, so the screen can say how many. */
  bodies: string[]
  /**
   * What we cannot tell a resident, named on the payload rather than in a
   * comment nobody reading the JSON will find.
   */
  notCarried: readonly string[]
}

const WEEK_MS = 7 * 24 * 60 * 60 * 1000
const RECENT_LIMIT = 6

export function assembleMeetings(
  items: readonly IngestedEvent[],
  now: number,
  horizonMs = 45 * 24 * 60 * 60 * 1000,
): MeetingIndex {
  const meetings: CivicMeeting[] = []
  for (const item of items) {
    if (item.type !== 'event') continue
    const meeting = toMeeting(item)
    if (meeting) meetings.push(meeting)
  }

  const upcoming = meetings
    .filter((m) => m.startsAt >= now && m.startsAt <= now + horizonMs)
    .sort((a, b) => a.startsAt - b.startsAt)

  return {
    thisWeek: upcoming.filter((m) => m.startsAt < now + WEEK_MS),
    laterThisMonth: upcoming.filter((m) => m.startsAt >= now + WEEK_MS),
    recentlyHeld: meetings
      .filter((m) => m.startsAt < now)
      .sort((a, b) => b.startsAt - a.startsAt)
      .slice(0, RECENT_LIMIT),
    bodies: [...new Set(meetings.map((m) => m.bodyName))].sort(),
    notCarried: [
      'agendas',
      'minutes',
      'vote records',
      'cancellations',
      'public comment deadlines',
    ],
  }
}
