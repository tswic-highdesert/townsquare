// ============================================================
// NWS Weather Alerts — National Weather Service active alerts
// for Pope County, Arkansas (zone ARC115)
// ============================================================

import type { NoticeItem } from "./types.js";

const NWS_API_URL = "https://api.weather.gov/alerts/active?zone=ARC115";
const SOURCE_ID = "nws-weather";
const COMMUNITY = "Russellville";

/** NWS alert feature properties (subset we use) */
interface NWSAlertProperties {
  id: string;
  event: string;
  headline: string | null;
  description: string | null;
  severity: string; // Extreme, Severe, Moderate, Minor, Unknown
  urgency: string;
  onset: string | null;
  expires: string | null;
  senderName: string | null;
  areaDesc: string | null;
}

interface NWSFeature {
  properties: NWSAlertProperties;
}

interface NWSResponse {
  features: NWSFeature[];
}

/** Map NWS severity to our NoticeItem severity */
function mapSeverity(nwsSeverity: string): NoticeItem["severity"] {
  switch (nwsSeverity) {
    case "Extreme":
      return "emergency";
    case "Severe":
      return "urgent";
    case "Moderate":
      return "warning";
    case "Minor":
    case "Unknown":
    default:
      return "info";
  }
}

/** Generate a deterministic ID from the NWS alert ID */
function generateAlertId(nwsId: string): string {
  // NWS IDs look like "urn:oid:2.49.0.1.840.0...." — extract the tail
  const slug = nwsId
    .replace(/^urn:oid:/, "")
    .replace(/[^a-zA-Z0-9]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  return `nws-${slug}`;
}

/** Convert an event name to a kebab-case tag */
function eventTag(event: string): string {
  return event
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

/**
 * Fetch active weather alerts for Pope County, AR from the
 * National Weather Service API.
 */
export async function fetchNWSAlerts(): Promise<NoticeItem[]> {
  try {
    const response = await fetch(NWS_API_URL, {
      headers: {
        "User-Agent": "TownSquare/1.0 (local news aggregator)",
        Accept: "application/geo+json",
      },
    });

    if (!response.ok) {
      console.warn(`[NWS] API returned ${response.status}`);
      return [];
    }

    const data: NWSResponse = await response.json();
    const now = new Date();
    const notices: NoticeItem[] = [];

    for (const feature of data.features) {
      const props = feature.properties;

      // Skip expired alerts
      if (props.expires) {
        const expiresDate = new Date(props.expires);
        if (expiresDate < now) continue;
      }

      const onset = props.onset ? new Date(props.onset) : now;
      const isoOnset = !isNaN(onset.getTime())
        ? onset.toISOString()
        : now.toISOString();

      const description = (props.description || props.headline || props.event)
        .replace(/\n/g, " ")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 500);

      const tags = ["weather", "alert"];
      if (props.event) {
        const tag = eventTag(props.event);
        if (tag && !tags.includes(tag)) {
          tags.push(tag);
        }
      }

      notices.push({
        id: generateAlertId(props.id),
        type: "notice",
        title: props.headline || props.event,
        description,
        source: SOURCE_ID,
        tags,
        community: COMMUNITY,
        url: `https://alerts.weather.gov`,
        severity: mapSeverity(props.severity),
        isActive: true,
        expires: props.expires || undefined,
        createdAt: isoOnset,
        updatedAt: isoOnset,
      });
    }

    return notices;
  } catch (error) {
    console.error("[NWS] Error fetching weather alerts:", error);
    return [];
  }
}
