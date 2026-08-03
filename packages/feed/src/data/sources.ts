import type { Source } from "../lib/types";

const rawSources: Source[] = [
  {
    id: "city-russellville",
    name: "City of Russellville",
    url: "https://www.russellvillear.gov",
    type: "government",
    republishRule: "full",
  },
  {
    id: "pope-county",
    name: "Pope County",
    url: "https://www.popecountyar.gov",
    type: "government",
    republishRule: "full",
  },
  {
    id: "russellville-sd",
    name: "Russellville School District",
    url: "https://www.rsdk12.net",
    type: "education",
    republishRule: "full",
  },
  {
    id: "arkansas-tech",
    name: "Arkansas Tech University",
    url: "https://www.atu.edu",
    type: "education",
    republishRule: "full",
  },
  {
    id: "chamber",
    name: "Russellville Area Chamber of Commerce",
    url: "https://www.russellvillechamber.com",
    type: "business",
    republishRule: "full",
  },
  {
    // Local business directory sourced from public Google Places listings — NOT a
    // Chamber endorsement. Replaces the old hand-seeded (mostly fabricated) set.
    id: "rvts-directory",
    name: "River Valley Local Directory",
    type: "business",
    republishRule: "full",
  },
  {
    id: "rv-arts-center",
    name: "River Valley Arts Center",
    url: "https://www.rvartscenter.org",
    type: "nonprofit",
    republishRule: "full",
  },
  {
    id: "rv-library",
    name: "Russellville Public Library",
    url: "https://www.rville.lib.ar.us",
    type: "education",
    republishRule: "full",
  },
  {
    id: "first-baptist",
    name: "First Baptist Church Russellville",
    url: "https://www.fbcr.org",
    type: "religious",
    republishRule: "full",
  },
  {
    id: "st-andrews",
    name: "St. Andrew's Catholic Church",
    type: "religious",
    republishRule: "full",
  },
  {
    id: "rv-sports-complex",
    name: "River Valley Sports Complex",
    type: "recreation",
    republishRule: "full",
  },
  {
    id: "lake-dardanelle",
    name: "Lake Dardanelle State Park",
    url: "https://www.arkansasstateparks.com/parks/lake-dardanelle-state-park",
    type: "recreation",
    republishRule: "full",
  },
  {
    id: "the-courier",
    name: "The Courier",
    url: "https://www.couriernews.com",
    type: "media",
    republishRule: "feed-summary-only",
  },
  {
    id: "united-way",
    name: "River Valley United Way",
    type: "nonprofit",
    republishRule: "full",
  },
  {
    id: "downtown-main-street",
    name: "Russellville Downtown Main Street",
    type: "nonprofit",
    republishRule: "full",
  },
  {
    id: "pope-county-library",
    name: "Pope County Library System",
    url: "https://popecountyar.librarycalendar.com",
    type: "community",
    republishRule: "full",
  },
  {
    id: "discover-russellville",
    name: "Discover Russellville",
    url: "https://discoverrussellville.org",
    type: "business",
    republishRule: "full",
  },
  {
    id: "nws-weather",
    name: "National Weather Service",
    url: "https://www.weather.gov",
    type: "government",
    republishRule: "full",
  },
  {
    id: "main-street",
    name: "Main Street Russellville",
    url: "https://www.mainstreetrussellville.com",
    type: "community",
    republishRule: "full",
  },
  {
    id: "facebook-community",
    name: "Facebook Community",
    url: "https://www.facebook.com",
    type: "community",
    republishRule: "discovery-only",
  },
  {
    id: "courier-events",
    name: "Courier Events",
    url: "https://www.couriernews.com/local-events/",
    type: "community",
    republishRule: "feed-summary-only",
  },
  {
    id: "center-for-arts",
    name: "Center for the Arts",
    url: "https://tcfta.booktix.com",
    type: "arts",
    republishRule: "full",
  },
  {
    id: "pottsville-sd",
    name: "Pottsville School District",
    url: "https://www.pottsvilleschools.org",
    type: "education",
    republishRule: "full",
  },
];

// Dead placeholder sources (no fetcher exists) — excluded from the public feed for v1.
const DISABLED = new Set([
  "first-baptist", "st-andrews", "rv-sports-complex", "united-way",
  "downtown-main-street", "rv-arts-center", "rv-library",
]);

export const sources: Source[] = rawSources.map((s) =>
  DISABLED.has(s.id) ? { ...s, enabled: false } : s
);
