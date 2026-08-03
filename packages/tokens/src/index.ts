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
 * Palette carried forward from the approved brand in `brand/`.
 */

export const tokens = {
  color: {
    cream: '#FAF8F5',
    surface: '#FFFDFB',
    stone: '#E8E4DF',

    navy: '#2C3E50',
    navy80: 'rgba(44,62,80,0.80)',
    navy60: 'rgba(44,62,80,0.60)',
    navy40: 'rgba(44,62,80,0.40)',
    hairline: 'rgba(44,62,80,0.085)',

    terracotta: '#C4775A',
    terracottaHover: '#A66147',
    terracotta10: 'rgba(196,119,90,0.10)',
    terracotta14: 'rgba(196,119,90,0.14)',

    gold: '#D4A853',
    gold14: 'rgba(212,168,83,0.18)',
    goldText: '#8A6A1E',

    sage: '#7D9B76',
    sage14: 'rgba(125,155,118,0.18)',
    brick: '#C0563E',
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

  radius: { input: 8, button: 8, chip: 999, card: 12, sheet: 16, full: 999 },

  font: {
    serif: "'Libre Baskerville', Georgia, serif",
    sans: "Inter, system-ui, -apple-system, sans-serif",
  },

  type: { h1: 32, h2: 26, cardTitle: 18, body: 16, label: 14, caption: 12, eyebrow: 11 },
} as const

export type Tokens = typeof tokens

/**
 * Flatten to the `--ts-*` custom properties a creation sees.
 *
 * Names are part of the contract: a creation that styles itself with
 * `var(--ts-navy)` must keep working when a town changes its palette, and must
 * not break when we add tokens. Renaming one of these is an SDK 1 break.
 */
export function cssVariables(t: Tokens = tokens): Record<string, string> {
  const out: Record<string, string> = {}

  for (const [k, v] of Object.entries(t.color)) out[`--ts-${kebab(k)}`] = v
  for (const [k, v] of Object.entries(t.space)) out[`--ts-space-${k}`] = `${v}px`
  for (const [k, v] of Object.entries(t.radius)) out[`--ts-radius-${kebab(k)}`] = `${v}px`
  for (const [k, v] of Object.entries(t.type)) out[`--ts-text-${kebab(k)}`] = `${v}px`

  out['--ts-font-serif'] = t.font.serif
  out['--ts-font-sans'] = t.font.sans

  return out
}

function kebab(s: string): string {
  return s.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase()
}

/**
 * The stylesheet injected into a creation's frame.
 *
 * Deliberately only sets variables plus a minimal, overridable base. A creation
 * owns its own look; we supply the palette, not the layout. Anything more
 * opinionated here would fight the builder rather than help them.
 */
export function guestThemeCss(t: Tokens = tokens): string {
  const vars = Object.entries(cssVariables(t))
    .map(([k, v]) => `  ${k}: ${v};`)
    .join('\n')

  return `:root {\n${vars}\n}

/* Base, all overridable. A creation owns its own look. */
html, body {
  margin: 0;
  padding: 0;
  background: var(--ts-cream);
  color: var(--ts-navy);
  font-family: var(--ts-font-sans);
  font-size: var(--ts-text-body);
  line-height: 1.5;
  -webkit-text-size-adjust: 100%;
}
h1, h2, h3 { font-family: var(--ts-font-serif); font-weight: 600; }
a { color: var(--ts-terracotta); }
*, *::before, *::after { box-sizing: border-box; }
`
}
