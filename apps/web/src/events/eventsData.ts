/**
 * The calendar payloads, as the shell sees them.
 *
 * Declared here rather than imported from `apps/api`, matching `todayData.ts`:
 * the shell and the read API are separate services deployed separately, and a
 * shared type would quietly let a field be renamed on one side of an HTTP
 * boundary. This file is the contract and it is small on purpose.
 */

export type EventCategory = 'civic' | 'music' | 'sport' | 'community'

export interface EventRow {
  id: string
  title: string
  detail: string
  location: string
  startsAt: string
  endsAt: string | null
  allDay: boolean
  timeLabel: string
  meridiem: string
  endLabel: string | null
  category: EventCategory
  source: string
  sourceName: string
  url: string | null
}

export interface DayGap {
  kind: 'gap'
  minutes: number
  lengthLabel: string
  line: string
}

export interface DayRows {
  kind: 'rows'
  rows: EventRow[]
}

export type DaySegment = DayRows | DayGap

export interface WeekCell {
  day: string
  name: string
  num: string
  count: number
  isToday: boolean
  isPast: boolean
  isSelected: boolean
  label: string
}

export interface DayPayload {
  town: { id: string; name: string; timezone: string }
  day: string
  isToday: boolean
  dayName: string
  eyebrow: string
  headline: string
  total: number
  week: WeekCell[]
  segments: DaySegment[]
  next: { day: string; label: string; rows: EventRow[]; total: number } | null
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
  more: number
  load: number
  label: string
}

export interface MonthPayload {
  town: { id: string; name: string; timezone: string }
  month: string
  label: string
  total: number
  prevMonth: string | null
  nextMonth: string | null
  weeks: MonthCell[][]
  today: string
  generatedAt: string
}

export interface EventDetailPayload {
  town: { id: string; name: string; timezone: string }
  id: string
  title: string
  description: string | null
  category: EventCategory
  allDay: boolean
  startsAt: string
  endsAt: string | null
  day: string
  whenPlain: string
  whenExact: string
  location: string
  directionsUrl: string | null
  source: { id: string; name: string; url: string | null }
  url: string | null
  alsoThatDay: EventRow[]
  generatedAt: string
}

async function get<T>(path: string): Promise<T> {
  const res = await fetch(new URL(path, window.location.origin), { credentials: 'same-origin' })
  if (!res.ok) throw new Error(`${path} ${res.status}`)
  return (await res.json()) as T
}

export function fetchDay(day?: string): Promise<DayPayload> {
  return get<DayPayload>(day ? `/api/events?day=${day}` : '/api/events')
}

export function fetchMonth(month?: string): Promise<MonthPayload> {
  return get<MonthPayload>(month ? `/api/events/month?month=${month}` : '/api/events/month')
}

/**
 * Null for an event that is no longer in the feed, rather than a throw.
 *
 * A scraped calendar drops things. The caller is a screen, and "this listing is
 * gone" is a thing it can say plainly; an exception is not.
 */
export async function fetchEvent(id: string): Promise<EventDetailPayload | null> {
  const res = await fetch(new URL(`/api/events/detail?id=${encodeURIComponent(id)}`, window.location.origin), {
    credentials: 'same-origin',
  })
  if (res.status === 404) return null
  if (!res.ok) throw new Error(`event ${res.status}`)
  return (await res.json()) as EventDetailPayload
}
