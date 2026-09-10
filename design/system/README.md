# TownSquare — The Daily design system

Status: **approved and locked — version 1.0.0, 2026-09-10.** Tal explicitly approved this baseline. Design approval is not a production rollout or a completed accessibility/interaction QA sign-off.

## Approved direction

- The softer Daily is the approved foundation.
- Retain the approved TownSquare logo and wordmark typeface.
- Make the surrounding application friendlier and softer, without making it childish.
- Remove competing small typefaces and improve iconography.
- Adopt compact, useful directory layouts inspired by the Civic exploration.
- Retire the large Burrito Index poster treatment. Present creations as useful neighbor-made apps.
- Do not use The Commons' dark palette as the main application scheme.

## 1. Typography

Use exactly one application typeface at a time. Libre Baskerville remains only in the existing wordmark.

**Nunito Sans is the approved application typeface.** It is self-hosted with its license. Plus Jakarta Sans was explored and is not part of the locked system.

| Role | Size / line height | Weight |
|---|---|---|
| Page title | 32 / 38px; mobile 27 / 34px | 750 |
| Section title | 22 / 28px | 700 |
| Card/group title | 18 / 24px | 700–750 |
| Body | 16 / 25px | 450 |
| Labels and sources | 14 / 20px | 550 |
| Secondary preview/brand annotation | 12 / 18px | 500 |

Use sentence case. No monospaced eyebrows, miniature all-caps labels, decorative italic editorial headlines, or arbitrary extra fonts. Source and event information are real content; do not shrink them into decoration. Allow long names to wrap. Express production tokens in rem and verify at 200% text enlargement.

## 2. Palette

| Token | Value | Role |
|---|---|---|
| Canvas | #F7F9F5 | App background |
| Surface | #FFFFFF | Content and controls |
| Ink | #263B32 | Primary reading text |
| Secondary text | #64746B | Secondary text on white |
| Forest | #315B4C | Primary actions and selected states |
| Forest hover | #24483B | Primary hover |
| Mint wash | #E8F1E9 | Selected/featured soft surfaces |
| Mint text | #5B6C61 | Supporting text on mint |
| Peach wash | #F8EADC | Occasional neighbor-made accent |
| Quiet border | #DCE6DD | Group separation, not control recognition |
| Control border | #B3C4B7 | Field boundaries, paired with a contrasting surface/label |
| Focus | #668974 | Visible focus ring |
| Error text | #A64E45 | Explicit, labeled validation errors |

Calculated contrast ratios: Ink/white 11.97:1; Secondary/white 4.94:1; white/Forest 7.69:1; Mint text/Mint wash 4.83:1. These cover specified pairs only, not a full accessibility audit. Pale borders must never be the only signal that something is interactive. Confirm non-text contrast and focus treatment in the finished app.

Use mostly white and ink. Mint establishes emphasis; peach is occasional. Do not give every category a color. Status meaning must be communicated with words or icons as well as color.

## 3. Iconography

**Approved family: Phosphor.** The workshop demonstrates the duotone and regular roles within that single family.

- Duotone: major destinations and content-category tiles.
- Regular: small utility actions and unselected saved state.
- Fill: positive saved/selected state.
- Bold: a few small directional/check glyphs where clarity requires it.
- Navigation/control glyphs: 20–24px. Category tiles may use 24–28px.
- Product hit target: at least 44 × 44px. This is our product target, not a claim that WCAG AA universally requires 44px.
- Keep visible labels on primary navigation.
- Never mix arbitrary icon families, emoji stand-ins, and hand-drawn approximations of the logo.

The creation icon plate is an approved system treatment, not a standalone rebrand of the Burrito Index.

## 4. Shape and spacing

Spacing scale: 4, 8, 12, 16, 24, 32, 48px.

Corners: fields 18px; compact content rows 20px; content cards 24px; detail sheets 30px. Use fully rounded pills for buttons, filter segments, and short status controls—not for paragraphs or whole content sections.

Nested corners should follow the inset. An outer 24px corner with an 8px inset gives an inner 16px corner. Avoid an unrelated radius on every nested element.

Directory rows start at 80px with a 48px category tile. Keep the name and one useful secondary line; add category where width allows. Grow for long content rather than clipping. No large letter-poster cards, invented distances, unsupported open-now claims, or substitute stock photos.

## 5. Components

### Buttons

46px height, content-sized width, 20px horizontal padding, 8–9px icon gap. One primary action per local area. Secondary actions use a quiet surface and readable label. Keep width stable across Save/Saved. Disabled is visibly unavailable and actually disabled.

### Inputs

Use a persistent visible label, 16px editable text, generous internal padding, and a helpful message below. Show an error with text plus color. Do not validate as a punitive interruption while typing. The workshop's email validation is a local component demo; it submits nothing.

### Navigation and filters

Stable destination labels; generous targets; a clear selected surface. A selected state must not depend only on a faint color shift. Global font and icon preferences are pressed-button groups; screen navigation uses proper tab/panel pairs.

### Creations

A compact, quiet row: icon plate, name, purpose/attribution, and an inspect action. No promotional poster. The detail screen explains purpose and permissions before launching anything. Keep the platform trustworthy even when an app is playful.

### Detail layers

Use an anchored right-side sheet on wider screens and a bottom sheet on phones. Preserve the underlying context. Move focus into the sheet, let Escape dismiss, return focus to the originating control, and keep Close reachable. Validate these behaviors with the completed implementation.

## 6. Motion

Hover/press: 160ms. Selection: 220ms. Detail layers: 240ms. Use cubic-bezier(.2,.8,.2,1) for gentle settling where appropriate. Button press moves at most 1px; image hover scale at most 1.025. The detail entrance offset is 24px.

No wobble, endless bobbing, delayed access to content, or repetitive entrance animations when switching destinations. Reduced motion removes travel/scale without removing state feedback. A 650ms pending state in the workshop is an explicitly labeled demonstration, not a real network request.

## 7. Definition of premium

The premium quality is in coherence: one typographic voice, aligned baselines, balanced curves, controlled density, readable secondary text, appropriate empty/error states, and small interactions that finish cleanly. It is not the number of effects or the price of a component package.

## 8. Implementation and change control

Apply the locked system to Today, Places, Creations, Saved, and account-dependent flows when implementation is requested. The prior concepts remain historical references; do not reopen typography, icon families, or the overall palette as part of routine screen work.

Small accessibility, optical, and responsive corrections may improve this system without changing its identity. Material changes to the font family, icon family, palette, or visual direction require explicit design approval. Keep the tokens and these rules synchronized.

This is a design baseline, not a production migration. Existing source-attribution, security, sandbox, identity, permissions, and honest-data requirements remain in force. Confirm the completed implementation through visual, keyboard, responsive, reduced-motion, and assistive-technology testing.

## Sources

- Nunito Sans: https://github.com/google/fonts/tree/main/ofl/nunitosans
- Plus Jakarta Sans: https://github.com/tokotype/PlusJakartaSans
- Phosphor: https://github.com/phosphor-icons/react
- W3C contrast guidance: https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html
- W3C minimum target-size guidance: https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html

## Repository authority and integration

This directory is TownSquare’s approved visual baseline. `tokens.json` is the locked design specification; it is not yet wired to the runtime token package. The matching review is https://townsquare-design-lab.tal358537.chatgpt.site/workshop.

The earlier hi-fi sheets remain useful for screen inventory and interaction requirements, but their visual styling is superseded where it conflicts with this baseline. Product/security contracts in the root specs still take precedence over visual choices.

Keep the approved logo assets in `brand/` unchanged. `assets/nunito-sans.ttf` and its license are the approved self-hosted font reference. Phosphor React 2.1.10 was used in the review; preserve the one-family icon rules when integrating. Do not load production fonts or icons from a third-party CDN.

Map these approved values into the existing `packages/tokens` contract during implementation. Preserve sandbox theming, namespacing, and security boundaries; do not copy isolated hard-coded colors into creation surfaces or casually rename/remove SDK-facing tokens.

Locking this directory makes no runtime changes. Integration, regression tests, complete accessibility testing, and a production rollout are separate work.
