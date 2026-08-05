/**
 * Contrast, as a property of the token set rather than of a design review.
 *
 * The reason this is a test and not a checklist: a bad token value reaches
 * every creation in town, not just our screens. Fifty independently built
 * mini-apps inherit `--ts-navy`, and not one of their authors is going to
 * check it against the text they put on top. A design review catches a bad
 * value once, in a room, with people who will not be here in six months. A
 * test catches it the day a town reskins itself, with nobody from this project
 * present, which is the case that actually matters.
 *
 * Two things this deliberately does not do. It does not check taste: a town
 * can pass every ratio here and still look like a parking ticket, and the tool
 * says readable, not good. And it does not check a creation's own CSS, because
 * a builder can hardcode a colour and nothing we do here will stop them.
 */

import { tokens, type Tokens } from './index.js'

/* ── colour ─────────────────────────────────────────────────────────────── */

interface Rgba {
  r: number
  g: number
  b: number
  a: number
}

/**
 * Parse the two forms the palette actually uses: `#RRGGBB` and `rgba(r,g,b,a)`.
 *
 * Anything else throws rather than returning black, because a silently black
 * colour would compute a plausible ratio and pass, which is the one failure
 * mode a contrast checker must not have.
 */
export function parseColor(value: string): Rgba {
  const v = value.trim()

  const hex = /^#([0-9a-f]{6})$/i.exec(v)
  if (hex) {
    const n = Number.parseInt(hex[1]!, 16)
    return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255, a: 1 }
  }

  const rgba = /^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*(?:,\s*([\d.]+)\s*)?\)$/i.exec(v)
  if (rgba) {
    return {
      r: Number(rgba[1]),
      g: Number(rgba[2]),
      b: Number(rgba[3]),
      a: rgba[4] === undefined ? 1 : Number(rgba[4]),
    }
  }

  throw new Error(`cannot parse colour: ${value}`)
}

/**
 * Lay a colour over what is behind it.
 *
 * Every muted value in this palette is an alpha, so almost nothing is checked
 * against its own token value. `--ts-ink60` on cream is not "ink60 versus
 * cream", it is the composite of the two, and checking the raw value instead
 * would report a ratio that appears nowhere on screen.
 */
export function over(fg: Rgba, bg: Rgba): Rgba {
  return {
    r: fg.a * fg.r + (1 - fg.a) * bg.r,
    g: fg.a * fg.g + (1 - fg.a) * bg.g,
    b: fg.a * fg.b + (1 - fg.a) * bg.b,
    a: 1,
  }
}

/** WCAG 2.1 relative luminance. */
export function luminance(c: Rgba): number {
  const f = (channel: number) => {
    const s = channel / 255
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b)
}

export function contrastRatio(fg: Rgba, bg: Rgba): number {
  const a = luminance(fg)
  const b = luminance(bg)
  const [hi, lo] = a > b ? [a, b] : [b, a]
  return (hi + 0.05) / (lo + 0.05)
}

/* ── the pairs that actually ship ───────────────────────────────────────── */

type ColorKey = keyof Tokens['color']

/**
 * `min` is the ratio this pair must hold, and it is chosen per pair rather
 * than from one blanket number, because the pairs do different jobs.
 *
 * - `body` is reading copy at 17px. WCAG AA is 4.5.
 * - `large` is 21px and up, or the 15px semibold on a button, which WCAG
 *   treats as large. AA is 3.
 * - `ui` is a border, a ring or a fill boundary. AA is 3.
 * - `waived` is a pair that does not meet its bar, is shipping anyway, and has
 *   a written rule constraining where it may appear. The number on a waived
 *   pair is a **regression floor**, not a pass: it is there so a reskin cannot
 *   quietly make a known-marginal pair worse.
 *
 * The three waivers are the same three the design sheet documents, and they
 * are the honest part of this file. Pretending they pass would be worse than
 * the failure.
 */
export type PairKind = 'body' | 'large' | 'ui' | 'waived'

export interface Pair {
  fg: ColorKey
  /** The stack the foreground sits on, nearest surface last. */
  bg: ColorKey[]
  kind: PairKind
  min: number
  use: string
  /** Required on a waiver: the rule that makes shipping it defensible. */
  rule?: string
}

export const PAIRS: readonly Pair[] = [
  { fg: 'ink', bg: ['cream'], kind: 'body', min: 7, use: 'body copy on the screen' },
  { fg: 'ink', bg: ['surface'], kind: 'body', min: 7, use: 'body copy on a card' },
  { fg: 'ink', bg: ['stone'], kind: 'body', min: 4.5, use: 'a label on an inert fill' },

  {
    fg: 'ink60',
    bg: ['cream'],
    kind: 'waived',
    min: 4.3,
    use: 'ancillary secondary text',
    rule: 'Misses AA at 17px by a hair. Secondary lines that carry real information, a byline or an address, are set at --ts-ink. Only truly ancillary copy uses this.',
  },
  {
    fg: 'ink60',
    bg: ['surface'],
    kind: 'waived',
    min: 4.3,
    use: 'ancillary secondary text on a card',
    rule: 'Same rule as on cream: a byline or an address is set at --ts-ink, and this is only for copy that could be removed without losing anything.',
  },
  {
    fg: 'ink45',
    bg: ['cream'],
    kind: 'waived',
    min: 2.7,
    use: 'eyebrows and metadata',
    rule: 'Never body copy. Only 11px uppercase tracked labels, and never the only carrier of meaning.',
  },

  { fg: 'cream', bg: ['navy'], kind: 'body', min: 7, use: 'text on the one dark card' },
  { fg: 'creamMuted', bg: ['navyDark'], kind: 'body', min: 4.5, use: 'secondary text on a dark card' },
  { fg: 'cream', bg: ['ink'], kind: 'body', min: 7, use: 'toast text' },
  { fg: 'cream', bg: ['brick'], kind: 'body', min: 7, use: 'the emergency pill, the one alarm' },

  {
    fg: 'surface',
    bg: ['terracotta'],
    kind: 'large',
    min: 3,
    use: 'the primary button label',
    rule: 'Terracotta is a fill colour, not a text colour. The label is 15px semibold, which WCAG treats as large. Terracotta as small body text is banned.',
  },
  { fg: 'terracottaHover', bg: ['cream'], kind: 'body', min: 4.5, use: 'the quiet text action, and inline errors' },
  { fg: 'terracottaHover', bg: ['surface'], kind: 'body', min: 4.5, use: 'the quiet text action on a card' },
  { fg: 'terracottaHover', bg: ['terracotta10', 'cream'], kind: 'body', min: 4.5, use: 'the stale strip and the failed-action message' },

  { fg: 'sage', bg: ['cream'], kind: 'body', min: 4.5, use: 'open now, verified, available' },
  { fg: 'sage', bg: ['sage14', 'cream'], kind: 'body', min: 4.5, use: 'the verified pill' },
  {
    fg: 'goldText',
    bg: ['gold14', 'cream'],
    kind: 'waived',
    min: 4.3,
    use: 'civic copy on the notice wash',
    rule: 'The notice card is one card per screen and most days is not rendered at all. Its title is 18px serif, which clears the large-text bar; only the 13.5px meta line sits under AA, and it repeats what the title already said.',
  },

  { fg: 'ink60', bg: ['stone'], kind: 'large', min: 3, use: 'the pending-review pill' },

  // Non-text. A ring or a border still has to be findable.
  { fg: 'terracotta', bg: ['cream'], kind: 'ui', min: 3, use: 'the focus ring against the page' },
  { fg: 'terracotta', bg: ['surface'], kind: 'ui', min: 3, use: 'the focus ring against a card' },
  { fg: 'navy', bg: ['cream'], kind: 'ui', min: 3, use: 'a selected filter chip against the page' },
  { fg: 'ink26', bg: ['surface'], kind: 'ui', min: 1.4, use: 'an unchecked control border' },
]

/* ── the audit ──────────────────────────────────────────────────────────── */

export interface Result extends Pair {
  ratio: number
  passes: boolean
}

/** Resolve a token, composite it down its stack, and measure. */
export function measure(pair: Pair, t: Tokens = tokens): number {
  const stack = pair.bg.map((k) => parseColor(t.color[k]))
  // The furthest surface must be opaque or there is nothing to composite onto.
  let bg = stack[stack.length - 1]!
  for (let i = stack.length - 2; i >= 0; i--) bg = over(stack[i]!, bg)
  const fg = over(parseColor(t.color[pair.fg]), bg)
  return contrastRatio(fg, bg)
}

export function auditContrast(t: Tokens = tokens, pairs: readonly Pair[] = PAIRS): Result[] {
  return pairs.map((pair) => {
    const ratio = measure(pair, t)
    return { ...pair, ratio, passes: ratio + 1e-9 >= pair.min }
  })
}

/** A readable report, for a person reskinning a town who wants to see why. */
export function formatAudit(results: readonly Result[]): string {
  return results
    .map((r) => {
      const mark = r.passes ? 'ok  ' : 'FAIL'
      const name = `${r.fg} on ${r.bg.join(' over ')}`
      return `${mark} ${r.ratio.toFixed(2).padStart(6)}  min ${String(r.min).padStart(4)}  ${r.kind.padEnd(6)} ${name} — ${r.use}`
    })
    .join('\n')
}
