# Design source and implementation evidence

## Source decision

The approved foundation is `design/system/README.md`, explicitly locked by Tal on September 10, 2026. It supersedes the historical visual styling in `design/hifi` and `design/hifi-v2`: original raster mark, Libre Baskerville wordmark, Nunito Sans application type, Phosphor icons, forest actions, mint emphasis and a light canvas. The identical Daily rules also exist in `/Users/talswicegood/Desktop/Projects/TownSquare/daily-design-rules.md`. That explicit approval takes precedence over the older HANDOFF wording that still calls the font choice a proposal.

The September 27 Round 3 direction export remains **proposed**, not approved. The current build assignment explicitly requests stronger imagery, proportion, hierarchy and premium execution, so this implementation selects Round 3 as the composition reference while preserving the approved brand. This is an execution choice under the current brief, not a claim that the proposal acquired historical approval.

References extracted for inspection:

- `/tmp/townsquare-design-review/townsquare-direction-round3/direction-round3.md`
- Round 3 `today-desktop-1440.png`, `today-phone-412.png`, `place-desktop-1440.png` (visually inspected).
- Round 2 `map/map-picked-412.png`, `pages/story-1280.png`, `signup/signup-email-1280.png` (visually inspected).
- September 26 and Round 2 `REVIEW.md` distinguish shipped work, ongoing branches and proposals. September 26 dark/native/comfort/glyph variants are explicitly off by default. Round 2 category hues were still a decision request.

## Brilliant discovery and limitation

The native Brilliant app is installed at `/Applications/Brilliant.app`, bundle ID `design.brilliant`. Computer-use selection failed with `cgWindowNotFound`; inventory confirmed the process running but did not yield an inspectable window. No Brilliant connector was exposed.

Local project discovery inspected `~/Brilliant/*/*.bl`. The only Town Square canvas found was `~/Brilliant/Untitled Project/main.bl`: a desktop “Town Square · Home · Marlow Bend” and a 390×844 mobile Today. Its orange replacement mark, Inter/Plus Jakarta type and fictional Oregon location conflict with the explicit approved foundation. No approval record was found. Its `.brilliant/settings.json` selects `ops-dashboard-v3`, an unrelated canvas. The other local canvases belong to unrelated projects. No selected newer Russellville design was established. This build therefore uses the documented exports above; it does not represent them as the latest verified Brilliant state.

Other local projects were checked: `townsquare-design-lab` records the locked Daily workshop; `townsquare-mockups` is explicitly an alternative Bond-language design-only exploration, not a replacement.

## Implementation

- Preserve all existing token keys and sandbox theming contract. Map application defaults to Daily palette, readable metadata and rem type scale.
- Bundle approved Nunito Sans and Libre Baskerville locally as WOFF2, converted from the repository's approved TTFs; retain adjacent OFL licenses.
- Use bundled Phosphor React 2.1.10 for the existing icon API. Preserve the original raster mark in `brand/png/mark-ui-256.png`.
- Today uses an editorial lead/events split on desktop, full-bleed photographic lead and horizontal event rail on phones, four news columns, a quiet discovery invitation and useful local directory links.
- Every story/event/place can open an internal detail route. Missing images become publisher-name artwork, not a borrowed photograph. Original category illustrations are plainly illustrative.
- Do not present the seed Burrito Index as resident activity. Today instead offers an honest invitation to explore creations/contribute.
- Preserve 44px touch targets, visible keyboard focus, reduced-motion behavior and four stable main destinations.

## Validation

Initial actual browser screenshots captured via repository Playwright at `http://127.0.0.1:4310`, 1440×1000 desktop and 390×844 phone. The first desktop screenshot revealed a legacy grid cascade conflict; selector specificity was corrected. The phone screenshot showed the real ATU gallery photo, no horizontal page overflow and the approved font. Further screenshots and final validation are recorded below as implementation proceeds.

The corrected desktop and phone views were re-captured and visually inspected with the actual API at port 4311. Evidence: `screenshots/today-desktop-local.png` and `screenshots/today-phone-local.png`. The lead was a real ATU Norman Hall gallery photograph, loaded at 1000×667. Browser checks found no page overflow at 320px, 390px, 1440px, or 390px with 200% root text enlargement. The initial large-text grid minimum caused overflow and was fixed rather than clipped. Portrait feed artwork is contained so poster text is not cropped away.

Validation passed: TypeScript, production web build, 15 token contract tests, 20 contrast tests, and 7 CSS layer tests. Exact historical hi-fi palette assertions were updated to the selected Daily values; token-name compatibility and contrast checks remain intact. These screenshots demonstrate local visual implementation, not final deployed acceptance.


## Further local visual review

The Daily treatment now extends across Directory, Creations, News and the story reader, Events and event detail, signed-out Yours, and the native day planner. Creations distinguishes native platform tools from explicitly labelled starter examples; it makes no invented resident, endorsement or review-committee claims. Directory uses a concise invitation and visible search before its factual source caveat. Place actions, source provenance and save/correction controls remain visible on a phone.

Browser review covered the six main journeys at 1440×1000 and 390×844. Each main journey was also checked with 200% root text enlargement; none produced horizontal document overflow. Story, event and place details were opened from their actual cards on both viewport sizes and visually inspected. Their exact images are saved as `screenshots/{story,event,place}-{desktop,phone}-local.png`. No page errors were emitted during those detail journeys. TypeScript passed after these changes.

The real locally served OpenStreetMap geometry was integrated by the coordinating agent using the authoritative GeoJSON documented in `maps/README.md`. Desktop and phone map screenshots were visually inspected, including a selected place. The desktop height is capped so the map and attribution fit the viewport. On phones a selected pin reduces the map height so the place card remains visible above the navigation bar. Controls meet 44px targets. Map and selected-map views showed no horizontal overflow with 200% root text enlargement. Evidence: `screenshots/map-{desktop,phone}-local.png` and `screenshots/map-selected-{desktop,phone}-local.png`.

These remain local implementation checks. Production deployment, authenticated persistence, source freshness and complete end-to-end acceptance belong to the coordinating execution record.
