# Town Square live application

Started 2026-10-02 00:29:50 UTC (October 1, 7:29:50 p.m. America/Chicago).
Deadline 2026-10-02 12:29:50 UTC (October 2, 7:29:50 a.m. America/Chicago).

## Source of truth

- Assignment: [brief.md](brief.md), copied from Downloads without modification.
- Application: `tswic-highdesert/townsquare`, origin/main `268550e`; fetched and confirmed current. Worktree `/Users/talswicegood/Projects/townsquare-live`, branch `codex/townsquare-live`.
- Existing Railway feed services use the separate `tswic-highdesert/river-valley-townsquare` repository. Preserve them and their data. Repair worker independently.
- Approved visual baseline: `design/system/README.md`, explicit September 10 approval. Original mark, Libre Baskerville wordmark, Nunito Sans, Phosphor, forest/mint.
- September 27 round 3 is a proposal, not approval. Use its larger imagery and better hierarchy as refinement evidence consistent with the approved identity. Native Brilliant access was unavailable; local project and export routes were exhausted. See design.md.
- Application already has extensive read routes, contribution/review rules, saves, privacy boundaries, and a creation sandbox. At discovery, runtime storage was in memory and email sign-in only logged links. The delivered resident path uses durable SQLite and handle/password authentication.

## Milestones

1. Discovery: inspect local and Brilliant references, baseline browser, feeds, existing service logs.
2. Thin deployed slice: durable accounts/saves/contribution storage, real content, static app serving, health endpoint, isolated Railway preview service.
3. Complete resident journeys: Today, places/events/news details, URL navigation, search/filter, saved items, contribution and moderator review.
4. Signature experiences: choose after inspecting actual available content; integrate into the main journeys.
5. Visual refinement: approved tokens/icons/type, responsive editorial layouts, authentic imagery, complete states.
6. Verify deployed journeys, narrow phone and desktop screenshots, required checks, final runtime observation, reveal.

## Ownership

- Root: integration, application UX, deployment, content reliability, acceptance evidence.
- `design_discovery`: read-only reference audit, then bounded visual implementation as assigned.
- `infra_audit`: older feed worker diagnosis/repair and deployment evidence in separate worktree.
- `persistence_auth`: durable stores and no-email authentication path; root integrates API main.

## Decisions and boundaries

- Reuse the newer platform rather than rebuilding its security and resident journeys in the archived feed client.
- Deploy alongside current services; no custom-domain routing changes, database deletion, or destructive migration.
- No email sending or automatic mail enabled. No public echo-link sign-in or administrator bypass.
- Guest browsing remains useful. Unknown hours and unverified data must be explicit. Sample creations remain labeled.

## Current evidence and next action

Updated October 2, 2026 at approximately 01:48 UTC. The preview is https://townsquare-live-production.up.railway.app. Core implementation, both signature experiences, and final failure-state repairs are complete. Product commit 2801efc is live as deployment 9f2b697e-5949-4658-af52-2d2c0eefcd4e. All four affected deployed checks passed. Final screenshots, runtime observation, setup instructions and review branches are complete.

- Discovery selected the approved September 10 brand and the proposed September 27 composition as refinement evidence. Native Brilliant could not be inspected; this limitation is explicit in [design.md](design.md).
- Durable accounts, sessions, saves, drafts, contributions and reviewed record corrections use SQLite on a Railway volume. Real deployment replacement preserved all these states.
- Today uses current local reporting, credited photographs and source dates. Dates use America/Chicago. Search, details, navigation and direct links work.
- The signatures are an attributed local OpenStreetMap map and a day planner using real places and published events. Both connect to persistent saves.
- “Lunch around town” is a labeled starter creation on a separate origin. Actual deployed browser checks verified its privacy boundary.
- Reviewer approval, decline, concurrent-decision conflicts, unauthorized requests and role revocation were checked. A source-supported phone-format correction reached both public directory APIs. No elevated QA accounts remain.
- The old worker's PostgreSQL 21000 failure was repaired. Two manual and three subsequent scheduled ingestion runs succeeded on the same repaired deployment. Existing databases and custom domains were preserved.
- The desktop and phone experience was visually inspected, including 200% text and narrow widths. Final deployed screenshots are in screenshots/deployed.
- Full tests: 90 files, 1,351 passed. Browser boundary suite: 29 passed. All 18 deployed routine scenarios have passing evidence; one immediate Escape timing race required an explicit focus-ready assertion and passed six consecutive reruns.
- Responsive WebP photos reduced a single controlled slow-phone LCP measurement from 8.72 to 2.592 seconds. This is synthetic evidence, not a real-device performance guarantee.

## Completed handoff

1. Contribution network failures repaired; six local regressions and four affected deployed checks passed.
2. Final deployment logs observed through approximately 01:47:30 UTC with no immediate restart loop. Source coverage remains explicitly partial.
3. Final deployed screenshots inspected and committed; app and worker branches pushed as draft pull requests.
4. Tour, known limits, infrastructure details, setup and next improvements are in [handoff.md](handoff.md).

See [deployment.md](deployment.md), [source-health.md](source-health.md), [content-verification.md](content-verification.md), and [accounts and persistence](../persistence-and-accounts.md) for detailed evidence.
