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
 * `design/hifi/`, which is the visual source of truth for app UI. The base
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
 * **Muted text is ink at alpha, not navy at alpha.** The hi-fi is consistent
 * about this and it is the difference between text that recedes and text that
 * looks like a faded link. `navy60` and friends still exist, and still mean
 * navy, because they are named navy.
 */

export const tokens = {
  color: {
    /** The screen. Not `#EDE9E0` — that is the canvas behind the phone. */
    cream: '#F8F6F1',
    /** Cards and anything raised off the screen. */
    surface: '#FFFFFF',
    stone: '#E5E1DA',

    /** Body text, and the base every muted value is an alpha of. */
    ink: '#1D1B16',
    ink60: 'rgba(29,27,22,0.60)',
    ink45: 'rgba(29,27,22,0.45)',
    ink26: 'rgba(29,27,22,0.26)',
    /** The hi-fi's hairline divider, one step stronger than `hairline`. */
    ink13: 'rgba(29,27,22,0.13)',
    /** Card lift. `ink26` at a small blur is a bruise; this is a shadow. */
    ink08: 'rgba(29,27,22,0.08)',

    navy: '#26405B',
    navyDark: '#22384E',
    navy80: 'rgba(38,64,91,0.80)',
    navy60: 'rgba(38,64,91,0.60)',
    navy40: 'rgba(38,64,91,0.40)',
    navy10: 'rgba(38,64,91,0.10)',
    hairline: 'rgba(29,27,22,0.11)',

    /**
     * Text on a navy card. Cream at alpha, not ink at alpha — the muted rule
     * elsewhere in this palette inverts once the surface is dark.
     */
    creamMuted: 'rgba(248,246,241,0.70)',
    cream14: 'rgba(248,246,241,0.14)',

    terracotta: '#C4714E',
    terracottaHover: '#B15F3B',
    terracottaTint: '#FFF3EC',
    terracotta10: 'rgba(196,113,78,0.10)',
    terracotta14: 'rgba(196,113,78,0.14)',

    gold: '#E7AE2E',
    gold14: 'rgba(231,174,46,0.18)',
    goldText: '#8A6510',

    sage: '#4C6B4B',
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

  radius: { input: 10, button: 10, chip: 999, card: 16, sheet: 20, full: 999 },

  font: {
    serif: "'Newsreader', Georgia, 'Times New Roman', serif",
    sans: "'DM Sans', system-ui, -apple-system, sans-serif",
    mono: "'DM Mono', ui-monospace, SFMono-Regular, Menlo, monospace",
  },

  /** 17px body, from the hi-fi. Larger than the web default, and deliberately. */
  type: { h1: 24, h2: 21, cardTitle: 18, body: 17, label: 15, caption: 13, eyebrow: 11 },
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
  for (const [k, v] of Object.entries(t.type)) out[`--ts-text-${kebab(k)}`] = `${v}px`

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
export const FONT_FILES = ['newsreader', 'dm-sans', 'dm-mono-400', 'dm-mono-500'] as const

export function fontFaceCss(baseHref = '/_ts/fonts'): string {
  return `
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
