# Validation evidence

These checks support a working preview, not a production uptime or security certification. Start: 2026-10-02 00:29:50 UTC. The assignment allowed twelve hours; implementation and acceptance progressed faster through reuse and bounded parallel work.

## Automated checks

- The full workspace unit/integration run passed 1,351 tests in 90 files at approximately 01:22 UTC. Docker-backed database tests used Colima. Subsequent small UI changes receive targeted checks.
- TypeScript, generated SDK consistency and the production web build passed. There is no configured lint script; whitespace validation uses `git diff --check`.
- The isolated browser boundary suite passed 29 tests, including hostile bridge traffic, CSP, exfiltration attempts, authenticated credentials, per-resident storage and loaded fonts. It owns ports 4410–4412 and does not reuse another developer's servers.
- The repaired legacy worker passed 171 tests; three existing tests remain skipped. Its TypeScript check passed.

## Deployed resident acceptance

On deployment `5232734c-a482-434e-aeba-5ba3682a77bf`, all 18 routine desktop/phone scenarios passed. On `41eb440f-2e24-4292-9243-e6d3f807366d`, 17 passed immediately. The remaining phone Escape check pressed the key before the dialog's focus effect completed; after asserting heading focus, the entire detail/search/map case passed three times per viewport (six consecutive runs), without a product change.

The checks cover sign-up, sign-in, sign-out, guest browsing, cross-session saves, draft persistence, correction submission, review decline, competing reviewer decisions, role revocation, unauthorized requests, detail links, refresh/back, search, map/list navigation and filters, the day planner, missing content and simulated request failures. Delayed search catalog and account-switch request races have explicit regressions.

The actual separate-origin starter creation loaded real public restaurant data. Both viewport checks verified that it cannot read the parent DOM, obtain resident identity, read host cookies or make credentialed API requests outside its allowed connection policy.

A real Railway application replacement preserved an active session, password authentication from a fresh context, a save, a draft and a queued correction. A source-supported Retro Roasts phone-format correction was approved through the deployed review UI and appeared in both public directory APIs. Approval-note display was subsequently verified locally on desktop and phone. Temporary reviewer roles were revoked; no elevated QA accounts remained at the last audit.

See [accounts and persistence](../persistence-and-accounts.md) for precise test commands, deployment IDs and audit details. Routine QA contributions are withdrawn; no fabricated event or community activity was published.

## Visual and interaction review

The selected reference and its approval status are documented in [design.md](design.md). Desktop 1440px and phone 390px screenshots were captured from the deployed app, with additional 320px and 200% text checks. Today, story/event/place details, the map and selected day plan were inspected visually. Representative checks found no horizontal document overflow or blocking browser errors.

The final phone map refinement uses a horizontal category strip and removes irrelevant sorting/layout controls while viewing pins. It retains keyboard-reachable categories and the equivalent list view. Captures are in [screenshots/deployed](screenshots/deployed).

## Performance

A controlled Chromium run used a fresh context, 150 ms network latency, 200 kB/s download, 100 kB/s upload and 4× CPU slowdown. Responsive WebP image delivery changed the measured phone LCP from 8,720 ms to 2,592 ms, with transferred data reduced from 1,764,684 to 703,255 bytes. Desktop LCP changed from 960 to 512 ms. These are single synthetic comparisons on the build machine, not field statistics or a universal device promise.

The 640px lead image was 15,254 bytes versus the 353,799-byte source image. The photo was inspected after conversion. The JavaScript main chunk remains approximately 857 kB raw / 227 kB gzip; route splitting is a useful next optimization.

## Runtime and content limits

Deployment `41eb440f-2e24-4292-9243-e6d3f807366d` started at 01:31:34 UTC and showed no immediate restart loop during observation through approximately 01:40 UTC. Its logs did show upstream BookTix HTTP 403 and some Courier HTTP 429 responses. The app stayed available and reports partial source coverage; an HTTP 200 health response is process liveness, not proof every source is healthy.

The repaired worker deployment `67b61203-2588-419c-acb9-6a78cf66b3b1` completed manual ingestions of 1,131 and 1,111 items, followed by scheduled runs of 1,135 at 01:03:43 UTC, 1,134 at 01:16:28 UTC and 1,118 at 01:32:04 UTC. The latter runs required no manual restart. Upstream rate limits remain distinct from the repaired PostgreSQL duplicate-key failure.

## Final deployment acceptance

Product commit `2801efc`, including the compact phone map, deployed successfully as `9f2b697e-5949-4658-af52-2d2c0eefcd4e`. It began serving at 01:45:05 UTC.

Six additional local browser scenarios passed (three per viewport). They cover aborted draft saves, explicit retry without editing, aborted submission/withdrawal/discard, confirmed submission despite failed draft cleanup, and delayed autosave serialization. The composer retains current text and never claims unimplemented local persistence. A failed submission response says its outcome could not be confirmed, rather than promising it was never received.

Four affected scenarios passed against the final deployed build: the full detail/search/refresh/back/map/list journey and the blocked-write contribution journey, each on desktop and phone. Those deployed failure tests aborted writes before the service; they created no contribution or draft. The more invasive cleanup and withdrawal cases remained local. The final read-only database audit found zero elevated QA accounts.

The six final screenshot captures came from this deployment. Both viewport captures reported no page errors or horizontal overflow; Today, the phone map and the selected day planner were visually inspected. Runtime observation is recorded in the handoff completion note below.
