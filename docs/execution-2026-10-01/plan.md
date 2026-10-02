# Town Square live application

Started 2026-10-02 00:29:50 UTC (October 1, 7:29:50 p.m. America/Chicago).
Deadline 2026-10-02 12:29:50 UTC (October 2, 7:29:50 a.m. America/Chicago).

## Source of truth

- Assignment: [brief.md](brief.md), copied from Downloads without modification.
- Application: `tswic-highdesert/townsquare`, origin/main `268550e`; fetched and confirmed current. Worktree `/Users/talswicegood/Projects/townsquare-live`, branch `codex/townsquare-live`.
- Existing Railway feed services use the separate `tswic-highdesert/river-valley-townsquare` repository. Preserve them and their data. Repair worker independently.
- Approved visual baseline: `design/system/README.md`, explicit September 10 approval. Original mark, Libre Baskerville wordmark, Nunito Sans, Phosphor, forest/mint.
- September 27 round 3 is a proposal, not approval. Use its larger imagery and better hierarchy as refinement evidence consistent with the approved identity. Latest Brilliant discovery remains in progress.
- Application already has extensive read routes, contribution/review rules, saves, privacy boundaries, and a creation sandbox. Runtime storage is currently in memory; email sign-in only logs links. These are implementation gaps, not working production integrations.

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

Updated October 2, 2026 at approximately 01:05 UTC. The working preview is https://townsquare-live-production.up.railway.app. The creation sandbox runs separately at https://q02aheqxh3jz.up.railway.app.

- Discovery selected the approved September 10 brand foundation plus the proposed September 27 round-three composition as creative direction. Brilliant could not expose its native canvas; local project and export routes were inspected. See [design.md](design.md).
- Durable handle/password accounts, sessions, saves, drafts and contributions now use SQLite on a dedicated Railway volume. No email sending is configured. Guest browsing remains open.
- Today uses real October local reporting and attributed photos. Away athletics are excluded. Dates are interpreted in America/Chicago, with recurrence IDs preserved.
- Internal navigation has shareable URLs, refresh and back support. Search indexes real news, events and all directory places. Places provide contact/directions, saves and corrections.
- The two signatures are a real OpenStreetMap town map served from this origin and a day planner assembled from real places and events, with choices retained through sign-in and saved across sessions.
- “Lunch around town” is clearly labeled as a Town Square starter example. It runs in the separate sandbox and reads real public listings; it claims no resident authorship, ranking or community activity.
- First deployed desktop and phone browser checks passed signup, saving, reload, sign-out, new-context sign-in and durable correction submission. Expanded checks exposed disabled internal search results and a missing moderator correction screen; both are being corrected before final acceptance.
- The old worker failure was PostgreSQL 21000 caused by repeated conflict keys in bulk upserts. Its repaired deployment has completed two ingestion runs (1,131 and 1,111 items); exact scheduled-run attribution is still being verified. Existing databases and custom domains are unchanged.

## Validation so far

- `DOCKER_HOST=unix:///Users/talswicegood/.colima/default/docker.sock TESTCONTAINERS_RYUK_DISABLED=true pnpm test`: 89 files, 1,345 tests passed at 01:01 UTC. Subsequent changes require a final run.
- `pnpm typecheck`, `pnpm gen:check`, and `pnpm --filter @townsquare/web build` passed. The build reports a large main JavaScript chunk; no linter script exists in package.json.
- Desktop and phone visual review, details, map and 200% text checks show no horizontal overflow. See screenshots and design evidence.
- Deployment e7817f15-0edd-4cde-a85a-8f7e72f927ba was the first successful app slice. Deployment eb9efd12-0276-45d8-8a62-2e84bc5556db is the next app build; final acceptance must use a later build containing all fixes.
- Sandbox deployment f9cdf45a-a36d-4435-932c-6dcad90c3407 succeeded.

## Remaining acceptance work

1. Finish correction moderator UI and per-source freshness reporting; rerun integration checks.
2. Deploy the integrated changes. Exercise every core and signature journey against that exact deployed build on desktop and phone.
3. Prove correction review and persistence after deployment/restart; revoke temporary QA reviewer access.
4. Run the browser boundary suite on isolated ports, and verify the actual deployed sandbox.
5. Capture final deployed screenshots, observe services for immediate restart loops, record setup/deployment/limitations, commit and publish reviewable branches.
6. Deliver URL-first reveal and a three-minute tour. Do not call the goal complete before the deployed acceptance evidence exists.
