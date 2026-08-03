import { z } from "zod";

export const geoSchema = z
  .object({
    lat: z.number(), lng: z.number(),
    address: z.string().optional(), city: z.string().optional(),
    state: z.string().optional(), zip: z.string().optional(),
  })
  .passthrough()
  .nullable();
export type Geo = z.infer<typeof geoSchema>;

const iso = z.string(); // server serializes timestamps to ISO strings over JSON

/** Serialized content item as the 2a API returns it over JSON (dates are ISO strings). */
export const contentItemSchema = z
  .object({
    townId: z.string(), tspId: z.string(),
    type: z.enum(["event", "notice", "business", "story"]),
    title: z.string(), description: z.string().default(""),
    source: z.string(),
    republishRule: z.enum(["full", "feed-summary-only", "discovery-only"]),
    tags: z.array(z.string()).default([]),
    community: z.string().default(""),
    geo: geoSchema.default(null),
    canonicalUrl: z.string().nullable().default(null),
    status: z.enum(["active", "stale"]).default("active"),
    startsAt: iso.nullable().default(null), endsAt: iso.nullable().default(null),
    location: z.string().nullable().default(null), isAllDay: z.boolean().nullable().default(null),
    cost: z.string().nullable().default(null),
    severity: z.enum(["info", "warning", "urgent", "emergency"]).nullable().default(null),
    expiresAt: iso.nullable().default(null), isActive: z.boolean().nullable().default(null),
    category: z.string().nullable().default(null), address: z.string().nullable().default(null),
    phone: z.string().nullable().default(null), website: z.string().nullable().default(null),
    hours: z.string().nullable().default(null),
    author: z.string().nullable().default(null), publishedAt: iso.nullable().default(null),
    imageUrl: z.string().nullable().default(null),
  })
  .passthrough(); // tolerate extra server fields (raw, audit cols) without failing

export type ContentItem = z.infer<typeof contentItemSchema>;
export type ContentType = ContentItem["type"];

export const itemsResponseSchema = z.object({ items: z.array(contentItemSchema) });
export type ItemsResponse = z.infer<typeof itemsResponseSchema>;

/** Thin /this-week projection (NOT used to render cards in 2b — kept for completeness). */
export const thisWeekItemSchema = z.object({
  tspId: z.string(), type: z.string(), title: z.string(), source: z.string(),
  startsAt: iso.nullable(), severity: z.string().nullable(), isActive: z.boolean().nullable(),
});
export const thisWeekResponseSchema = z.object({
  today: z.array(thisWeekItemSchema), weekend: z.array(thisWeekItemSchema),
  comingUp: z.array(thisWeekItemSchema), notices: z.array(thisWeekItemSchema),
});
export type ThisWeekResponse = z.infer<typeof thisWeekResponseSchema>;

/** Strict single-item parse (Detail route). Throws on malformed input. */
export const parseContentItem = (j: unknown): ContentItem => contentItemSchema.parse(j);

/** Resilient list parse: the DB `type`/`severity` columns are free-form text, so one bad
 *  row must NOT blank the whole feed. Drop rows that fail; keep the good ones. */
export function parseItemsResponse(j: unknown): ItemsResponse {
  const raw = z.object({ items: z.array(z.unknown()) }).parse(j);
  const items: ContentItem[] = [];
  for (const it of raw.items) {
    const r = contentItemSchema.safeParse(it);
    if (r.success) items.push(r.data);
  }
  return { items };
}

/** Facebook / discovery-only items must never reach a user surface (brand commitment). */
export const isDiscoveryOnly = (i: Pick<ContentItem, "republishRule">): boolean =>
  i.republishRule === "discovery-only";
/** Courier-class: show summary + link-out only, suppress body + source image. */
export const isFeedSummaryOnly = (i: Pick<ContentItem, "republishRule">): boolean =>
  i.republishRule === "feed-summary-only";
