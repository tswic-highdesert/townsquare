import { describe, expect, it } from 'vitest'
import {
  PAIRS,
  auditContrast,
  contrastRatio,
  formatAudit,
  luminance,
  measure,
  over,
  parseColor,
} from './contrast.js'
import { tokens } from './index.js'
import { TOWNS, townTokens } from './towns.js'

describe('the colour maths', () => {
  it('parses both forms the palette uses', () => {
    expect(parseColor('#FFFFFF')).toEqual({ r: 255, g: 255, b: 255, a: 1 })
    expect(parseColor('rgba(29,27,22,0.60)')).toEqual({ r: 29, g: 27, b: 22, a: 0.6 })
  })

  /**
   * A parser that returned black on a value it did not understand would compute
   * a plausible ratio and pass, which is the one failure mode a contrast
   * checker must not have.
   */
  it('throws on anything it does not understand rather than guessing', () => {
    expect(() => parseColor('rebeccapurple')).toThrow()
    expect(() => parseColor('var(--ts-navy)')).toThrow()
    expect(() => parseColor('#fff')).toThrow()
  })

  it('agrees with the WCAG reference values', () => {
    const white = parseColor('#FFFFFF')
    const black = parseColor('#000000')
    expect(luminance(white)).toBeCloseTo(1, 5)
    expect(luminance(black)).toBeCloseTo(0, 5)
    expect(contrastRatio(black, white)).toBeCloseTo(21, 5)
    expect(contrastRatio(white, white)).toBeCloseTo(1, 5)
  })

  /**
   * Almost nothing in this palette is checked against its own token value.
   * Every muted value is an alpha, so `--ts-ink60` on cream is the composite
   * of the two; measuring the raw value would report a ratio that appears
   * nowhere on screen.
   */
  it('composites alpha over its ground before measuring', () => {
    const ink60 = parseColor(tokens.color.ink60)
    const cream = parseColor(tokens.color.cream)
    const flat = over(ink60, cream)
    expect(flat.a).toBe(1)
    // Lighter than the ink it came from, because most of the cream shows through.
    expect(luminance(flat)).toBeGreaterThan(luminance(parseColor(tokens.color.ink)))
    expect(contrastRatio(flat, cream)).toBeLessThan(contrastRatio(parseColor(tokens.color.ink), cream))
  })

  it('composites a stack, so a tint over cream is measured as what you see', () => {
    const onTint = measure({
      fg: 'goldText',
      bg: ['gold14', 'cream'],
      kind: 'body',
      min: 0,
      use: 'test',
    })
    const onCream = measure({ fg: 'goldText', bg: ['cream'], kind: 'body', min: 0, use: 'test' })
    expect(onTint).not.toBeCloseTo(onCream, 2)
  })
})

/**
 * The test this file exists for.
 *
 * A bad token value reaches every creation in town, not just our screens.
 * Fifty independently built mini-apps inherit `--ts-navy` and none of their
 * authors will check it against the text they put on top, so contrast has to
 * be a property of the token set rather than of a design review somebody held
 * once. Running it across all three towns is what turns the seam from a claim
 * into a checked property.
 */
describe.each(TOWNS.map((t) => [t.name, t] as const))('contrast in %s', (_name, town) => {
  const results = auditContrast(townTokens(town))

  it('holds every pair that ships', () => {
    const failing = results.filter((r) => !r.passes)
    expect(failing.length, `\n${formatAudit(failing)}\n`).toBe(0)
  })

  it('meets AA properly wherever the pair is body copy', () => {
    for (const r of results.filter((r) => r.kind === 'body')) {
      expect(r.ratio, `${r.fg} on ${r.bg.join(' over ')} (${r.use})`).toBeGreaterThanOrEqual(4.5)
    }
  })

  it('meets the large-text and non-text bar of 3 where that is the right bar', () => {
    for (const r of results.filter((r) => r.kind === 'large' || r.kind === 'ui')) {
      // `ui` pairs below 3 are borders on inert controls, and carry their own
      // floor in the table rather than this one.
      if (r.min >= 3) expect(r.ratio, `${r.fg} on ${r.bg.join(' over ')}`).toBeGreaterThanOrEqual(3)
    }
  })

  it('keeps body copy at AAA on the two grounds it is actually read on', () => {
    const onCream = results.find((r) => r.fg === 'ink' && r.bg[0] === 'cream')!
    const onSurface = results.find((r) => r.fg === 'ink' && r.bg[0] === 'surface')!
    expect(onCream.ratio).toBeGreaterThanOrEqual(7)
    expect(onSurface.ratio).toBeGreaterThanOrEqual(7)
  })
})

describe('the waivers', () => {
  /**
   * A waiver is a pair that does not meet its bar, ships anyway, and has a
   * written rule constraining where it may appear. The number on it is a
   * regression floor, not a pass. Requiring the rule is what stops a waiver
   * being used to silence an inconvenient failure.
   */
  it('never waives a pair without a written rule', () => {
    for (const p of PAIRS.filter((p) => p.kind === 'waived')) {
      expect(p.rule, `${p.fg} on ${p.bg.join(' over ')} is waived with no rule`).toBeTruthy()
      expect(p.rule!.length).toBeGreaterThan(40)
    }
  })

  it('is only three pairs, and they are the three the design documents', () => {
    const waived = PAIRS.filter((p) => p.kind === 'waived').map((p) => `${p.fg}/${p.bg[0]}`)
    expect(waived.sort()).toEqual(
      ['goldText/gold14', 'ink45/cream', 'ink60/cream', 'ink60/surface'].sort(),
    )
  })

  it('keeps every waived pair above its floor in every town', () => {
    for (const town of TOWNS) {
      for (const r of auditContrast(townTokens(town)).filter((r) => r.kind === 'waived')) {
        expect(r.ratio, `${r.fg} in ${town.name} slipped below its floor`).toBeGreaterThanOrEqual(r.min)
      }
    }
  })
})
