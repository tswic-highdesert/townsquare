/**
 * The calendar, assembled. `design/hifi-v2` section 04.
 *
 * Same seam as `today.ts` and `nearby.ts`: a pure function from the town's raw
 * items to exactly what the screen renders, so every rule that decides what a
 * resident sees — and every date decision, which is where all four of the bugs
 * so far have been — is testable without a browser, a server or a live scrape.
 *
 * Three sources of truth are reused rather than re-derived, and reusing them is
 * the point: `townDay` is the whole of the "today is a question about
 * America/Chicago" rule, `clockParts` is the whole of the hi-fi's split clock,
 * and `categorize` is deliberately narrow because a wrong tint is worse than no
 * tint. A second copy of any of them is a second thing to get wrong.
 *
 * ## What this module refuses to compute
 *
 * **Anything relative to "now".** "In 31 min", "on now", the now line, and
 * which rows have already finished are all left to the client, which recomputes
 * them off `startsAt` / `endsAt` on a ticking clock. This payload is cached for
 * a minute and a resident leaves a screen open for an hour; a server-rendered
 * "in 31 min" is wrong within the minute and absurd within the hour. See
 * `apps/web/src/events/relative.ts`, which is unit tested on its own.
 *
 * **A distance, or a position of any kind.** The calendar's coordinates are not
 * coordinates: `library.ts` and `state-parks.ts` stamp every event with one
 * hardcoded pair in the middle of Russellville regardless of where the thing
 * is, and a third source emits `(0, 0)`. `nearby.ts` documents the screenshot
 * that caught it. Nothing here reads `geo`.
 */

import type { EventItem, TownSquareItem } from '../../../packages/feed/src/lib/types.js'
import { categorize, clockParts, townDay, type EventCategory } from './today.js'

export type { EventCategory }

const isEvent = (i: TownSquareItem): i is EventItem => i.type === 'event'

export interface EventTown {
  id: string
  name: string
  timezone: string
}

/**
 * One row of the agenda, as the screen renders it.
 *
 * The absolute instants (`startsAt`, `endsAt`) travel alongside the formatted
 * labels rather than instead of them. The labels are the town's timezone, which
 * the client does not know; the instants are what the client needs to say "on
 * now" without asking the server again.
 */
export interface EventRow {
  id: string
  title: string
  /** The venue line. One line, and empty when the scrape had nothing to say. */
  detail: string
  location: string
  startsAt: string
  /** Null whenever an end time cannot be stated honestly. See `honestEnd`. */
  endsAt: string | null
  allDay: boolean
  /** `5:30`, or `All` when the row is an all-day marker. */
  timeLabel: string
  /** `pm`, or `day`. Split because the hi-fi sets them at different sizes. */
  meridiem: string
  /** `to 9:30`, or null. */
  endLabel: string | null
  category: EventCategory
  source: string
  sourceName: string
  url: string | null
}

/** A written gap, not a drawn one. See the note on `GAP_MINUTES`. */
export interface DayGap {
  kind: 'gap'
  minutes: number
  /** `1 hr 30 min` */
  lengthLabel: string
  /** A sentence, because four empty hours on a civic calendar is normal. */
  line: string
}

export interface DayRows {
  kind: 'rows'
  rows: EventRow[]
}

export type DaySegment = DayRows | DayGap

export interface WeekCell {
  day: string
  /** `Wed` */
  name: string
  /** `5` */
  num: string
  count: number
  isToday: boolean
  isPast: boolean
  isSelected: boolean
  /** What a screen reader is told, because dots are a glance and not a label. */
  label: string
}

export interface DayPayload {
  town: EventTown
  /** `YYYY-MM-DD`, in the town's timezone, always. */
  day: string
  isToday: boolean
  /** `Wednesday` */
  dayName: string
  /** `Wednesday 5 August` */
  eyebrow: string
  /** `Today in Russellville`, or `Wednesday in Russellville`. */
  headline: string
  /** Everything on this calendar day, including all-day markers. */
  total: number
  week: WeekCell[]
  segments: DaySegment[]
  /**
   * The morning after, on the same scroll.
   *
   * At nine in the evening today is over, and the honest answer to "what's on"
   * is tomorrow. A day view that dead ends at midnight makes a resident
   * navigate to learn nothing. Null when the next day is empty, because an
   * empty heading is worse than no heading.
   */
  next: { day: string; label: string; rows: EventRow[]; total: number } | null
  /** When the payload was built. The staleness has to be visible somewhere. */
  generatedAt: string
}

export interface MonthChip {
  id: string
  title: string
  category: EventCategory
}

export interface MonthCell {
  day: string
  num: number
  inMonth: boolean
  isToday: boolean
  count: number
  chips: MonthChip[]
  /** How many did not fit under the three-chip cap. */
  more: number
  /** 0 to 1, against the busiest day in this month. Volume, not kind. */
  load: number
  label: string
}

export interface MonthPayload {
  town: EventTown
  /** `YYYY-MM` */
  month: string
  /** `August 2026` */
  label: string
  total: number
  /** Null at the edges of the data, so the arrows can be disabled honestly. */
  prevMonth: string | null
  nextMonth: string | null
  /** Sunday-first, whole weeks, so the grid is always rectangular. */
  weeks: MonthCell[][]
  today: string
  generatedAt: string
}

export interface EventDetailPayload {
  town: EventTown
  id: string
  title: string
  description: string | null
  category: EventCategory
  allDay: boolean
  startsAt: string
  endsAt: string | null
  day: string
  /** `Saturday morning`, the answer to the question actually being asked. */
  whenPlain: string
  /** `Sat 8 August, 7:00 am to 12:00 pm`, for the person filling a calendar. */
  whenExact: string
  location: string
  /** Only when the location is an address we can honestly hand to a map. */
  directionsUrl: string | null
  source: { id: string; name: string; url: string | null }
  url: string | null
  /** What else is on that day. Real, and the thing a person asks next. */
  alsoThatDay: EventRow[]
  generatedAt: string
}

export interface SourceInfo {
  id: string
  name: string
  url?: string
}

export interface EventsInput {
  now: string
  town: EventTown
  items: readonly TownSquareItem[]
  sources: ReadonlyMap<string, SourceInfo>
}

/* ────────────────────────────────────────────────────────── formatting ── */

function parts(iso: string, timezone: string, opts: Intl.DateTimeFormatOptions): string {
  return new Intl.DateTimeFormat('en-GB', { timeZone: timezone, ...opts }).format(new Date(iso))
}

/** `5 August`. `en-GB` because `August 5` reads as a heading, not a date. */
function dayAndMonth(iso: string, timezone: string): string {
  return parts(iso, timezone, { day: 'numeric', month: 'long' })
}

/** Midday of a town day, as an instant. The safe hour to format a bare date. */
function dayInstant(day: string): string {
  return `${day}T12:00:00Z`
}

/** Shift a `YYYY-MM-DD` by whole days without going near a timezone. */
export function shiftDay(day: string, delta: number): string {
  const ms = Date.parse(`${day}T00:00:00Z`) + delta * 86_400_000
  return new Date(ms).toISOString().slice(0, 10)
}

/** Days between two town days. Positive when `b` is later. */
export function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000)
}

/** `1 hr 30 min`, `45 min`, `2 hr`. */
export function lengthLabel(minutes: number): string {
  const hours = Math.floor(minutes / 60)
  const rest = minutes % 60
  if (hours === 0) return `${rest} min`
  if (rest === 0) return `${hours} hr`
  return `${hours} hr ${rest} min`
}

/** `5:30 pm`, lowercased, which is how the rest of the app sets a clock. */
function clockLabel(iso: string, timezone: string): string {
  const { time, meridiem } = clockParts(iso, timezone)
  return `${time} ${meridiem.toLowerCase()}`
}

/* ─────────────────────────────────────────────────────── the data traps ── */

const NAMED_ENTITIES: Readonly<Record<string, string>> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
}

/**
 * Undo one round of HTML escaping left behind by the scrapes.
 *
 * Two of the sources hand back text they read out of an HTML attribute without
 * unescaping it, so the feed carries `RVLA Written Driver&#039;s License Prep`
 * as a title and `calendar.aspx?game_id=7748&amp;sport_id=1` as a URL. React
 * escapes on output, so the title renders the entity to a resident verbatim,
 * and the URL is worse than cosmetic: `&amp;sport_id` is not a parameter, so
 * the link opens the wrong page.
 *
 * This is decoding, not editing. It changes no word of what a source wrote,
 * and it is a single pass, so a title that genuinely contains `&amp;amp;`
 * comes out as `&amp;` rather than being unwound to something nobody typed.
 * The real fix is in the scrapers; this stops the bug reaching a screen in the
 * meantime.
 */
export function decodeEntities(text: string): string {
  return text.replace(/&(#\d{1,6}|#[xX][0-9a-fA-F]{1,5}|[a-zA-Z]{2,6});/g, (whole, body: string) => {
    if (body.startsWith('#')) {
      const code = body[1] === 'x' || body[1] === 'X'
        ? Number.parseInt(body.slice(2), 16)
        : Number.parseInt(body.slice(1), 10)
      // Refuse anything outside the printable range rather than emitting a
      // control character or a lone surrogate into the payload.
      return code >= 32 && code <= 0x10ffff ? String.fromCodePoint(code) : whole
    }
    return NAMED_ENTITIES[body.toLowerCase()] ?? whole
  })
}

/**
 * An end time, or null when there is not an honest one.
 *
 * Three shapes in the feed need refusing, and all three came out of the probe
 * rather than out of the type:
 *
 * 1. **An all-day event has no wall-clock end.** Its stored start is midnight
 *    and its stored end is 23:59:59 of some later day, both artefacts of the
 *    iCal conversion. "All day, to 11:59 pm" is a sentence about the data model.
 * 2. **`endDate === startDate`** on 25 events, which is a source that filled the
 *    column rather than a thing that takes no time.
 * 3. **An end on a later calendar day.** `packages/feed/src/lib/ical.ts` converts
 *    an exclusive iCal `DTEND` to 23:59:59 *of the exclusive day*, so a single
 *    ATU game arrives claiming to run two days. Rendering "to 11:59 pm tomorrow"
 *    on a two-hour softball game is worse than saying nothing.
 */
export function honestEnd(event: EventItem, timezone: string): string | null {
  if (event.isAllDay) return null
  const end = event.endDate
  if (!end) return null
  if (Date.parse(end) <= Date.parse(event.startDate)) return null
  if (townDay(end, timezone) !== townDay(event.startDate, timezone)) return null
  return end
}

/**
 * The calendar day an event belongs to: its start day, and only its start day.
 *
 * A multi-day event is not spread across the cells it spans, and that is a
 * deliberate loss. `endDate` cannot carry the weight: the iCal sources convert
 * an exclusive `DTEND` into 23:59:59 of the excluded day, so 112 of 318 events
 * with an end claim a span that is one day longer than the truth — every single
 * Arkansas Tech home game among them. Spanning would print "Softball vs East
 * Central" on two days for a two-hour game, on every cell of the month grid at
 * once. Showing it once, on the day it starts, is always true.
 *
 * It stops being a loss the day the scrapers subtract the day they should.
 */
export function eventDay(event: EventItem, timezone: string): string {
  return townDay(event.startDate, timezone)
}

/**
 * All-day markers sort last, whatever their nominal midnight start says.
 *
 * Straight from `today.ts`, and for the same reason: "summer session ends" is
 * true of the whole day and actionable at no point in it, so a resident
 * scanning the list wants the thing at 5:30 first. Sorting on the raw start
 * puts every one of the 134 all-day entries above breakfast.
 */
function byStart(a: EventItem, b: EventItem): number {
  const allDay = Number(a.isAllDay ?? false) - Number(b.isAllDay ?? false)
  if (allDay !== 0) return allDay
  /*
   * Parsed, not compared as strings.
   *
   * The scrapes do not agree on a format: the iCal sources emit
   * `2026-08-17T17:00:00-05:00` and the school district's emits
   * `2026-08-17T19:30:00.000Z`. Sorting those lexicographically put a 7:30pm
   * event above a 5:00pm one, and then the written gap announced the wrong
   * time to come back. Caught by screenshotting a busy Monday.
   */
  return Date.parse(a.startDate) - Date.parse(b.startDate)
}

/**
 * A location we can hand to a map, or null.
 *
 * Requires a leading street number and a comma, which is the shape the two
 * civic scrapes publish (`320 W C St, Russellville, AR 72801`). Everything else
 * in the location column is a venue name, a bare town, or `Location TBA`, and a
 * directions link to "Location TBA" sends a neighbour to a search results page
 * at the moment they are trying to leave the house.
 *
 * This reads the address *string*, never `geo`. See the module note.
 */
export function directionsFor(location: string): string | null {
  const text = location.trim()
  if (!/^\d+\s+\S/.test(text) || !text.includes(',')) return null
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(text)}`
}

/* ───────────────────────────────────────────────────────────── the rows ── */

function toRow(event: EventItem, input: EventsInput): EventRow {
  const tz = input.town.timezone
  const allDay = event.isAllDay === true
  const { time, meridiem } = clockParts(event.startDate, tz)
  const end = honestEnd(event, tz)
  const source = input.sources.get(event.source)

  return {
    id: event.id,
    title: decodeEntities(event.title),
    // The location is the only detail line there is. `cost`, `recurrence`,
    // `contactPhone` and `contactEmail` are declared on `EventItem` and set by
    // nothing: zero of 343 events carry any of them.
    detail: decodeEntities(event.location),
    location: decodeEntities(event.location),
    startsAt: event.startDate,
    endsAt: end,
    allDay,
    // A midnight start is an artefact of an all-day entry, not a claim that
    // something happens at midnight. `today.ts` splits it "All" / "day"; this
    // matches so the two screens cannot drift.
    timeLabel: allDay ? 'All' : time,
    meridiem: allDay ? 'day' : meridiem.toLowerCase(),
    endLabel: end ? `to ${clockParts(end, tz).time}` : null,
    category: categorize(event),
    source: event.source,
    sourceName: source?.name ?? event.source,
    url: event.url ? decodeEntities(event.url) : null,
  }
}

/**
 * How long a stretch of nothing has to be before it is worth a sentence.
 *
 * Ninety minutes. Below that the gap is just the shape of an afternoon and
 * naming it is noise; above it a resident scrolling past six rows of nothing
 * wonders whether the scrape broke. The hi-fi writes the gap rather than
 * drawing it, because a dotted rule with "3 hr" on it reads as an error and a
 * sentence reads as a town.
 */
const GAP_MINUTES = 90

/**
 * A run of rows with the quiet stretches named.
 *
 * Measured from the end of the previous thing where there is an honest end, and
 * from its start where there is not. All-day rows never open or close a gap:
 * they have no position in the day at all, so a gap measured against midnight
 * would report a nine-hour lull before breakfast.
 */
export function segmentDay(rows: readonly EventRow[], timezone: string): DaySegment[] {
  const out: DaySegment[] = []
  let run: EventRow[] = []

  for (const row of rows) {
    const previous = run[run.length - 1]
    if (previous && !previous.allDay && !row.allDay) {
      const from = Date.parse(previous.endsAt ?? previous.startsAt)
      const minutes = Math.round((Date.parse(row.startsAt) - from) / 60_000)
      if (minutes >= GAP_MINUTES) {
        out.push({ kind: 'rows', rows: run })
        out.push({
          kind: 'gap',
          minutes,
          lengthLabel: lengthLabel(minutes),
          line: `A quiet stretch, then it picks back up at ${clockLabel(row.startsAt, timezone)}.`,
        })
        run = []
      }
    }
    run.push(row)
  }

  if (run.length > 0) out.push({ kind: 'rows', rows: run })
  return out
}

/* ──────────────────────────────────────────────────────────── the day ──── */

function indexByDay(
  items: readonly TownSquareItem[],
  timezone: string,
): Map<string, EventItem[]> {
  const byDay = new Map<string, EventItem[]>()
  for (const item of items) {
    if (!isEvent(item)) continue
    const day = eventDay(item, timezone)
    const bucket = byDay.get(day)
    if (bucket) bucket.push(item)
    else byDay.set(day, [item])
  }
  for (const bucket of byDay.values()) bucket.sort(byStart)
  return byDay
}

/** Sunday-first, matching the month grid and every paper calendar in town. */
function weekStart(day: string): string {
  const weekday = new Date(`${day}T00:00:00Z`).getUTCDay()
  return shiftDay(day, -weekday)
}

export function assembleDay(input: EventsInput & { day?: string }): DayPayload {
  const tz = input.town.timezone
  const today = townDay(input.now, tz)
  const day = input.day ?? today
  const byDay = indexByDay(input.items, tz)

  const rows = (byDay.get(day) ?? []).map((e) => toRow(e, input))
  const isToday = day === today

  const start = weekStart(day)
  const week: WeekCell[] = Array.from({ length: 7 }, (_, i) => {
    const cell = shiftDay(start, i)
    const count = byDay.get(cell)?.length ?? 0
    const name = parts(dayInstant(cell), tz, { weekday: 'short' })
    const num = String(Number(cell.slice(8, 10)))
    return {
      day: cell,
      name,
      num,
      count,
      isToday: cell === today,
      isPast: cell < today,
      isSelected: cell === day,
      // Dots are a glance affordance and not an accessible one, so the real
      // count is spoken. "Nothing on" rather than "0 events", because a screen
      // reader user should hear a sentence and not a spreadsheet.
      label: [
        `${parts(dayInstant(cell), tz, { weekday: 'long' })} ${dayAndMonth(dayInstant(cell), tz)}`,
        cell === today ? 'today' : null,
        count === 0 ? 'nothing on' : count === 1 ? '1 thing on' : `${count} things on`,
      ]
        .filter(Boolean)
        .join(', '),
    }
  })

  const nextDay = shiftDay(day, 1)
  const nextRows = (byDay.get(nextDay) ?? []).map((e) => toRow(e, input))

  return {
    town: input.town,
    day,
    isToday,
    dayName: parts(dayInstant(day), tz, { weekday: 'long' }),
    eyebrow: `${parts(dayInstant(day), tz, { weekday: 'long' })} ${dayAndMonth(dayInstant(day), tz)}`,
    headline: isToday
      ? `Today in ${input.town.name}`
      : `${parts(dayInstant(day), tz, { weekday: 'long' })} in ${input.town.name}`,
    total: rows.length,
    week,
    segments: segmentDay(rows, tz),
    next:
      nextRows.length > 0
        ? {
            day: nextDay,
            label:
              daysBetween(today, nextDay) === 1
                ? `Tomorrow, ${parts(dayInstant(nextDay), tz, { weekday: 'long' })} ${dayAndMonth(dayInstant(nextDay), tz)}`
                : `${parts(dayInstant(nextDay), tz, { weekday: 'long' })} ${dayAndMonth(dayInstant(nextDay), tz)}`,
            // Three rows, not the whole day. This is a pointer at tomorrow, not
            // a second agenda: the heading is a link to the real one.
            rows: nextRows.slice(0, 3),
            total: nextRows.length,
          }
        : null,
    generatedAt: input.now,
  }
}

/* ────────────────────────────────────────────────────────── the month ──── */

/** How many titles a cell shows before it hands the rest to the load bar. */
const CHIP_CAP = 3

export function monthOf(day: string): string {
  return day.slice(0, 7)
}

function monthLabel(month: string, timezone: string): string {
  return parts(`${month}-15T12:00:00Z`, timezone, { month: 'long', year: 'numeric' })
}

/** The last day of a month, without a Date arithmetic trick anyone has to read. */
function lastOfMonth(month: string): string {
  const year = Number(month.slice(0, 4))
  const index = Number(month.slice(5, 7))
  // Day 0 of the next month is the last day of this one.
  const d = new Date(Date.UTC(year, index, 0))
  return d.toISOString().slice(0, 10)
}

function addMonth(month: string, delta: number): string {
  const year = Number(month.slice(0, 4))
  const index = Number(month.slice(5, 7)) - 1 + delta
  const d = new Date(Date.UTC(year, index, 1))
  return d.toISOString().slice(0, 7)
}

export function assembleMonth(input: EventsInput & { month?: string }): MonthPayload {
  const tz = input.town.timezone
  const today = townDay(input.now, tz)
  const byDay = indexByDay(input.items, tz)
  const month = input.month ?? monthOf(today)

  const days = [...byDay.keys()].sort()
  const firstWithData = days[0]
  const lastWithData = days[days.length - 1]

  const first = `${month}-01`
  const last = lastOfMonth(month)

  /**
   * The load bar is scaled against the busiest day *in this month*, not against
   * the busiest in the feed.
   *
   * A month is read against itself: the question a resident asks of a grid is
   * "which of these days is the busy one", and a scale set by a different
   * month's outlier flattens every cell in this one to a stub. The count is
   * spoken in the cell's label either way, so the bar never has to carry the
   * number on its own.
   */
  let busiest = 0
  for (let d = first; d <= last; d = shiftDay(d, 1)) {
    busiest = Math.max(busiest, byDay.get(d)?.length ?? 0)
  }

  const cellFor = (day: string): MonthCell => {
    const events = byDay.get(day) ?? []
    const num = Number(day.slice(8, 10))
    const inMonth = monthOf(day) === month
    const count = events.length
    return {
      day,
      num,
      inMonth,
      isToday: day === today,
      count,
      chips: events.slice(0, CHIP_CAP).map((e) => ({
        id: e.id,
        title: decodeEntities(e.title),
        category: categorize(e),
      })),
      more: Math.max(0, count - CHIP_CAP),
      load: busiest > 0 ? count / busiest : 0,
      label: `${parts(dayInstant(day), tz, { weekday: 'long' })} ${dayAndMonth(dayInstant(day), tz)}, ${
        count === 0 ? 'nothing on' : count === 1 ? '1 thing on' : `${count} things on`
      }`,
    }
  }

  const weeks: MonthCell[][] = []
  let cursor = weekStart(first)
  const endOfGrid = shiftDay(weekStart(last), 6)
  while (cursor <= endOfGrid) {
    weeks.push(Array.from({ length: 7 }, (_, i) => cellFor(shiftDay(cursor, i))))
    cursor = shiftDay(cursor, 7)
  }

  let total = 0
  for (let d = first; d <= last; d = shiftDay(d, 1)) total += byDay.get(d)?.length ?? 0

  /**
   * Navigation stops at the edges of the data rather than running forever.
   *
   * The feed holds nine months, and a resident who taps back four times into a
   * wall of empty cells has learned nothing except that the app is broken. Null
   * here disables the arrow, which says "there is nothing that way" in the one
   * place the question gets asked.
   */
  const prev = addMonth(month, -1)
  const next = addMonth(month, 1)

  return {
    town: input.town,
    month,
    label: monthLabel(month, tz),
    total,
    prevMonth: firstWithData && prev >= monthOf(firstWithData) ? prev : null,
    nextMonth: lastWithData && next <= monthOf(lastWithData) ? next : null,
    weeks,
    today,
    generatedAt: input.now,
  }
}

/* ─────────────────────────────────────────────────────────── the detail ── */

/**
 * `Saturday morning`, `Tomorrow evening`, `This afternoon`.
 *
 * Derived, never stored. The question a resident is actually asking is roughly
 * when, and an ISO stamp is not an answer to it. Every part of this comes from
 * the start instant read in the town's timezone: the relative day, and which
 * third of the day the hour falls in. An all-day entry has no hour, so it says
 * so rather than rounding midnight up to "morning".
 */
export function whenPlain(iso: string, timezone: string, today: string, allDay: boolean): string {
  const day = townDay(iso, timezone)
  const away = daysBetween(today, day)
  const weekday = parts(dayInstant(day), timezone, { weekday: 'long' })

  const relative =
    away === 0 ? 'This' : away === 1 ? 'Tomorrow' : away === -1 ? 'Yesterday' : null
  // Inside the coming week a bare weekday is unambiguous and warmer than a
  // date. Past that it stops being, and "Saturday" three weeks out is a trap.
  const dated = away > 1 && away < 7 ? weekday : `${weekday} ${dayAndMonth(dayInstant(day), timezone)}`

  if (allDay) {
    // "This, all day" is not a sentence. The day says itself here.
    const named = away === 0 ? 'Today' : (relative ?? dated)
    return `${named}, all day`
  }

  // `% 24` because `hour12: false` reports midnight as 24 in some ICU builds
  // and as 0 in others, and "24 is not less than 12" quietly moves every
  // midnight event to the evening.
  const hour = Number(parts(iso, timezone, { hour: '2-digit', hour12: false })) % 24
  const partOfDay = hour < 12 ? 'morning' : hour < 17 ? 'afternoon' : 'evening'
  if (relative) return `${relative} ${partOfDay}`
  // A comma once the date is in it. "Monday 17 August afternoon" is three
  // nouns in a row; "Monday 17 August, afternoon" is how a person says it.
  return away > 1 && away < 7 ? `${dated} ${partOfDay}` : `${dated}, ${partOfDay}`
}

/** `Sat 8 August, 7:00 am to 12:00 pm`. The stamp, for the calendar filler. */
export function whenExact(
  event: EventItem,
  timezone: string,
): string {
  const day = parts(dayInstant(townDay(event.startDate, timezone)), timezone, {
    weekday: 'short',
    day: 'numeric',
    month: 'long',
  })
  if (event.isAllDay) return `${day}, all day`
  const end = honestEnd(event, timezone)
  const start = clockLabel(event.startDate, timezone)
  return end ? `${day}, ${start} to ${clockLabel(end, timezone)}` : `${day}, ${start}`
}

export function assembleDetail(input: EventsInput & { id: string }): EventDetailPayload | null {
  const tz = input.town.timezone
  const today = townDay(input.now, tz)

  const event = input.items.find((i): i is EventItem => isEvent(i) && i.id === input.id)
  if (!event) return null

  const day = eventDay(event, tz)
  const source = input.sources.get(event.source)

  const also = input.items
    .filter(isEvent)
    .filter((e) => e.id !== event.id && eventDay(e, tz) === day)
    .sort(byStart)
    .slice(0, 4)
    .map((e) => toRow(e, input))

  return {
    town: input.town,
    id: event.id,
    title: decodeEntities(event.title),
    // 91 of 343 events carry no description, and a third of the ones that do
    // are the title again. An empty block is worse than no block.
    description:
      event.description && event.description.trim() && event.description.trim() !== event.title
        ? decodeEntities(event.description.trim())
        : null,
    category: categorize(event),
    allDay: event.isAllDay === true,
    startsAt: event.startDate,
    endsAt: honestEnd(event, tz),
    day,
    whenPlain: whenPlain(event.startDate, tz, today, event.isAllDay === true),
    whenExact: whenExact(event, tz),
    location: decodeEntities(event.location),
    directionsUrl: directionsFor(decodeEntities(event.location)),
    source: {
      id: event.source,
      name: source?.name ?? event.source,
      url: source?.url ?? null,
    },
    url: event.url ? decodeEntities(event.url) : null,
    alsoThatDay: also,
    generatedAt: input.now,
  }
}
