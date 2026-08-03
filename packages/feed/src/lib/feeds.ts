import type { TownSquareItem, EventItem, NoticeItem, BusinessItem, StoryItem } from "./types.js";
import { siteConfig } from "./config.js";
import { escapeXml } from "./utils.js";
import { getSource } from "../data";

/** Generate RSS 2.0 XML from items */
export function generateRSS(
  items: TownSquareItem[],
  title?: string,
  description?: string,
  feedPath?: string
): string {
  const feedTitle = title ?? siteConfig.name;
  const feedDescription = description ?? siteConfig.description;
  const feedLink = `${siteConfig.url}${feedPath ?? "/api/feed.xml"}`;

  const itemsXml = items
    .map((item) => {
      const source = getSource(item.source);
      const pubDate = new Date(item.createdAt).toUTCString();
      const link = `${siteConfig.url}/#${item.id}`;
      let desc = item.description;

      if (item.type === "event") {
        const evt = item as EventItem;
        desc += `\n\n📅 ${evt.startDate}\n📍 ${evt.location}`;
        if (evt.cost) desc += `\n💰 ${evt.cost}`;
      }

      return `    <item>
      <title>${escapeXml(item.title)}</title>
      <link>${escapeXml(link)}</link>
      <description>${escapeXml(desc)}</description>
      <pubDate>${pubDate}</pubDate>
      <guid isPermaLink="false">${item.id}</guid>
      <category>${item.type}</category>${
        source
          ? `\n      <source url="${escapeXml(source.url ?? "")}">${escapeXml(source.name)}</source>`
          : ""
      }${item.tags.map((t) => `\n      <category>${escapeXml(t)}</category>`).join("")}
    </item>`;
    })
    .join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>${escapeXml(feedTitle)}</title>
    <link>${escapeXml(siteConfig.url)}</link>
    <description>${escapeXml(feedDescription)}</description>
    <language>en-us</language>
    <lastBuildDate>${new Date().toUTCString()}</lastBuildDate>
    <atom:link href="${escapeXml(feedLink)}" rel="self" type="application/rss+xml"/>
${itemsXml}
  </channel>
</rss>`;
}

/** Generate iCalendar (.ics) from events */
export function generateICS(events: EventItem[]): string {
  const now = new Date()
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}/, "");

  const vevents = events
    .map((evt) => {
      const dtstart = new Date(evt.startDate)
        .toISOString()
        .replace(/[-:]/g, "")
        .replace(/\.\d{3}/, "");
      const dtend = evt.endDate
        ? new Date(evt.endDate)
            .toISOString()
            .replace(/[-:]/g, "")
            .replace(/\.\d{3}/, "")
        : dtstart;

      let desc = evt.description;
      if (evt.cost) desc += `\\nCost: ${evt.cost}`;

      return `BEGIN:VEVENT
UID:${evt.id}@townsquare
DTSTAMP:${now}
DTSTART:${dtstart}
DTEND:${dtend}
SUMMARY:${icsEscape(evt.title)}
DESCRIPTION:${icsEscape(desc)}
LOCATION:${icsEscape(evt.location)}
URL:${siteConfig.url}/#${evt.id}
END:VEVENT`;
    })
    .join("\n");

  return `BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//Town Square//Russellville//EN
CALSCALE:GREGORIAN
METHOD:PUBLISH
X-WR-CALNAME:${siteConfig.name} Events
X-WR-TIMEZONE:America/Chicago
${vevents}
END:VCALENDAR`;
}

function icsEscape(str: string): string {
  return str.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\n/g, "\\n");
}

/** Build the _town_square extension block for a single item, including typed fields. */
function townSquareExtension(item: TownSquareItem) {
  const base = {
    type: item.type,
    source: item.source,
    republish_rule: getSource(item.source)?.republishRule ?? "full",
    community: item.community,
    geo: item.geo ?? null,
    canonical_url: item.url ?? null,
  };

  switch (item.type) {
    case "event": {
      const e = item as EventItem;
      return {
        ...base,
        start_date: e.startDate,
        end_date: e.endDate ?? null,
        location: e.location,
        is_all_day: e.isAllDay ?? false,
        recurrence: e.recurrence ?? null,
        cost: e.cost ?? null,
        contact_email: e.contactEmail ?? null,
        contact_phone: e.contactPhone ?? null,
      };
    }
    case "notice": {
      const n = item as NoticeItem;
      return { ...base, severity: n.severity, expires: n.expires ?? null, is_active: n.isActive };
    }
    case "business": {
      const b = item as BusinessItem;
      return {
        ...base,
        name: b.name,
        category: b.category,
        address: b.address,
        phone: b.phone ?? null,
        email: b.email ?? null,
        website: b.website ?? null,
        hours: b.hours ?? null,
      };
    }
    case "story": {
      const s = item as StoryItem;
      return { ...base, author: s.author ?? null, published_at: s.publishedAt, image_url: s.imageUrl ?? null };
    }
    default: {
      const _exhaustive: never = item;
      return _exhaustive;
    }
  }
}

/** Generate JSON Feed (https://jsonfeed.org/version/1.1) */
export function generateJSONFeed(items: TownSquareItem[]) {
  return {
    version: "https://jsonfeed.org/version/1.1",
    title: siteConfig.name,
    home_page_url: siteConfig.url,
    feed_url: `${siteConfig.url}/api/feed.json`,
    description: siteConfig.description,
    language: "en-US",
    items: items.map((item) => ({
      id: item.id,
      title: item.title,
      content_text: item.description,
      url: `${siteConfig.url}/#${item.id}`,
      date_published: item.createdAt,
      date_modified: item.updatedAt,
      tags: item.tags,
      _town_square: townSquareExtension(item),
    })),
  };
}
