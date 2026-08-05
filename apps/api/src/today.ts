/**
 * Today, assembled.
 *
 * `design/hifi` section 4a is the resident home, and it is one screen made of
 * six sources that know nothing about each other. This module is the seam: a
 * pure function from the town's raw items to the exact shape the screen renders,
 * so the ordering rules that decide what a resident sees first are testable
 * without a browser, an HTTP server, or a live scrape.
 *
 * The rule the whole file follows: **a section with no real data does not
 * appear.** Every field here traces to something ingested or something a
 * neighbour actually built. The hi-fi shows a weather chip and a neighbour
 * stream; neither has a source yet, so neither is in this payload. Inventing a
 * plausible boil-water notice to fill a card is the one failure mode a town
 * information service cannot recover from.
 */

/**
 * Types come from the deep path, not from `@townsquare/feed`.
 *
 * The barrel re-exports the scrapers, and `lib/types.ts` is the one file in
 * that package with no runtime closure at all. Importing the barrel — even
 * `import type` — pulls every scraper into this app's strict typecheck, and
 * those are checked under `tsconfig.ported.json` on purpose. See the note at
 * the top of that file.
 */
import type {
  BusinessItem,
  EventItem,
  NoticeItem,
  StoryItem,
  TownSquareItem,
} from '../../../packages/feed/src/lib/types.js'

export type { TownSquareItem }

const isStory = (i: TownSquareItem): i is StoryItem => i.type === 'story'
const isEvent = (i: TownSquareItem): i is EventItem => i.type === 'event'
const isNotice = (i: TownSquareItem): i is NoticeItem => i.type === 'notice'
const isBusiness = (i: TownSquareItem): i is BusinessItem => i.type === 'business'

export interface TodaySource {
  id: string
  name: string
  type: string
}

export interface TodayStory {
  id: string
  title: string
  summary: string
  url: string | null
  imageUrl: string | null
  source: string
  sourceInitial: string
  publishedAt: string
  timeLabel: string
  readingMinutes: number
}

export interface TodayEvent {
  id: string
  title: string
  location: string
  detail: string
  startsAt: string
  timeLabel: string
  meridiem: string
  category: EventCategory
  url: string | null
}

export interface TodayCivicItem {
  id: string
  title: string
  detail: string
  url: string | null
}

export interface TodayNotice {
  id: string
  title: string
  detail: string
  severity: 'info' | 'warning' | 'urgent' | 'emergency'
  url: string | null
}

export interface TodayBusiness {
  id: string
  name: string
  category: string
  detail: string
  url: string | null
  /** True, false, or null when the hours cannot be read honestly. */
  openNow: boolean | null
  phone: string | null
  /** A directions link, built from the address the scrape already has. */
  mapUrl: string | null
}

export interface TodayCreation {
  slug: string
  name: string
  tagline: string
  description: string
  author: string | null
  authorInitials: string | null
  icon: string | null
}

export interface TodayPayload {
  town: { id: string; name: string; timezone: string }
  greeting: string
  dateLabel: string
  dayName: string
  lead: TodayStory | null
  /** The rest of the recent news, after the lead. Carries photos where the source published one. */
  more: TodayStory[]
  events: { items: TodayEvent[]; total: number }
  neighbors: { featured: TodayCreation | null; rest: TodayCreation[] }
  cityHall: { notice: TodayNotice | null; items: TodayCivicItem[] }
  directory: TodayBusiness[]
  footer: { updatedLabel: string; sourceCount: number; creationCount: number }
}

/**
 * The tint a category gets in the events list.
 *
 * Four buckets, not forty. The hi-fi tints an event's icon tile by what kind of
 * thing it is, and the value of that is instant scanning — which dies the
 * moment there are enough categories that two of them look alike.
 */
export type EventCategory = 'civic' | 'music' | 'sport' | 'community'

/**
 * Deliberately narrow, and `community` is the honest default.
 *
 * An early version matched a bare `session`, which tinted "July/August Summer
 * Session Ends" as a council meeting. A category that is wrong is worse than no
 * category: the tint exists so a resident can skip what they do not care about,
 * and one that misfires teaches them to stop trusting it.
 */
const CATEGORY_WORDS: ReadonlyArray<readonly [EventCategory, RegExp]> = [
  [
    'civic',
    /\b(city council|council meeting|commission|board of|city hall|public hearing|town hall|quorum court|election|regular session|special session)\b/i,
  ],
  ['music', /\b(concert|live music|band|choir|symphony|open mic|karaoke|recital)\b/i],
  ['sport', /\b(vs\.?|tournament|playoff|scrimmage|5k|football|basketball|baseball|softball|soccer|volleyball)\b/i],
]

export function categorize(item: { title: string; tags?: string[]; source: string }): EventCategory {
  const hay = [item.title, ...(item.tags ?? []), item.source].join(' ')
  for (const [category, pattern] of CATEGORY_WORDS) if (pattern.test(hay)) return category
  return 'community'
}

/**
 * The town's own calendar day, as `YYYY-MM-DD`.
 *
 * `en-CA` is the shortest way to a sortable date from `Intl`, and going through
 * `Intl` at all is the point: "today" on a screen in Russellville is a question
 * about America/Chicago, never about whatever timezone the server booted in.
 */
export function townDay(iso: string, timezone: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(iso))
}

function parts(iso: string, timezone: string, opts: Intl.DateTimeFormatOptions): string {
  return new Intl.DateTimeFormat('en-US', { timeZone: timezone, ...opts }).format(new Date(iso))
}

/** `5:30` and `PM` separately, because the hi-fi sets them at different sizes. */
export function clockParts(iso: string, timezone: string): { time: string; meridiem: string } {
  const formatted = parts(iso, timezone, { hour: 'numeric', minute: '2-digit', hour12: true })
  const [time = '', meridiem = ''] = formatted.split(' ')
  return { time, meridiem }
}

/** `6:40am`, the compact form used on the lead story's byline. */
function compactTime(iso: string, timezone: string): string {
  const { time, meridiem } = clockParts(iso, timezone)
  return `${time}${meridiem.toLowerCase()}`
}

/**
 * When a story ran, said the way a person would.
 *
 * A bare clock time is only honest for today. `4:51pm` on a story filed
 * yesterday afternoon reads, at ten in the morning, as something that has not
 * happened yet — which is worse than useless on a screen whose entire promise
 * is that it is current. So the time is for today, the weekday for the last
 * week, and a date beyond that.
 */
export function storyStamp(iso: string, timezone: string, todayKey: string): string {
  const day = townDay(iso, timezone)
  if (day === todayKey) return compactTime(iso, timezone)

  const daysBack = Math.round(
    (Date.parse(`${todayKey}T00:00:00Z`) - Date.parse(`${day}T00:00:00Z`)) / 86_400_000,
  )
  if (daysBack === 1) return 'Yesterday'
  if (daysBack > 1 && daysBack < 7) return parts(iso, timezone, { weekday: 'long' })
  return parts(iso, timezone, { month: 'short', day: 'numeric' })
}

export function greetingFor(iso: string, timezone: string): string {
  const hour = Number(parts(iso, timezone, { hour: 'numeric', hour12: false }))
  if (hour < 12) return 'Good morning'
  if (hour < 17) return 'Good afternoon'
  return 'Good evening'
}

/**
 * Reading time from the words that exist, never from a stored estimate.
 *
 * Sources publish summaries of wildly different lengths and most publish no
 * estimate at all, so one honest formula applied to all of them beats a field
 * that is authoritative for two sources and absent for the rest.
 */
export function readingMinutes(text: string): number {
  const words = text.trim().split(/\s+/).filter(Boolean).length
  return Math.max(1, Math.round(words / 220))
}

function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean)
  if (words.length === 0) return '·'
  const first = words[0]?.[0] ?? ''
  const second = words.length > 1 ? (words[words.length - 1]?.[0] ?? '') : (words[0]?.[1] ?? '')
  return (first + second).toUpperCase()
}

/**
 * A stable daily rotation over a list.
 *
 * The directory strip needs to feel alive without lying about it. Every
 * business in `businesses.ts` carries the same `createdAt` — the date of the
 * scrape — so there is no honest "newest" to sort by. Offsetting by the day
 * number gives a resident something different each morning, and gives every
 * business its turn, which is closer to the point of a town directory than
 * ranking would be.
 */
export function rotate<T>(items: readonly T[], dayKey: string, count: number): T[] {
  if (items.length === 0) return []
  const seed = Number(dayKey.replaceAll('-', '')) || 0
  const start = seed % items.length
  return Array.from({ length: Math.min(count, items.length) }, (_, i) => items[(start + i) % items.length] as T)
}

export interface AssembleInput {
  now: string
  town: { id: string; name: string; timezone: string }
  items: readonly TownSquareItem[]
  creations: ReadonlyArray<{
    slug: string
    name: string
    tagline: string
    description: string
    author?: string | null
    icon?: string | null
  }>
  sources: ReadonlyMap<string, TodaySource>
}

/**
 * How far back the hero will reach to find a story with a photo.
 *
 * The lead is the one slot on the screen with real visual weight, and a hero
 * with no art is a headline in a large font — it reads as a page that could not
 * fill itself. Roughly half the town's stories carry an image and none of the
 * university's do, so leading strictly by recency gives a flat screen most
 * mornings.
 *
 * Thirty-six hours is the compromise. Long enough to almost always find art,
 * short enough that the hero is never yesterday's news while today's sits
 * below it — and whatever it passed over becomes the first row of "More from
 * town" rather than disappearing.
 */
const LEAD_PHOTO_WINDOW_MS = 36 * 60 * 60 * 1000

export function pickLead(
  stories: readonly StoryItem[],
  nowMs: number,
): StoryItem | undefined {
  const withPhoto = stories.find(
    (s) => s.imageUrl && nowMs - new Date(s.publishedAt).getTime() <= LEAD_PHOTO_WINDOW_MS,
  )
  return withPhoto ?? stories[0]
}

export function assembleToday(input: AssembleInput): TodayPayload {
  const { now, town, items, creations, sources } = input
  const tz = town.timezone
  const nowMs = new Date(now).getTime()
  const dayKey = townDay(now, tz)
  const weekdayShort = parts(now, tz, { weekday: 'short' })
  const [nowHour = '0', nowMinute = '0'] = parts(now, tz, {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).split(':')
  const minutesNow = Number(nowHour) * 60 + Number(nowMinute)

  const sourceName = (id: string): string => sources.get(id)?.name ?? id
  const sourceType = (id: string): string => sources.get(id)?.type ?? 'community'

  // ── Top of town ────────────────────────────────────────────────────────
  // Newest story wins, and nothing else does. An editorial rank here would be
  // a judgement Town Square is not entitled to make about a neighbour's paper.
  const stories = items
    .filter(isStory)
    .filter((s) => new Date(s.publishedAt).getTime() <= nowMs)
    .sort((a, b) => b.publishedAt.localeCompare(a.publishedAt))

  const asStory = (s: StoryItem): TodayStory => ({
    id: s.id,
    title: s.title,
    summary: s.description,
    url: s.url ?? null,
    imageUrl: s.imageUrl ?? null,
    source: sourceName(s.source),
    sourceInitial: (sourceName(s.source)[0] ?? '\u00b7').toUpperCase(),
    publishedAt: s.publishedAt,
    timeLabel: storyStamp(s.publishedAt, tz, dayKey),
    readingMinutes: readingMinutes(s.body || s.description),
  })

  const leadItem = pickLead(stories, nowMs)
  const lead: TodayStory | null = leadItem ? asStory(leadItem) : null

  // Everything else recent, newest first. If the hero reached past a newer
  // story to find a photo, that newer story is the first row here — the
  // preference costs it the big slot, never the screen.
  const more = stories.filter((s) => s.id !== leadItem?.id).slice(0, 4).map(asStory)

  // ── Happening today ────────────────────────────────────────────────────
  // Today's calendar day in the town's timezone, and only what has not already
  // finished. A list that opens with three things a resident missed reads as a
  // stale page, which is the one impression a daily screen cannot afford.
  const todayEvents = items
    .filter(isEvent)
    .filter((e) => townDay(e.startDate, tz) === dayKey)
    .sort((a, b) => a.startDate.localeCompare(b.startDate))

  const upcoming = todayEvents
    // An all-day entry is true until the day is over, and its stored start is
    // midnight — so the ordinary "has it finished" test would drop it at 12:01am.
    .filter((e) => e.isAllDay || new Date(e.endDate ?? e.startDate).getTime() >= nowMs)
    // All-day markers sort last, whatever their nominal midnight start says.
    // "Summer session ends" is true of the whole day and actionable at no point
    // in it; a resident scanning this list wants the thing at 5:30.
    .sort((a, b) => Number(a.isAllDay ?? false) - Number(b.isAllDay ?? false))

  const events = {
    total: todayEvents.length,
    items: upcoming.slice(0, 3).map((e) => {
      const { time, meridiem } = clockParts(e.startDate, tz)
      return {
        id: e.id,
        title: e.title,
        location: e.location,
        detail: [e.location, e.cost].filter(Boolean).join(' · '),
        startsAt: e.startDate,
        // A midnight start is a data artefact of an all-day entry, not a claim
        // that something happens at midnight.
        timeLabel: e.isAllDay ? 'All' : time,
        meridiem: e.isAllDay ? 'day' : meridiem,
        category: categorize(e),
        url: e.url ?? null,
      }
    }),
  }

  // ── From your neighbors ────────────────────────────────────────────────
  // Creations, and only creations. This section is the reason Town Square is
  // not a newsletter, so it leads with one at full size rather than showing
  // five equal rows nobody reads.
  const asCreation = (c: AssembleInput['creations'][number]): TodayCreation => ({
    slug: c.slug,
    name: c.name,
    tagline: c.tagline,
    description: c.description,
    author: c.author ?? null,
    // Null, not initials of the creation's own name. "The Burrito Index"
    // becoming a "TI" avatar reads as a person who does not exist, which is
    // precisely the impersonation the manifest's `author` refusal exists to
    // stop. With no attribution the screen says "a neighbor" and shows the icon.
    authorInitials: c.author ? initials(c.author) : null,
    icon: c.icon ?? null,
  })

  const neighbors = {
    featured: creations[0] ? asCreation(creations[0]) : null,
    rest: creations.slice(1, 4).map(asCreation),
  }

  // ── From city hall ─────────────────────────────────────────────────────
  // An active notice is the only thing on this screen that gets the tinted
  // card, and most days there is not one. The list under it is what government
  // sources have scheduled next, which is the part that is always true.
  const notices = items
    .filter(isNotice)
    .filter((n) => n.isActive && (!n.expires || new Date(n.expires).getTime() > nowMs))
    .sort((a, b) => severityRank(b.severity) - severityRank(a.severity))

  const noticeItem = notices[0]
  const civicSoon = items
    .filter(isEvent)
    .filter((e) => sourceType(e.source) === 'government')
    .filter((e) => new Date(e.startDate).getTime() >= nowMs)
    .filter((e) => townDay(e.startDate, tz) !== dayKey)
    .sort((a, b) => a.startDate.localeCompare(b.startDate))
    .slice(0, 2)

  const cityHall = {
    notice: noticeItem
      ? {
          id: noticeItem.id,
          title: noticeItem.title,
          detail: noticeItem.description,
          severity: noticeItem.severity,
          url: noticeItem.url ?? null,
        }
      : null,
    items: civicSoon.map((e) => ({
      id: e.id,
      title: e.title,
      detail: `${sourceName(e.source)} · ${parts(e.startDate, tz, { weekday: 'long' })}`,
      url: e.url ?? null,
    })),
  }

  // ── In the directory ───────────────────────────────────────────────────
  const directory = rotate(
    items.filter(isBusiness),
    dayKey,
    2,
  ).map((b) => {
    const state = openState(b.hours, weekdayShort, minutesNow)
    return {
      id: b.id,
      name: b.name,
      category: b.category,
      // Whether it is open right now beats a printed range someone has to
      // compare against their own watch. Falls back to the range, then to the
      // category, so the card always says something true.
      detail: state?.label ?? hoursToday(b.hours, weekdayShort) ?? b.category,
      openNow: state ? state.open : null,
      phone: b.phone ?? null,
      mapUrl: b.address
        ? `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(b.address)}`
        : null,
      url: b.website ?? null,
    }
  })

  return {
    town,
    greeting: greetingFor(now, tz),
    dayName: parts(now, tz, { weekday: 'long' }),
    dateLabel: parts(now, tz, { weekday: 'long', month: 'short', day: 'numeric' }),
    lead,
    more,
    events,
    neighbors,
    cityHall,
    directory,
    footer: {
      updatedLabel: compactTime(now, tz),
      sourceCount: new Set(items.map((i) => i.source)).size,
      creationCount: creations.length,
    },
  }
}

function severityRank(s: string): number {
  return { emergency: 3, urgent: 2, warning: 1, info: 0 }[s] ?? 0
}

/**
 * Today's hours out of a whole week of them.
 *
 * `businesses.ts` stores `Mon 6 AM to 11 PM, Tue …` as one string, and the
 * obvious thing — take the first clause — puts Monday's hours on a card someone
 * is reading on Wednesday. Wrong opening hours are worse than none: they send a
 * neighbour to a closed door.
 *
 * A day can carry more than one clause. `Mon 11 AM to 2 PM, 4 to 9 PM` is a
 * split shift, and the second clause has no weekday of its own — it belongs to
 * the day above it until the next weekday appears. 82 listings do this.
 *
 * Returns null when the string does not carry today, so the caller falls back
 * to the category rather than guessing.
 */
export function hoursToday(hours: string | undefined, weekdayShort: string): string | null {
  const clauses = clausesForDay(hours, weekdayShort)
  return clauses.length > 0 ? clauses.join(', ') : null
}

const WEEKDAY = /^(Mon|Tue|Wed|Thu|Fri|Sat|Sun)\b/i

function clausesForDay(hours: string | undefined, weekdayShort: string): string[] {
  if (!hours) return []
  const out: string[] = []
  let collecting = false

  for (const raw of hours.split(',')) {
    const text = raw.trim()
    if (!text) continue
    const day = WEEKDAY.exec(text)
    if (day) {
      collecting = day[0].toLowerCase() === weekdayShort.toLowerCase()
      if (collecting) out.push(text.slice(day[0].length).trim() || text)
      continue
    }
    // No weekday: a continuation of whatever day we are inside.
    if (collecting) out.push(text)
  }
  return out
}

/** Minutes past midnight, or null if this is not a time we recognise. */
function toMinutes(text: string, inheritedMeridiem: string | null): number | null {
  const m = /^(\d{1,2})(?::(\d{2}))?\s*(AM|PM)?$/i.exec(text.trim())
  if (!m) return null
  const meridiem = (m[3] ?? inheritedMeridiem)?.toUpperCase()
  if (!meridiem) return null

  let hour = Number(m[1])
  if (hour < 1 || hour > 12) return null
  if (meridiem === 'AM' && hour === 12) hour = 0
  if (meridiem === 'PM' && hour !== 12) hour += 12
  return hour * 60 + Number(m[2] ?? 0)
}

export interface OpenState {
  open: boolean
  label: string
}

/**
 * Whether a business is open at this minute, and what to say about it.
 *
 * Every branch that cannot be answered honestly returns null, and the card
 * falls back to showing the raw hours. "Open now" is a claim a neighbour will
 * act on by driving somewhere, so a guess is not a cheaper version of an
 * answer — it is a worse one.
 *
 * Two shapes in the data need care. `12 to 5 PM` omits the opening meridiem and
 * means noon, so a start with no meridiem inherits the end's. And `9 AM to
 * 12 AM` closes at midnight rather than opening and closing in the same
 * minute, so an end at or before the start rolls into the next day.
 */
export function openState(
  hours: string | undefined,
  weekdayShort: string,
  minutesNow: number,
): OpenState | null {
  const clauses = clausesForDay(hours, weekdayShort)
  if (clauses.length === 0) return null

  if (clauses.some((c) => /^closed$/i.test(c))) return { open: false, label: 'Closed today' }
  if (clauses.some((c) => /open 24 hours/i.test(c))) return { open: true, label: 'Open 24 hours' }

  const ranges: Array<{ start: number; end: number; startText: string; endText: string }> = []
  for (const clause of clauses) {
    const parts = clause.split(/\s+to\s+/i)
    if (parts.length !== 2) continue
    const startText = (parts[0] ?? '').trim()
    const endText = (parts[1] ?? '').trim()
    // `12 to 5 PM` is noon, not midnight: a start with no meridiem takes the
    // end's. Doing it the other way round opens the shop twelve hours early.
    const endMeridiem = /\b(AM|PM)\b/i.exec(endText)?.[1] ?? null
    const start = toMinutes(startText, endMeridiem)
    let end = toMinutes(endText, null)
    if (start === null || end === null) continue
    if (end <= start) end += 24 * 60
    ranges.push({ start, end, startText, endText })
  }
  if (ranges.length === 0) return null

  const current = ranges.find((r) => minutesNow >= r.start && minutesNow < r.end)
  if (current) return { open: true, label: `Open until ${tidy(current.endText)}` }

  const next = ranges
    .filter((r) => r.start > minutesNow)
    .sort((a, b) => a.start - b.start)[0]
  if (next) return { open: false, label: `Closed · opens ${tidy(next.startText)}` }

  return { open: false, label: 'Closed now' }
}

/** Normalise `9:30 pm` to `9:30 PM`, and never hand back an empty string. */
function tidy(text: string): string {
  const t = text.trim().replace(/\s+/g, ' ').replace(/\b(am|pm)\b/gi, (s) => s.toUpperCase())
  return t || 'later'
}
