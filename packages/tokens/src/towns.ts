/**
 * The multi-town theming seam, as data rather than as a claim.
 *
 * Three towns, one component set, zero component changes. Values move, names
 * never do — which is the whole contract, and until something actually renders
 * a second town it is a promise nobody has tested.
 *
 * A town overrides fifteen values at most. Everything else is the product, and
 * forking the product is how you lose the product: a town that also changes
 * the spacing scale, the radii and the type ramp has not reskinned Town
 * Square, it has made a different app that shares a repo.
 *
 * Palettes are from `design/hifi-v2/foundation.css`.
 */

import { tokens, type Tokens } from './index.js'

export type TownId = 'russellville' | 'delta' | 'harbor'

/**
 * What a town is allowed to move.
 *
 * Deliberately typed as a partial of the colour set plus the serif, so a town
 * physically cannot reach the spacing scale or the type ramp. The seam is
 * narrow because a wide one stops being a seam.
 */
export interface Town {
  id: TownId
  name: string
  /**
   * Keys are constrained to the palette, values are not.
   *
   * `Tokens` is `as const`, so `Partial<Tokens['color']>` would demand a town
   * assign the *same literal* Russellville uses, which is every value and no
   * town. Widening the value to `string` while pinning the key is the actual
   * contract: a town may move any colour and may invent none.
   */
  color: Partial<Record<keyof Tokens['color'], string>>
  font?: Partial<Record<keyof Tokens['font'], string>>
}

/** The default. Named rather than implicit, so all three read the same way. */
export const RUSSELLVILLE: Town = {
  id: 'russellville',
  name: 'Russellville',
  color: {},
}

/**
 * A river-delta town: navy goes green, terracotta goes earthier.
 *
 * Fifteen values. Note `--ts-sage` moves too, and it has to: sage sits beside
 * the new navy constantly and the original would read as a second, muddier
 * green.
 */
export const DELTA: Town = {
  id: 'delta',
  name: 'Delta',
  color: {
    navy: '#2F4739',
    navyDark: '#263B2F',
    navy80: 'rgba(47,71,57,0.80)',
    navy60: 'rgba(47,71,57,0.60)',
    navy40: 'rgba(47,71,57,0.40)',
    navy10: 'rgba(47,71,57,0.10)',
    terracotta: '#A8642F',
    terracottaHover: '#8D5124',
    terracottaTint: '#FDF1E6',
    terracotta10: 'rgba(168,100,47,0.10)',
    terracotta14: 'rgba(168,100,47,0.14)',
    cream: '#F7F5EE',
    gold: '#CF9A2C',
    // Darkened with the base sage, for the same reason: the verified pill
    // sets sage on its own 18% tint and the original missed AA here too.
    sage: '#526648',
  },
  font: { serif: "'Newsreader', Georgia, serif" },
}

/**
 * A coastal town whose action colour is a teal.
 *
 * This is the town that makes the case for the semantic layer on its own: the
 * action colour here is `#3D7D8C`, and without `--ts-action` every creation in
 * Harbor is asking for a token called `terracotta` and getting blue-green.
 */
export const HARBOR: Town = {
  id: 'harbor',
  name: 'Harbor',
  color: {
    navy: '#1F3B57',
    navyDark: '#17304A',
    navy80: 'rgba(31,59,87,0.80)',
    navy60: 'rgba(31,59,87,0.60)',
    navy40: 'rgba(31,59,87,0.40)',
    navy10: 'rgba(31,59,87,0.10)',
    terracotta: '#3D7D8C',
    terracottaHover: '#316875',
    terracottaTint: '#EAF5F7',
    terracotta10: 'rgba(61,125,140,0.10)',
    terracotta14: 'rgba(61,125,140,0.14)',
    cream: '#F4F6F6',
    gold: '#D9A441',
    sage: '#3F675F',
  },
}

export const TOWNS: readonly Town[] = [RUSSELLVILLE, DELTA, HARBOR]

/** The whole token set as a town resolves it. */
export function townTokens(town: Town): Tokens {
  return {
    ...tokens,
    color: { ...tokens.color, ...town.color },
    font: { ...tokens.font, ...town.font },
  } as Tokens
}

/**
 * The town blocks, as CSS.
 *
 * Emitted as `[data-town='…']` rather than as a separate stylesheet per town,
 * so switching is an attribute on any ancestor and a creation running inside
 * that ancestor is reskinned without being reloaded or even told. That is the
 * property the seam exists for.
 *
 * Only the overrides are emitted. A town block that restated the whole palette
 * would silently pin every value it copied, and the next change to the base
 * would stop reaching two of the three towns.
 */
export function townCss(towns: readonly Town[] = TOWNS): string {
  const blocks = towns
    .filter((t) => Object.keys(t.color).length > 0 || t.font)
    .map((t) => {
      const lines = [
        ...Object.entries(t.color).map(([k, v]) => `  --ts-${kebab(k)}: ${v};`),
        ...Object.entries(t.font ?? {}).map(([k, v]) => `  --ts-font-${kebab(k)}: ${v};`),
      ]
      return `[data-town='${t.id}'] {\n${lines.join('\n')}\n}`
    })

  return `/* The theming seam. Values move, names never do. */\n${blocks.join('\n\n')}\n`
}

function kebab(s: string): string {
  return s.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase()
}
