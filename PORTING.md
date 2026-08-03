---
type: note
title: What was ported from v1, and what was deliberately left behind
status: active
updated: 2026-08-03
---

# Ported from v1

Source: `swiceos/local/archive/townsquare-v1/river-valley-townsquare`.

| New package | From | Notes |
|---|---|---|
| `@townsquare/content` | `@rvts/shared` | Zod contracts for ingested content. **`identity.ts` was not ported**: it modelled profiles with `real_name`, which the identity design forbids. |
| `@townsquare/feed` | `@rvts/feed` | 17 source fetchers, the 23-source registry, `stableId()` with its guard tests, and **741 real Russellville business listings** (verified intact: 741 rows, all with coordinates and phone numbers). |
| `@townsquare/db` | `@rvts/db` | Ingest, transform, client. Schema rewritten (below). |

## Deliberately not ported

- **`profiles`, `rsvps`, `notification_prefs`, `push_tokens`.** `profiles` stored
  `real_name`; the rest hung off it. The new identity model stores a handle, an
  email, and a verification result, and nothing else about a person.
- **The v1 migrations.** They describe the tables above. Replaced by a single
  `0000_init.sql` generated from the new schema.
- **`api/src/buckets.ts`.** Its `isSameDay` and `isWeekend` use UTC getters, so
  day boundaries are wrong for `America/Chicago`. The client-side
  `packages/app/src/lib/buckets.ts` in the archive is timezone-aware and is the
  one to port when the read API is rebuilt.
- **The Expo app.** Its ~35 components are React Native, so they do not transfer
  to a DOM shell. The theme and the pure `lib/` modules are worth mining later.

## Known debt

**`tsconfig.ported.json` turns off `noUncheckedIndexedAccess` for the three
ported packages.** Enabling it surfaces about 149 sites, nearly all unguarded
regex-match indexing inside scrapers. Those are real latent bugs, but fixing
them blind means editing parsing logic against live third-party HTML that nobody
has read recently, and a wrong guard silently changes what a scraper returns
rather than failing loudly.

Pay it down per scraper, alongside that scraper's fixture, then remove the file
from the `include` list. Everything written for this project is under the strict
config.

**`packages/db/src/ingest.test.ts` needs Docker** and skips without it. It was
**not executed** during the port, so the new `0000_init.sql` has not yet been
applied to a real Postgres. Run it with Docker up before trusting the migration.
