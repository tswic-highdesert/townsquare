# Town Square — working Russellville preview

https://townsquare-live-production.up.railway.app

Town Square now connects a current local front page to useful details, an actual town map, a day out, persistent saves and a complete listing-correction journey. The original mark, Libre Baskerville wordmark, Nunito Sans, Phosphor icons and forest/mint palette remain intact. The larger editorial composition draws on the September 27 proposed direction; native Brilliant access was unavailable, so this is not a claim that those exports are the latest approved canvas.

## A three-minute tour

1. **0:00–0:35 — Today.** Open the lead local story, read its source and date, then return. At the time of capture, the lead was ATU's Tangential faculty exhibition at Norman Hall.
2. **0:35–1:15 — Explore the map.** Choose “Explore the map” or open `/places?view=map`. Select Eat and drink, tap a place, and open “View place & save.” Phone, website and directions use the listing's real details. Listed hours are dated information, not a promise the door is open now.
3. **1:15–2:10 — Make a day of it.** Open “Plan a River Valley day” or `/weekend`. Pick coffee, a published event and somewhere to eat. The capture uses Retro Roasts, LDSP Saturday Programs and Stoby's. Create a handle/password account when saving; the selections survive the sign-in detour. The stops are saved individually in Yours.
4. **2:10–3:00 — Make it yours.** Open Yours and revisit a saved stop. From a place detail, choose its correction action to see the contribution flow. Submit only a genuine correction: it persists with a visible review status. A provisioned moderator can inspect evidence, approve or decline it, and the contributor can see the decision. The Creations screen also offers the explicitly labeled Lunch around town starter.

No email is sent. Passwords require at least 12 characters. There is no shared account or public administrator bypass.

## Screenshots

These are captures of the deployed application, not mockups. The phone map has an additional final refinement that brings its category strip, map and selected place into one viewport.

| Experience | Desktop | Phone |
| --- | --- | --- |
| Today | [Desktop](screenshots/deployed/today-desktop.png) | [Phone](screenshots/deployed/today-phone.png) |
| Town map | [Desktop](screenshots/deployed/map-desktop.png) | [Phone](screenshots/deployed/map-phone.png) |
| Day planner | [Desktop](screenshots/deployed/day-planner-desktop.png) | [Phone](screenshots/deployed/day-planner-phone.png) |

## What is live

- Current reporting and published events from local sources, with source links, dates, Chicago time handling and partial-source diagnostics.
- 741 dated directory listings, contact/directions actions, source-supported correction overlays and a real attributed OpenStreetMap basemap hosted by Town Square.
- Handle/password authentication, durable sessions, saves, drafts, submitted corrections and moderator decisions on a dedicated SQLite volume.
- The two signature experiences use those real data and persistence paths.
- A separate-origin interactive starter reads real public restaurant listings and has no resident-identity permission.

“Lunch around town” is an example made by Town Square. It is not presented as resident activity. There are no invented testimonials, votes, attendance figures or residents. Creation publishing is explicitly unavailable; its broader moderation platform is not production-connected.

Password recovery, production backups, a staffed moderation process and exhaustive re-verification of directory hours remain unfinished. Some external feeds return no data, HTTP 403 or HTTP 429. The app preserves useful content and reports partial coverage rather than claiming that every source is healthy. The main JavaScript bundle still warrants route splitting.

## Railway repair and verification

The legacy worker failed with PostgreSQL SQLSTATE 21000 because repeated conflict keys reached a bulk upsert. The repair preserves distinct recurrence exception identities and deduplicates defensively before persistence. The repaired deployment completed two manually initiated ingestion runs and three subsequent scheduled runs without another manual restart. The most recent observed scheduled run completed at 01:32:04 UTC with 1,118 items.

The existing API, Postgres data and custom-domain routing were preserved. The new resident app and creation sandbox are additive services. The app has one 0.5 vCPU / 0.75 GB replica and a 1 GB volume; the sandbox has 0.25 vCPU / 0.25 GB caps. Railway usage charges apply; no credible incremental monthly bill is available yet. No paid map or email service was added.

Validation includes 1,351 unit/integration tests, 29 browser boundary tests, desktop and phone resident journeys, actual redeployment persistence and source-supported correction approval. See [validation evidence](validation.md) for exact scopes, reruns, limitations and the final deployment observation window. A short successful observation does not establish production uptime.

## Code and operation

- App repository: [tswic-highdesert/townsquare](https://github.com/tswic-highdesert/townsquare), branch `codex/townsquare-live`, [draft PR #1](https://github.com/tswic-highdesert/townsquare/pull/1).
- Worker repository: [tswic-highdesert/river-valley-townsquare](https://github.com/tswic-highdesert/river-valley-townsquare), branch `codex/townsquare-feed-repair`, [draft PR #1](https://github.com/tswic-highdesert/river-valley-townsquare/pull/1), repair commit `73438c7`.
- Both repositories are private. The branches are pushed and reviewable; neither was merged into main. The worker repair must be merged before a future deployment from main, or that deployment would replace the uploaded repair with older code.
- [Setup and deployment](deployment.md) includes Node/pnpm versions, local commands, Railway service IDs, volume settings, resource caps and deployment commands.
- [Accounts and persistence](../persistence-and-accounts.md) covers reviewer provisioning and persistence evidence. Reviewer access requires a deliberate server-operator action.
- [Design evidence](design.md), [content spot checks](content-verification.md), [source diagnostics](source-health.md) and [map provenance](maps/README.md) explain the selected references and factual limits.

## Next improvements worth making

1. Add tested backups and restoration, password recovery and a defined moderation owner before wider public use.
2. Work with local sources to repair blocked feeds and refresh directory hours, photos and ownership information.
3. Split route bundles and expand real-device accessibility/performance checks.
4. Open resident creation publishing only after its durable moderation and operational path is complete.
