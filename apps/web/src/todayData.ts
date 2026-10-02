/**
 * The Today payload, as the shell sees it.
 *
 * The types are declared here rather than imported from `apps/api`. The shell
 * and the read API are separate services that will be deployed separately, and
 * a shared type would quietly let a field be renamed on one side of an HTTP
 * boundary. This file is the contract, and it is small on purpose.
 */

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

export type EventCategory = 'civic' | 'music' | 'sport' | 'community'

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
  /** True, false, or null when the hours could not be read honestly. */
  openNow: boolean | null
  phone: string | null
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
  more: TodayStory[]
  events: { items: TodayEvent[]; total: number }
  neighbors: { featured: TodayCreation | null; rest: TodayCreation[] }
  cityHall: { notice: TodayNotice | null; items: TodayCivicItem[] }
  directory: TodayBusiness[]
  footer: { updatedLabel: string; sourceCount: number; creationCount: number; sourceNote?: string; sourceCheckedLabel?: string }
}

export async function fetchToday(): Promise<TodayPayload> {
  const res = await fetch(new URL('/api/today', window.location.origin), {
    credentials: 'same-origin',
  })
  if (!res.ok) throw new Error(`today ${res.status}`)
  return (await res.json()) as TodayPayload
}
