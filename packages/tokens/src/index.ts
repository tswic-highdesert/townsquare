/**
 * Design tokens, one source for two consumers.
 *
 * The shell uses these directly. Creations receive them as CSS custom
 * properties injected into the sandboxed frame, which is what makes fifty
 * independently built mini-apps feel like one town square rather than a pile of
 * widgets, and costs a builder nothing to adopt.
 *
 * It is also the multi-town theming seam: a town that reskins Town Square
 * reskins every creation running inside it, without any creation being changed
 * or even reloaded.
 *
 * ## Where these values come from
 *
 * `design/system/README.md`, the approved Daily visual foundation, with the
 * September 27 composition direction selected for the October build. The base
 * brand in `brand/` still wins for the logo itself, and the two differ on
 * purpose: the brand palette is built for a mark on a page, this one is built
 * for a screen someone reads for a while.
 *
 * Two things worth knowing before changing anything here:
 *
 * **Names are contract; values are not.** A creation styling itself with
 * `var(--ts-navy)` must survive a town changing its palette, so renaming or
 * removing a token is an SDK 1 break while changing what it resolves to is
 * routine. Adding is always safe.
 *
 * **Muted text uses readable Daily values; hairlines and shadows derive from ink.** This keeps metadata readable while it remains quieter than a headline. `navy60` and friends still exist, and still mean
 * navy, because they are named navy.
 */

export const tokens = {
  color: {
    /** The screen. Not `#EDE9E0` — that is the canvas behind the phone. */
    cream: '#F7F9F5',
    /** Cards and anything raised off the screen. */
    surface: '#FFFFFF',
    stone: '#EFF3EE',

    /** Body text, and the base every muted value is an alpha of. */
    ink: '#263B32',
    /**
     * Two shades under the old #5E6E65, and the reason is measured. The old
     * value came out at 4.43 on the segmented-control track and 4.38 on the
     * pale navy card, under AA for the 14px labels that sit there, and lower
     * still in Delta and Harbor. This is the lightest value that clears 4.5 on
     * both washes in all three towns. `contrast.test.ts`.
     */
    ink60: '#58685E',
    ink45: '#64746B',
    ink26: 'rgba(38,59,50,0.26)',
    /** The hi-fi's hairline divider, one step stronger than `hairline`. */
    ink13: 'rgba(38,59,50,0.13)',
    /** Card lift. `ink26` at a small blur is a bruise; this is a shadow. */
    ink08: 'rgba(38,59,50,0.08)',

    navy: '#315B4C',
    navyDark: '#24483B',
    navy80: 'rgba(49,91,76,0.80)',
    navy60: 'rgba(49,91,76,0.60)',
    navy40: 'rgba(49,91,76,0.40)',
    navy10: 'rgba(49,91,76,0.10)',
    hairline: 'rgba(38,59,50,0.11)',

    /**
     * Text on a navy card. Cream at alpha, not ink at alpha — the muted rule
     * elsewhere in this palette inverts once the surface is dark.
     */
    creamMuted: 'rgba(248,246,241,0.70)',
    cream14: 'rgba(248,246,241,0.14)',

    terracotta: '#C4714E',
    /**
     * One step darker than it used to be, and the reason is measured.
     *
     * This is the accent's *text* colour as well as the primary button's hover
     * fill, and at #B15F3B it came out at 4.26 on cream and 3.83 on its own
     * 10% wash — both under AA for the 12.5px inline error and the stale-data
     * strip that use it. #9F5535 clears 4.5 on every ground it appears on, in
     * all three towns, and the change to the hover fill is one shade on a
     * state that was already meant to read as darker. `contrast.test.ts`.
     */
    terracottaHover: '#9F5535',
    terracottaTint: '#FFF3EC',
    terracotta10: 'rgba(196,113,78,0.10)',
    terracotta14: 'rgba(196,113,78,0.14)',

    gold: '#E7AE2E',
    gold14: 'rgba(231,174,46,0.18)',
    goldText: '#8A6510',

    /**
     * Nudged 4% darker, so the verified pill clears AA.
     *
     * Sage's most common appearance is its own name on its own 18% tint, and
     * at #4C6B4B that composite was 4.34 in Russellville and 3.85 in Delta —
     * under AA for 12px text in every town. This is the smallest change that
     * clears it everywhere, and it is imperceptible beside the old value.
     */
    sage: '#496748',
    sageLight: '#86A585',
    sage14: 'rgba(76,107,75,0.18)',

    /**
     * The one alarm register, and the only place it is ever used. A palette
     * that shouts everywhere cannot shout when it matters.
     */
    brick: '#7E1F0C',
  },

  /** 4px base scale. `space[1]` is 4px, `space[16]` is 64px. */
  space: {
    1: 4,
    2: 8,
    3: 12,
    4: 16,
    5: 20,
    6: 24,
    8: 32,
    10: 40,
    12: 48,
    16: 64,
  },

  radius: { input: 12, button: 999, chip: 999, card: 16, sheet: 20, full: 999 },

  font: {
    serif: "'Nunito Sans', system-ui, sans-serif",
    sans: "'Nunito Sans', system-ui, -apple-system, sans-serif",
    mono: "'Nunito Sans', system-ui, sans-serif",
  },

  /** Daily type scale, emitted in rem so text enlargement remains useful. */
  type: { h1: 32, h2: 22, cardTitle: 18, body: 16, label: 14, caption: 14, eyebrow: 12 },

  /**
   * Five steps, each naming a distance from the page rather than a mood.
   *
   * Elevation was being hand-rolled per component, and a shadow picked to look
   * right beside the last one is how a system stops being a system. Every
   * shadow is ink at alpha, never black: black over warm cream reads as a
   * bruise. `navy` is the exception and it earns it, because a neutral shadow
   * under the one dark card on a screen goes grey and dirty, so that one tints
   * with the card it falls from.
   *
   * These are CSS values rather than numbers, because a shadow is a whole
   * shorthand and splitting it into offsets nobody would set individually buys
   * nothing. They reference other tokens, so a town reskin moves them too.
   */
  shadow: {
    /** A card resting on the page. Directory rows, article rows, list items. */
    flat: '0 1px 2px var(--ts-ink08)',
    /** The hover state of a flat card, and the resting state of anything tappable that stands alone. */
    raised: '0 1px 2px var(--ts-ink08), 0 6px 16px -8px var(--ts-ink26)',
    /** A card that has been picked up: dragged, expanded, or the lead story. */
    lifted: '0 2px 4px var(--ts-ink08), 0 14px 30px -14px var(--ts-ink26)',
    /**
     * Sheets, dialogs, menus. The only step with a long, soft second layer.
     *
     * That second layer needs ink at 34%, which is not a step on the ramp and
     * does not deserve to become one. `color-mix` from `--ts-ink` rather than a
     * literal, so a town that warms or cools its ink takes its overlay shadow
     * with it. The hi-fi sheet writes this one as a raw rgba, and that is the
     * single value in it that would not survive a reskin.
     */
    overlay:
      '0 8px 12px -6px var(--ts-ink08), 0 28px 60px -20px color-mix(in srgb, var(--ts-ink) 34%, transparent)',
    navy: '0 2px 4px var(--ts-ink08), 0 16px 30px -16px var(--ts-navy80)',
  },

  /**
   * Two curves and four durations, and that is the whole vocabulary.
   *
   * `ease` is the general one: quick out of the gate, settled at the end.
   * `easeOut` overshoots nothing but decelerates hard, which is what a sheet
   * rising 400px needs and what a 90ms colour change does not.
   *
   * The durations are named by rank rather than by milliseconds, so a town
   * that wants a calmer app can slow all four without every component being
   * edited, and so nobody writes `220ms` because it felt about right.
   */
  motion: {
    ease: 'cubic-bezier(0.2, 0, 0, 1)',
    easeOut: 'cubic-bezier(0.16, 1, 0.3, 1)',
    /** 90ms. A press responding. Below this a transition reads as a glitch. */
    dur1: '90ms',
    /** 160ms. Something leaving, a modal arriving, a route change. */
    dur2: '160ms',
    /** 260ms. Something arriving that you did not ask to see. */
    dur3: '260ms',
    /** 420ms. Full-height travel, and the determinate progress fill. */
    dur4: '420ms',
  },

  /**
   * The focus ring, as one value, because it is one decision.
   *
   * 2px of the page colour then 2px of terracotta. The halo is what keeps the
   * ring from fusing with whatever is behind it, and it does its real work on
   * navy; on white it is nearly invisible, which is fine because the terracotta
   * is carrying it there. Drawn as a box-shadow so it never changes layout, and
   * never animated. On a dark card the halo has to become the card colour
   * instead, which the shell does by redefining this variable on that scope, so
   * a component still just says `box-shadow: var(--ts-focus)`.
   */
  focus: '0 0 0 2px var(--ts-cream), 0 0 0 4px var(--ts-action)',

  /**
   * Roles, not colours. The layer above the palette.
   *
   * A component that asks for terracotta when it means "the one thing on this
   * screen a finger is meant to press" is describing a colour, and that works
   * exactly as long as the palette and the roles line up. They already do not:
   * Harbor's action colour is a teal, and it is still called terracotta in
   * every creation in that town, so a builder reading the token list has to
   * know the lore to understand why.
   *
   * Every one of these is a pure alias on day one, so the visual diff is zero.
   * The cost is real but small and it is documentation rather than
   * engineering: for a while both `--ts-terracotta` and `--ts-action` are
   * valid and a builder has to be told which to prefer. That is a smaller tax
   * than the lore tax above.
   *
   * The raw tokens are **not** deprecated and are not scheduled for removal.
   * They are the physical palette and reaching at it directly is legitimate:
   * `--ts-terracotta14` behind a hover is a wash, not a role. This layer sits
   * beside them, not on top of them.
   *
   * These emit as `var()` references rather than resolved values on purpose,
   * so a town that overrides `--ts-terracotta` moves `--ts-action` with it and
   * a town that wants a different action colour from its structural colour can
   * override `--ts-action` alone. That is the thing roles buy that a palette
   * cannot express.
   */
  semantic: {
    /** The one thing on this screen a finger is meant to press. */
    action: 'var(--ts-navy)',
    /** Pressed and hovered states of the above. */
    actionHover: 'var(--ts-navy-dark)',
    /** The wash behind a selected chip or an active tab. */
    actionQuiet: 'var(--ts-navy10)',
    /** The town speaking: notices, closures, official postings. */
    civic: 'var(--ts-gold)',
    /** Civic copy that has to pass on a light wash. Raw gold is unreadable. */
    civicText: 'var(--ts-gold-text)',
    /** Vouched, open, alive. Never a brand accent. */
    verified: 'var(--ts-sage)',
    /** An actual emergency. Never a validation error. */
    alarm: 'var(--ts-brick)',
    /** Text that recedes: bylines, counts, timestamps. */
    quiet: 'var(--ts-ink60)',
    /** Chrome, dark cards, the frame around the town. */
    structure: 'var(--ts-navy)',
  },

  /**
   * Density, as an override rather than a second component.
   *
   * A row reads `var(--ts-row-y, var(--ts-space-4))`, so it is correct with
   * nothing set and denser when a container asks for it. Shipping a compact
   * variant of a row instead is how a design system starts to rot: two
   * components that must stay in sync forever, and they will not.
   *
   * Two consequences worth naming. The tap target still floors at 44px, so
   * compact buys vertical space and never accessibility. And a creation inside
   * a compact container inherits the density too, which is how a
   * resident-built list stops looking foreign beside the directory.
   *
   * These are the comfortable defaults. `Row` in `apps/web/src/ui` reads them
   * with these same values as CSS fallbacks, so the tokens are documentation
   * of the default rather than a thing that must be set.
   */
  density: {
    rowY: '16px',
    /**
     * The row's inline gutter.
     *
     * Exposed for the same reason `rowY` is, and found the same way: an
     * unframed list inside a padded screen double-pads, so its rows sat 16px
     * right of the heading they belonged under, and every headline in the news
     * feed was out of line with its own section label. Measured, not noticed.
     *
     * Dropping the padding whenever `framed` is false would have been the
     * quick fix and the wrong one — "this list draws no surface" and "this
     * list has no gutter" are two different claims, and a screen inside a
     * padded container needs to make the second one without giving up the
     * first. A variable lets it say which it means.
     */
    rowX: '16px',
    rowGap: '12px',
    /** The leading block, fixed, so every title in a list starts on one x. */
    rowLead: '44px',
    rowTitle: '17px',
  },
} as const

export type Tokens = typeof tokens

/**
 * Flatten to the `--ts-*` custom properties a creation sees.
 */
export function cssVariables(t: Tokens = tokens): Record<string, string> {
  const out: Record<string, string> = {}

  for (const [k, v] of Object.entries(t.color)) out[`--ts-${kebab(k)}`] = v
  for (const [k, v] of Object.entries(t.space)) out[`--ts-space-${k}`] = `${v}px`
  for (const [k, v] of Object.entries(t.radius)) out[`--ts-radius-${kebab(k)}`] = `${v}px`
  for (const [k, v] of Object.entries(t.type)) out[`--ts-text-${kebab(k)}`] = `${v / 16}rem`

  for (const [k, v] of Object.entries(t.shadow)) out[`--ts-shadow-${kebab(k)}`] = v

  // Roles and density both flatten straight off the key: `actionHover` gives
  // `--ts-action-hover`, `rowY` gives `--ts-row-y`. No group prefix, because
  // the role IS the name — `--ts-semantic-action` would be describing our
  // filing system to a builder who only wants the primary action colour.
  for (const [k, v] of Object.entries(t.semantic)) out[`--ts-${kebab(k)}`] = v
  for (const [k, v] of Object.entries(t.density)) out[`--ts-${kebab(k)}`] = v

  /**
   * Motion flattens by hand, because the names are not a family.
   *
   * `ease` and `ease-out` are curves, `dur-1` through `dur-4` are a ranked
   * scale, and forcing both through one mechanical rule would give
   * `--ts-motion-ease` and `--ts-motion-dur1`. The design references the short
   * names, a builder will type the short names, and names are the contract.
   */
  out['--ts-ease'] = t.motion.ease
  out['--ts-ease-out'] = t.motion.easeOut
  out['--ts-dur-1'] = t.motion.dur1
  out['--ts-dur-2'] = t.motion.dur2
  out['--ts-dur-3'] = t.motion.dur3
  out['--ts-dur-4'] = t.motion.dur4

  out['--ts-focus'] = t.focus

  out['--ts-font-serif'] = t.font.serif
  out['--ts-font-sans'] = t.font.sans
  out['--ts-font-mono'] = t.font.mono

  return out
}

function kebab(s: string): string {
  return s.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase()
}

/**
 * The typefaces, self-hosted.
 *
 * These are served from the *guest's own origin*, which is why `font-src 'self'`
 * is sufficient and why no creation ever has to name a font host in its
 * manifest. Pointing at Google Fonts instead would mean either every creation
 * declaring `fonts.gstatic.com` — turning a font into a permission a reviewer
 * has to think about — or a hole in the CSP for our convenience. Neither is
 * worth it for a typeface.
 *
 * `display: swap` so text is readable immediately on a slow connection. A
 * creation that renders nothing for 800ms reads as broken.
 */
export const FONT_FILES = ['newsreader', 'dm-sans', 'dm-mono-400', 'dm-mono-500', 'nunito-sans', 'libre-baskerville'] as const

export function fontFaceCss(baseHref = '/_ts/fonts'): string {
  return `
@font-face {font-family: 'Nunito Sans';src: url('${baseHref}/nunito-sans.woff2') format('woff2');font-weight: 200 1000;font-style: normal;font-display: swap;}
@font-face {font-family: 'Libre Baskerville';src: url('${baseHref}/libre-baskerville.woff2') format('woff2');font-weight: 400 700;font-style: normal;font-display: swap;}
/* Self-hosted so \`font-src 'self'\` covers them and no creation declares a font host. */
@font-face {
  font-family: 'Newsreader';
  src: url('${baseHref}/newsreader.woff2') format('woff2');
  font-weight: 400 600;
  font-style: normal;
  font-display: swap;
}
@font-face {
  font-family: 'DM Sans';
  src: url('${baseHref}/dm-sans.woff2') format('woff2');
  font-weight: 400 700;
  font-style: normal;
  font-display: swap;
}
@font-face {
  font-family: 'DM Mono';
  src: url('${baseHref}/dm-mono-400.woff2') format('woff2');
  font-weight: 400;
  font-style: normal;
  font-display: swap;
}
@font-face {
  font-family: 'DM Mono';
  src: url('${baseHref}/dm-mono-500.woff2') format('woff2');
  font-weight: 500;
  font-style: normal;
  font-display: swap;
}
`.trim()
}

/**
 * The stylesheet injected into a creation's frame.
 *
 * Deliberately only sets variables, the typefaces, and a minimal overridable
 * base. A creation owns its own look; we supply the palette, not the layout.
 * Anything more opinionated here would fight the builder rather than help them.
 */
export function guestThemeCss(t: Tokens = tokens, fontsHref = '/_ts/fonts'): string {
  const vars = Object.entries(cssVariables(t))
    .map(([k, v]) => `  ${k}: ${v};`)
    .join('\n')

  return `${fontFaceCss(fontsHref)}

:root {
${vars}
}

/* Base, all overridable. A creation owns its own look. */
html, body {
  margin: 0;
  padding: 0;
  background: var(--ts-cream);
  color: var(--ts-ink);
  font-family: var(--ts-font-sans);
  font-size: var(--ts-text-body);
  line-height: 1.5;
  -webkit-text-size-adjust: 100%;
  -webkit-font-smoothing: antialiased;
}
h1, h2, h3 { font-family: var(--ts-font-serif); font-weight: 600; letter-spacing: -0.01em; }
a { color: var(--ts-navy); }
a:hover { color: var(--ts-terracotta); }
*, *::before, *::after { box-sizing: border-box; }
`
}

/**
 * The theming seam and its contrast audit, re-exported so a consumer only ever
 * imports `@townsquare/tokens`.
 *
 * At the bottom, and deliberately: `towns.ts` imports `tokens` from this file.
 * Nothing in it touches `tokens` at module scope, so the cycle resolves, but
 * moving these lines to the top would make that a matter of luck rather than
 * of structure.
 */
export {
  DELTA,
  HARBOR,
  RUSSELLVILLE,
  TOWNS,
  townCss,
  townTokens,
  type Town,
  type TownId,
} from './towns.js'
export {
  PAIRS,
  auditContrast,
  contrastRatio,
  formatAudit,
  luminance,
  measure,
  over,
  parseColor,
  type Pair,
  type PairKind,
  type Result,
} from './contrast.js'
