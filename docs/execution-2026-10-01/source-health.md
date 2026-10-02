# Content source health and freshness

## Corrected behavior

The previous collection-level `checkedAt` advanced whenever the feed returned any items. The feed always includes 741 static directory records, so it could look fresh when every live source failed. Failed adapters also commonly return an empty array, making “no upcoming events” indistinguishable from some upstream failures.

The health response now separates aggregate refresh time, live data time, static records, fresh live records, and retained live records. `checkedAt` is explicitly labeled as an aggregate attempt, not verification of each source or listing. Static businesses do not count as fresh live content.

Each live adapter exposes its state, last attempt, last returned response, last nonempty data time, item count, and staleness. `available` means the adapter returned records; it does not promise that all subfeeds were successful. `empty` deliberately does not claim health: some empty feeds are quiet, while others are blocked or unavailable. Explicit errors/timeouts retain the old timestamp and report an error state. These diagnostics perform no additional network requests.

The disk snapshot persists source health. A legacy snapshot without source timestamps is reported as unverified. When a source returns nothing or fails, its previous stories/events remain available with stale health. A source that returns data can remove its absent records. Notices are not restored from a missing-source disk fallback because an empty warning feed may mean an alert ended; existing expiry filters still apply.

The existing `/healthz` route returns the expanded content status. HTTP 200 remains process liveness, while `content.status` distinguishes `fresh`, `partial`, `stale`, and `unavailable`. This change does not modify the Today screen or imply that a source failure should bring down the application.

## Actual source read

A read through the real application content loader completed at `2026-10-02T01:04:04.654Z`. Public local-event filtering and deduplication produced:

- 1,008 total public records.
- 741 static directory records.
- 267 live records with recent source data.
- Zero retained stale live records in that first read.
- Aggregate status `partial`, rather than a blanket claim that all sources are healthy.

Adapter observations, before public filtering and deduplication:

| Adapter | State | Records |
| --- | --- | ---: |
| Courier RSS | available | 45 |
| ATU/community RSS | available | 10 |
| ATU calendars | available | 208 |
| School calendars | available | 40 |
| City calendar | available | 8 |
| Discover Russellville | available | 46 |
| Courier/Evvnt calendar | available | 4 |
| Library calendar | available | 24 |
| Pope County meetings with stated times | available | 3 |
| City alerts | empty | 0 |
| Chamber calendar | empty | 0 |
| State parks | empty | 0 |
| Weather alerts | empty | 0 |
| Main Street | empty | 0 |
| Arts calendar | empty | 0 |

Adapter timestamps ranged from `01:03:59.614Z` to `01:04:04.652Z`. They are actual individual fetch times, not a shared freshness clock. Empty results alone are insufficient evidence of an outage. Runtime logs independently show Center Arts returning HTTP 403 and some Courier subfeeds returning HTTP 429; partial Courier data still arrived.

## Verification

Targeted tests passed: 65 tests across feed code and content freshness. Regression cases cover static-only false freshness, original timestamps after outages, preserved stories/events, cleared alerts, partial coverage, cache aging, and legacy disk metadata. The ported TypeScript check passed. At that point, the full workspace check had an unrelated concurrent `ContributionReview.tsx` icon-type error; the coordinating agent was notified.

The upstream Railway worker independently completed its next scheduled execution on the same repaired deployment `67b61203-2588-419c-acb9-6a78cf66b3b1`. Logs show a container start at `2026-10-02T01:03:39.284Z` and `[ingest] russellville-ar: 1135 items` at `01:03:43.617Z`. No new restart or deployment was triggered for this check.

After coordination with the design agent, the redundant untracked `tools/build-local-map.py` was removed. The authoritative map conversion remains `docs/execution-2026-10-01/maps/build-basemap.py`.
