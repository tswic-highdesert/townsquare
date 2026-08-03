import { z } from "zod";

const baseExt = {
  source: z.string(),
  republish_rule: z.enum(["full", "feed-summary-only", "discovery-only"]),
  community: z.string(),
  geo: z
    .object({ lat: z.number(), lng: z.number(), address: z.string().optional(), city: z.string().optional(), state: z.string().optional(), zip: z.string().optional() })
    .passthrough()
    .nullable()
    .default(null),
  canonical_url: z.string().nullable().default(null),
};

const eventExt = z.object({
  type: z.literal("event"), ...baseExt,
  start_date: z.string(), end_date: z.string().nullable().default(null), location: z.string(),
  is_all_day: z.boolean().default(false), recurrence: z.string().nullable().default(null),
  cost: z.string().nullable().default(null), contact_email: z.string().nullable().default(null),
  contact_phone: z.string().nullable().default(null),
});
const noticeExt = z.object({
  type: z.literal("notice"), ...baseExt,
  severity: z.enum(["info", "warning", "urgent", "emergency"]), expires: z.string().nullable().default(null), is_active: z.boolean(),
});
const businessExt = z.object({
  type: z.literal("business"), ...baseExt,
  name: z.string(), category: z.string(), address: z.string(),
  phone: z.string().nullable().default(null), email: z.string().nullable().default(null),
  website: z.string().nullable().default(null), hours: z.string().nullable().default(null),
});
const storyExt = z.object({
  type: z.literal("story"), ...baseExt,
  author: z.string().nullable().default(null), published_at: z.string(), image_url: z.string().nullable().default(null),
});

const townSquareExt = z.discriminatedUnion("type", [eventExt, noticeExt, businessExt, storyExt]);

const feedItemSchema = z.object({
  id: z.string(),
  title: z.string(),
  content_text: z.string().default(""),
  url: z.string().nullable().optional(),
  date_published: z.string(),
  date_modified: z.string(),
  tags: z.array(z.string()).default([]),
  _town_square: townSquareExt,
});

const feedDocSchema = z.object({
  version: z.string(),
  title: z.string().optional(),
  items: z.array(feedItemSchema),
});

/** camelCase the _town_square extension so the rest of the app never sees snake_case. */
function camelExt(ext: z.infer<typeof townSquareExt>) {
  const base = {
    source: ext.source, republishRule: ext.republish_rule,
    community: ext.community, geo: ext.geo, canonicalUrl: ext.canonical_url,
  };
  switch (ext.type) {
    case "event":
      return { type: ext.type, ...base, startDate: ext.start_date, endDate: ext.end_date, location: ext.location, isAllDay: ext.is_all_day, recurrence: ext.recurrence, cost: ext.cost, contactEmail: ext.contact_email, contactPhone: ext.contact_phone };
    case "notice":
      return { type: ext.type, ...base, severity: ext.severity, expires: ext.expires, isActive: ext.is_active };
    case "business":
      return { type: ext.type, ...base, name: ext.name, category: ext.category, address: ext.address, phone: ext.phone, email: ext.email, website: ext.website, hours: ext.hours };
    case "story":
      return { type: ext.type, ...base, author: ext.author, publishedAt: ext.published_at, imageUrl: ext.image_url };
    default: {
      const _exhaustive: never = ext;
      return _exhaustive;
    }
  }
}

export type FeedItem = {
  id: string; title: string; contentText: string; url?: string | null;
  datePublished: string; dateModified: string; tags: string[];
  townSquare: ReturnType<typeof camelExt>;
};
export type FeedDocument = { version: string; title?: string; items: FeedItem[] };
/** The normalized, camelCased _town_square extension (discriminated on `type`). */
export type TownSquareExt = FeedItem["townSquare"];

/** Validate and normalize the enriched TSP JSON feed. Throws (zod) on malformed input. */
export function parseFeed(json: unknown): FeedDocument {
  const doc = feedDocSchema.parse(json);
  return {
    version: doc.version,
    title: doc.title,
    items: doc.items.map((it) => ({
      id: it.id, title: it.title, contentText: it.content_text, url: it.url,
      datePublished: it.date_published, dateModified: it.date_modified, tags: it.tags,
      townSquare: camelExt(it._town_square),
    })),
  };
}
