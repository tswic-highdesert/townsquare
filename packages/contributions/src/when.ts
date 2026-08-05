/**
 * Reading a time the way somebody would say it out loud.
 *
 * This is the one piece of the composer that lives on the server rather than in
 * the browser, and the reason is the rule the whole repo runs on: a second door
 * onto contributing — the MCP server, a mobile client — has to read "sat june
 * 14 at 7pm" the same way the shell does, or the town ends up with two date
 * grammars and one of them is wrong on Saturdays.
 *
 * **It never answers with a time. It answers with readings.** That distinction
 * is the design. A date picker is unambiguous and slow; natural language is
 * fast and occasionally wrong, and a wrong start time is the most damaging
 * error this product can make — fifteen people stand in a car park at the wrong
 * hour and nobody trusts the events feed again. So this returns what it thinks
 * it heard, in full prose with the weekday spelled out, and something else asks
 * the human. `06/14` and `14/06` look identical to a person skimming;
 * "Saturday 14 June" does not.
 *
 * **Ambiguity is never resolved by preference.** "friday at 7" comes back as
 * two readings, not as 7pm with a shrug. Defaulting to pm would be right most
 * of the time in a town with evening ball games and wrong every Saturday
 * morning at the market, which is exactly the population that matters most.
 *
 * The states line up with the five the composer draws, plus one: `needs_time`
 * is a date with no hour in it ("saturday morning"), which the composer can
 * render in the same slot as "could not read" but with a sentence that says
 * what is actually missing instead of throwing the whole thing away.
 */

const WEEKDAYS = [
  'sunday',
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
] as const

const MONTHS = [
  'january',
  'february',
  'march',
  'april',
  'may',
  'june',
  'july',
  'august',
  'september',
  'october',
  'november',
  'december',
] as const

/** Enough of a word to be unmistakable, and no more. `jun` is not `july`. */
const MONTH_PREFIX = 3
const WEEKDAY_PREFIX = 3

export interface WhenReading {
  /** Epoch milliseconds, in the town's timezone. */
  startsAt: number
  /** "Saturday 14 June, 7pm". Read back to the resident verbatim. */
  label: string
}

export type WhenResult =
  | { kind: 'empty' }
  | { kind: 'ok'; text: string; reading: WhenReading }
  /** Two or more honest readings. Nothing is picked. */
  | { kind: 'ambiguous'; text: string; readings: WhenReading[] }
  /** A day, and no time in it. */
  | { kind: 'needs_time'; text: string; dayLabel: string }
  | { kind: 'unreadable'; text: string }

export interface WhenOptions {
  /** The town's zone. "Today" is a question about Russellville, never about UTC. */
  timezone: string
  /** Epoch ms. Injected so the tests are not a function of when they run. */
  now: number
}

export function readWhen(input: string, opts: WhenOptions): WhenResult {
  const text = input.trim()
  if (!text) return { kind: 'empty' }

  const words = text.toLowerCase().replace(/[.,]/g, ' ')
  const today = civilFrom(opts.now, opts.timezone)

  const day = readDay(words, today, opts)
  const time = readTime(words)

  if (!day) return { kind: 'unreadable', text }

  if (!time) {
    return { kind: 'needs_time', text, dayLabel: dayLabel(day, opts) }
  }

  const readings = time.hours.map((hour) => {
    const startsAt = instantIn(day.year, day.month, day.day, hour, time.minute, opts.timezone)
    return { startsAt, label: `${dayLabel(day, opts)}, ${clock(hour, time.minute)}` }
  })

  const first = readings[0]
  if (!first) return { kind: 'unreadable', text }
  return readings.length === 1
    ? { kind: 'ok', text, reading: first }
    : { kind: 'ambiguous', text, readings }
}

// ── the day half ────────────────────────────────────────────────────────────

interface CivilDate {
  year: number
  month: number
  day: number
}

function readDay(words: string, today: CivilDate, opts: WhenOptions): CivilDate | null {
  if (/\btoday\b|\btonight\b/.test(words)) return today
  if (/\btomorrow\b/.test(words)) return addDays(today, 1)

  // "june 14" and "14 june" both, because both are things people write and
  // neither is more correct than the other in a town.
  const monthName = MONTHS.findIndex((m) =>
    new RegExp(`\\b${m.slice(0, MONTH_PREFIX)}[a-z]*\\b`).test(words),
  )
  if (monthName !== -1) {
    const dayNumber = /\b(\d{1,2})(?:st|nd|rd|th)?\b/.exec(stripTime(words))
    if (dayNumber?.[1]) {
      const day = Number(dayNumber[1])
      if (day >= 1 && day <= 31) {
        // A month that has already gone by this year means next year. Somebody
        // typing "january 8" in November is not filing a ten-month-old event.
        const year =
          monthName + 1 < today.month || (monthName + 1 === today.month && day < today.day)
            ? today.year + 1
            : today.year
        return valid(year, monthName + 1, day) ? { year, month: monthName + 1, day } : null
      }
    }
  }

  const weekday = WEEKDAYS.findIndex((d) =>
    new RegExp(`\\b${d.slice(0, WEEKDAY_PREFIX)}[a-z]*\\b`).test(words),
  )
  if (weekday !== -1) {
    // "next friday" is the one after the coming one, which is what people
    // mean by it and the only reading that is ever worth more than a coin flip.
    const jump = /\bnext\b/.test(words) ? 7 : 0
    return addDays(nextWeekday(today, weekday, opts), jump)
  }

  // A bare numeric date, which only counts with a separator: "6/14". A lone
  // number is a time far more often than it is a day of the month.
  const slash = /\b(\d{1,2})\s*[/-]\s*(\d{1,2})\b/.exec(words)
  if (slash?.[1] && slash[2]) {
    const month = Number(slash[1])
    const day = Number(slash[2])
    const year = month < today.month || (month === today.month && day < today.day)
      ? today.year + 1
      : today.year
    return valid(year, month, day) ? { year, month, day } : null
  }

  return null
}

/**
 * The coming instance of a weekday, today included.
 *
 * Read off a noon instant through the town's own zone rather than the server's,
 * so a process that booted in UTC does not think Friday evening in Russellville
 * is already Saturday.
 */
function nextWeekday(today: CivilDate, weekday: number, opts: WhenOptions): CivilDate {
  const at = instantIn(today.year, today.month, today.day, 12, 0, opts.timezone)
  const zoned = new Intl.DateTimeFormat('en-US', {
    timeZone: opts.timezone,
    weekday: 'short',
  }).format(new Date(at))
  const from = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(zoned)
  if (from === -1) return today
  return addDays(today, (weekday - from + 7) % 7)
}

function addDays(date: CivilDate, days: number): CivilDate {
  const ms = Date.UTC(date.year, date.month - 1, date.day) + days * 86_400_000
  const d = new Date(ms)
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate() }
}

function valid(year: number, month: number, day: number): boolean {
  if (month < 1 || month > 12 || day < 1 || day > 31) return false
  const d = new Date(Date.UTC(year, month - 1, day))
  return d.getUTCMonth() + 1 === month && d.getUTCDate() === day
}

// ── the time half ───────────────────────────────────────────────────────────

interface ReadTime {
  /** One hour when it is unambiguous, two when it genuinely is not. */
  hours: number[]
  minute: number
}

/** Removes the clock so the day reader cannot mistake "7pm" for the 7th. */
function stripTime(words: string): string {
  return words.replace(/\b\d{1,2}(:\d{2})?\s*(am|pm|a\.m\.|p\.m\.)\b/g, ' ')
}

function readTime(words: string): ReadTime | null {
  if (/\bnoon\b|\bmidday\b/.test(words)) return { hours: [12], minute: 0 }
  if (/\bmidnight\b/.test(words)) return { hours: [0], minute: 0 }

  const match = /\b(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\b/.exec(afterAt(words))
  if (!match?.[1]) return null

  const raw = Number(match[1])
  const minute = match[2] ? Number(match[2]) : 0
  if (raw > 23 || minute > 59) return null

  const meridiem = match[3]
  if (meridiem === 'am') return { hours: [raw === 12 ? 0 : raw], minute }
  if (meridiem === 'pm') return { hours: [raw === 12 ? 12 : raw + 12], minute }

  // 13 and up say pm by themselves. 0 and 12 are only ever one hour.
  if (raw === 0 || raw > 12) return { hours: [raw], minute }
  if (raw === 12) return { hours: [12], minute }

  // A part-of-day word settles it without anybody guessing.
  if (/\bmorning\b/.test(words)) return { hours: [raw], minute }
  if (/\bafternoon\b|\bevening\b|\bnight\b/.test(words)) {
    return { hours: [raw < 12 ? raw + 12 : raw], minute }
  }

  // And here is the ambiguity, kept rather than resolved.
  return { hours: [raw, raw + 12], minute }
}

/**
 * Everything after an "at", when there is one.
 *
 * "june 14 at 7" has two numbers in it and only one of them is a clock. The
 * word people put between them is the strongest signal available and it costs
 * nothing to use.
 */
function afterAt(words: string): string {
  const at = / \bat\b /.exec(words)
  return at && at.index !== undefined ? words.slice(at.index) : stripDayNumber(words)
}

/** Drops a day-of-month that sits beside a month name, so the time is what is left. */
function stripDayNumber(words: string): string {
  const month = MONTHS.find((m) => new RegExp(`\\b${m.slice(0, MONTH_PREFIX)}[a-z]*\\b`).test(words))
  if (!month) return words
  return words.replace(
    new RegExp(`(\\b${month.slice(0, MONTH_PREFIX)}[a-z]*\\b\\s*)(\\d{1,2})(?:st|nd|rd|th)?\\b`),
    '$1',
  ).replace(new RegExp(`\\b(\\d{1,2})(?:st|nd|rd|th)?\\s*(${month.slice(0, MONTH_PREFIX)}[a-z]*\\b)`), '$2')
}

// ── formatting, in the town's zone ──────────────────────────────────────────

function dayLabel(date: CivilDate, opts: WhenOptions): string {
  const at = instantIn(date.year, date.month, date.day, 12, 0, opts.timezone)
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: opts.timezone,
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  }).format(new Date(at))
}

function clock(hour: number, minute: number): string {
  const meridiem = hour < 12 ? 'am' : 'pm'
  const twelve = hour % 12 === 0 ? 12 : hour % 12
  return minute === 0
    ? `${twelve}${meridiem}`
    : `${twelve}:${String(minute).padStart(2, '0')}${meridiem}`
}

/** Today, as the town reckons it. */
function civilFrom(now: number, timezone: string): CivilDate {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(now))
  const [year, month, day] = parts.split('-').map(Number)
  return { year: year ?? 1970, month: month ?? 1, day: day ?? 1 }
}

/**
 * A wall-clock time in the town, as an instant.
 *
 * Two passes, because the offset depends on the instant and the instant depends
 * on the offset. One pass is wrong twice a year, for an hour, in exactly the
 * week people are adding the most events.
 */
export function instantIn(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  timezone: string,
): number {
  const naive = Date.UTC(year, month - 1, day, hour, minute)
  const first = naive - offsetAt(naive, timezone)
  return naive - offsetAt(first, timezone)
}

function offsetAt(utcMs: number, timezone: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(new Date(utcMs))

  const get = (type: string): number => Number(parts.find((p) => p.type === type)?.value ?? '0')
  const asUtc = Date.UTC(
    get('year'),
    get('month') - 1,
    get('day'),
    get('hour'),
    get('minute'),
    get('second'),
  )
  return asUtc - utcMs
}
