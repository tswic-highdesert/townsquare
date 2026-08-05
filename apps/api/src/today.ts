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

export function assembleToday(input: AssembleInput): TodayPayload {
  const { now, town, items, creations, sources } = input
  const tz = town.timezone
  const nowMs = new Date(now).getTime()
  const dayKey = townDay(now, tz)

  const sourceName = (id: string): string => sources.get(id)?.name ?? id
  const sourceType = (id: string): string => sources.get(id)?.type ?? 'community'

  // ── Top of town ────────────────────────────────────────────────────────
  // Newest story wins, and nothing else does. An editorial rank here would be
  // a judgement Town Square is not entitled to make about a neighbour's paper.
  const stories = items
    .filter(isStory)
    .filter((s) => new Date(s.publishedAt).getTime() <= nowMs)
    .sort((a, b) => b.publishedAt.localeCompare(a.publishedAt))

  const leadItem = stories[0]
  const lead: TodayStory | null = leadItem
    ? {
        id: leadItem.id,
        title: leadItem.title,
        summary: leadItem.description,
        url: leadItem.url ?? null,
        imageUrl: leadItem.imageUrl ?? null,
        source: sourceName(leadItem.source),
        sourceInitial: (sourceName(leadItem.source)[0] ?? '·').toUpperCase(),
        publishedAt: leadItem.publishedAt,
        timeLabel: compactTime(leadItem.publishedAt, tz),
        readingMinutes: readingMinutes(leadItem.body || leadItem.description),
      }
    : null

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
  ).map((b) => ({
    id: b.id,
    name: b.name,
    category: b.category,
    detail: hoursToday(b.hours, parts(now, tz, { weekday: 'short' })) ?? b.category,
    url: b.website ?? null,
  }))

  return {
    town,
    greeting: greetingFor(now, tz),
    dayName: parts(now, tz, { weekday: 'long' }),
    dateLabel: parts(now, tz, { weekday: 'long', month: 'short', day: 'numeric' }),
    lead,
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
 * Returns null when the string does not carry today, so the caller falls back
 * to the category rather than guessing.
 */
export function hoursToday(hours: string | undefined, weekdayShort: string): string | null {
  if (!hours) return null
  for (const clause of hours.split(',')) {
    const text = clause.trim()
    if (text.toLowerCase().startsWith(weekdayShort.toLowerCase())) {
      return text.slice(weekdayShort.length).trim() || text
    }
  }
  return null
}
