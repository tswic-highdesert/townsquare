// ============================================================
// Town Square — Core Data Model
// ============================================================

/** Geographic location with community context */
export interface GeoLocation {
  lat: number;
  lng: number;
  address?: string;
  city?: string;
  state?: string;
  zip?: string;
}

/** Source that publishes items into the system */
export interface Source {
  id: string;
  name: string;
  url?: string;
  type: "government" | "education" | "nonprofit" | "business" | "media" | "religious" | "recreation" | "community" | "arts";
  /** How items from this source may be re-published in consumer apps. */
  republishRule: "full" | "feed-summary-only" | "discovery-only";
  /** When false, items from this source are excluded from the public feed (default true). */
  enabled?: boolean;
}

/** Base fields shared by all item types */
export interface BaseItem {
  id: string;
  type: "event" | "notice" | "business" | "story";
  title: string;
  description: string;
  source: string; // source id
  tags: string[];
  community: string;
  geo?: GeoLocation;
  url?: string;
  createdAt: string; // ISO 8601
  updatedAt: string; // ISO 8601
}

/** An event — something happening at a specific time and place */
export interface EventItem extends BaseItem {
  type: "event";
  startDate: string; // ISO 8601
  endDate?: string; // ISO 8601
  location: string; // human-readable location name
  isAllDay?: boolean;
  recurrence?: string; // human-readable recurrence description
  cost?: string; // "Free", "$10", "Donations accepted"
  contactEmail?: string;
  contactPhone?: string;
}

/** A notice — an alert, announcement, or advisory */
export interface NoticeItem extends BaseItem {
  type: "notice";
  severity: "info" | "warning" | "urgent" | "emergency";
  expires?: string; // ISO 8601
  isActive: boolean;
}

/** A local business listing */
export interface BusinessItem extends BaseItem {
  type: "business";
  name: string;
  category: string;
  address: string;
  phone?: string;
  email?: string;
  website?: string;
  hours?: string; // human-readable hours
}

/** A story — local news, feature, or article */
export interface StoryItem extends BaseItem {
  type: "story";
  body: string;
  author?: string;
  publishedAt: string; // ISO 8601
  imageUrl?: string;
}

/** Union type for all items */
export type TownSquareItem = EventItem | NoticeItem | BusinessItem | StoryItem;

/** Site configuration */
export interface SiteConfig {
  name: string;
  tagline: string;
  description: string;
  community: string;
  state: string;
  url: string;
  feedUrl: string;
}
