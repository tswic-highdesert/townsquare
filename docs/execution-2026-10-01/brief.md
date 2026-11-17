You have 12 hours to turn our latest Town Square mockups in Brilliant into a beautiful, functioning application for Russellville and the Arkansas River Valley.

I am leaving you with creative freedom and responsibility for the result. Make something that makes me excited to show my neighbors. Prioritize a memorable, useful experience over production completeness.

This is an execution assignment. Discover, design, implement, deploy, test, and refine. Do not stop after producing a plan, a frontend shell, or a successful build.

THE OUTCOME

Town Square should feel like the place you open to reconnect with your town: what is happening, what matters, where to go, and what your neighbors are making.

It should make a resident think:
“I didn’t know that was happening.”
“I want to go there.”
“I could contribute something here.”
“This feels like us.”

Deliver a coherent application with real data, persistent interactions, strong visual craft, and a working deployment. The first minute should impress me. The next ten minutes should reward exploration.

Use this priority order:
1. Local character and visual quality.
2. Complete, satisfying user journeys.
3. Useful, trustworthy community content.
4. Reliability sufficient for a convincing live demo.
5. Production hardening and architectural elegance.

Do not interpret “wow me” as permission to fabricate community activity or leave attractive controls disconnected.

ESTABLISH THE CURRENT SOURCE OF TRUTH

Spend the first 45 minutes finding and understanding the actual current work.

- Read applicable repository instructions and inspect the working tree before editing.
- Locate the latest Town Square project and mockups in Brilliant. Inspect them visually, including mobile, desktop, detail screens, and interaction states.
- Identify which designs were approved, which are proposals, and which supersede earlier work. A recent file timestamp alone does not establish approval.
- Locate the active repository through current project files, git history, and deployment source configuration. Do not assume an old remembered repository is canonical.
- Use OpenBrain for durable product context and my preferences. Verify technical facts against current files and tools.
- Identify working assets, feeds, APIs, auth, database models, maps, and deployment infrastructure before rebuilding them.

Discovery leads verified while preparing this prompt:
- ~/Downloads/townsquare-direction-round3.zip
  Contains a September 27, 2026 direction document and mockups. The document is marked proposed.
- ~/Downloads/townsquare-review-2026-09-26.zip
- ~/Downloads/townsquare-review-round2.zip
- Railway project: River Valley Town Square
  Project ID: 20d807a4-40ae-471f-abf8-eecc8d00a427
  Services: rvts-api, rvts-worker, Postgres

These are leads, not a claim that those exports are the latest Brilliant designs or that those services are healthy.

The earlier approved design foundation included the original mark, Libre Baskerville wordmark, Nunito Sans application type, Phosphor icons, and forest/mint colors. September feedback emphasized larger and better imagery, stronger type hierarchy, better proportions, fewer outlined boxes, and a more premium experience.

Let newer explicit decisions and the latest selected Brilliant designs govern. Do not reopen the entire brand unnecessarily.

Older strategy emphasized a feed-first product. This assignment explicitly expands that scope into a functioning application. Preserve useful infrastructure and the community mission without treating old scope restrictions as the current brief.

If Brilliant is inaccessible, exhaust reasonable export and local-file routes, document which reference you selected, and proceed. Do not spend hours searching or quietly pretend that an older export is the latest design.

PRODUCT AND DESIGN OWNERSHIP

Translate the mockups into a real product while preserving their identity. You may improve missing states, navigation, responsive behavior, copy, transitions, and awkward interactions.

Make confident choices. Do not ask me to choose libraries, card layouts, button labels, or routine implementation details.

Aim for:
- An immediately compelling Today experience.
- Actual local people, places, stories, events, and imagery.
- Editorial hierarchy and generous breathing room.
- Crisp, correctly sized photographs and attractive honest fallbacks.
- Mobile layouts that feel deliberately designed.
- Desktop layouts that use the available space.
- Subtle motion and satisfying feedback where they improve understanding.
- Natural copy written for neighbors.

Avoid generic dashboard styling, repetitive cards, decorative metrics, oversized empty controls, forced AI features, and onboarding that delays discovering the town.

Keep established privacy and accessibility requirements. Make keyboard interaction, readable text, touch targets, reduced motion, and modal behavior work as part of the design.

THE FUNCTIONAL CORE

Derive the final navigation and feature boundaries from the current mockups. The following are outcomes to cover, not an instruction to invent a separate product:

1. Discover the town.
A resident can open Today, discover something useful, and reach a complete story, event, place, or creation detail page.

2. Find something specific.
Search and relevant filters produce meaningful results. Events handle dates correctly. Directory entries provide useful verified details and working contact or directions actions.

3. Make Town Square personal.
Provide a working account/session path and persistent saves or follows appropriate to the designs. A saved item must remain saved after refresh and a new session. Guest browsing should remain useful.

4. Contribute.
Complete at least one contribution journey supported by the mockups: an event, correction, community submission, or creation. Persist it, show its status, and provide a usable review path when moderation is needed.

5. Return.
The resident can revisit saved items, contributions, or interests and find a meaningful reason to come back.

Every primary action visible in the delivered experience must work. Remove, defer, or clearly explain unavailable secondary actions. Do not use success toasts to conceal missing backend behavior.

Use the existing stack if it can deliver the experience. Replace components selectively when there is a concrete advantage. Choose the simplest dependable persistence and service arrangement; avoid spending the run constructing a general platform.

TWO SIGNATURE EXPERIENCES

After the core works, create two memorable moments that belong specifically to Town Square.

Choose based on the actual designs, available data, and remaining time. Possibilities include:
- A beautiful map linked to nearby places and events.
- A “Your Saturday in the River Valley” plan assembled from real events and places.
- A town briefing that connects local news, civic decisions, and things to do.
- A neighbor-made creation that is useful and actually interactive.

You own the choice. These should deepen the community experience and connect to working data and actions. They should not become isolated demonstrations or delay completing the core.

CONTENT MUST EARN TRUST

Use existing Town Square content and working sources first. Validate dates, links, image quality, attribution, and freshness.

- Never invent current events, opening hours, resident testimonials, attendance, or business endorsements.
- Distinguish unknown information from verified facts.
- Show source and date where they matter.
- Use real local imagery when available and appropriate.
- Use clearly illustrative artwork or maps when photographs are unavailable.
- Keep any sample content clearly labeled and separate from public factual content.
- Do not dress old events as upcoming events to fill the screen.
- A failed source should not break the whole application.

Favor a smaller collection of excellent, current local content over a large collection of stale filler.

RAILWAY AND DEPLOYMENT

You are authorized to use Railway for this build, including routine configuration fixes, application deployments, and reasonably sized services needed for the demo.

Inspect the existing Town Square services early:
- Deployment and runtime logs.
- Build and start configuration.
- Port binding and health checks.
- Database connectivity and migrations.
- Worker schedules, retries, and resource limits.

Diagnose crashes from evidence. Do not repeatedly restart services without learning anything.

Time-box the initial infrastructure investigation to about 60–90 minutes. Repair the existing services when practical. If recovery becomes a rabbit hole, isolate the problem and deploy a working replacement or preview alongside it.

Preserve existing data and unrelated services. Prefer additive migrations and reversible changes. Do not delete databases, wipe volumes, force-push shared history, or change live custom-domain routing without explicit authorization.

Deploy a thin working slice early, ideally by hour 3. Continue verifying the deployed environment throughout the run.

Keep infrastructure proportionate. Avoid expensive always-on resources, unbounded scraping, and unnecessary subscriptions. Record new services and recurring costs when known.

AUTONOMY AND BOUNDARIES

Proceed autonomously on reversible work within this assignment. If a decision is ambiguous, inspect the evidence, choose, and continue.

Use parallel agents for bounded independent tasks when available. Give them clear ownership and acceptance criteria. Keep one coherent product direction and integrate their work continuously.

Respect my existing email approval rule. Do not send email or enable automatic sending without showing the complete send details and receiving my explicit approval. Do not send outreach, publish social posts, or contact residents.

Do not let an email-provider dependency block the whole demo. Use a safe supported account flow or an isolated demo environment without weakening public authentication or exposing an admin bypass.

If an action genuinely requires approval, ask once and continue independent work. Silence is not approval.

THE 12-HOUR EXECUTION RHYTHM

Record the actual start time and the deadline 12 hours later. Manage time from the clock, not intuition.

Target milestones:
- Hours 0–1: Find the source of truth, inspect designs, select the repository, identify infrastructure problems, and define the demo journey.
- Hours 1–3: Build and deploy one real vertical slice with persistence and representative local content.
- Hours 3–6: Complete the primary screens and resident journeys.
- Hours 6–9: Deliver the two signature experiences and refine visual quality.
- Hours 9–11: Test the deployed app, fix broken journeys, improve content and responsive behavior.
- Hours 11–12: Freeze new scope, repair remaining demo blockers, verify the final deployment, and prepare the reveal.

Adjust these allocations when evidence warrants it. Preserve at least the last hour for integration and verification.

If behind schedule, reduce secondary breadth. Preserve the coherent core, the visual identity, and the best signature experience. Do not conceal cuts.

If the core finishes early, use remaining time to improve the actual product through browser review, richer content, better interactions, and fixes. Do not manufacture work, repeatedly run unchanged tests, or idle to consume time.

LONG-RUN DISCIPLINE

Maintain a concise implementation plan, decision record, and validation evidence in the repository’s normal engineering documentation. These are project artifacts, not personal memory.

Use OpenBrain only for appropriate durable context. Do not create local cross-session memory substitutes or store task progress in OpenBrain.

Keep enough project evidence to recover after context compaction:
- Selected repository and design references.
- Current milestone and next concrete action.
- Decisions and unresolved blockers.
- Verified commands and deployment URLs.
- Changes made and validation results.

After compaction, inspect current state and resume. Do not restart discovery.

Work in small, integrated increments. After each meaningful milestone:
1. Run the relevant checks.
2. Exercise the affected journey in a real browser.
3. Inspect the visual result.
4. Fix meaningful failures.
5. Record evidence and continue.

Give brief progress updates with tangible results and remaining uncertainty. Do not ask whether to continue after each milestone.

Do not claim that a background run is active unless the runtime actually supports it. If execution limits interrupt the run, preserve a precise recovery point and report the interruption honestly.

THE ACCEPTANCE TEST

Before the final handoff, use the deployed application as a resident would.

Verify:
- The app opens on desktop and mobile without blocking errors.
- Primary navigation, direct links, refresh, and browser back work.
- Current local content leads to complete detail pages.
- Search and filters return useful results.
- Authentication and sign-out work through the chosen supported path.
- Saves persist across refresh and a new session.
- A contribution persists and reaches its intended review or publication state.
- Unauthorized users cannot access protected actions.
- The signature experiences work with their actual dependencies.
- Empty states, failed requests, and missing images are handled gracefully.
- No core journey depends on a local development server.

Check representative narrow-phone and desktop widths. Capture and visually inspect screenshots against the selected Brilliant references.

Run the project’s required build, type, lint, and relevant functional checks. Repair regressions you introduce. Prioritize meaningful integration tests over arbitrary coverage targets.

Observe the final deployed services long enough to detect immediate restart loops. Report exactly what was verified; do not turn a brief successful observation into a claim of production reliability.

THE REVEAL

Finish with:
1. The working application URL, first.
2. A short explanation of what makes the result special.
3. A three-minute click-by-click tour that shows the strongest moments.
4. Screenshots of the key mobile and desktop experiences.
5. A clear distinction between live integrations, labeled demo content, and unfinished work.
6. What happened to the crashing Railway services, supported by evidence.
7. Repository, branch or commit, setup instructions, and deployment details.
8. A short list of the next improvements worth making.

Never put secrets or private credentials in the handoff.

The standard is simple: I should open the link, recognize our latest design direction, discover something about my community, and feel that Town Square has become real.

Start now. Own the result.
