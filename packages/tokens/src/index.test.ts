import { describe, expect, it } from 'vitest'
import { cssVariables, fontFaceCss, guestThemeCss, tokens, FONT_FILES } from './index.js'

describe('the token contract', () => {
  /**
   * Pinned deliberately. A creation styling itself with `var(--ts-navy)` has to
   * keep working when a town reskins, and residents will not maintain their
   * creations — so renaming or removing one of these is an SDK 1 break, and it
   * should require editing this list on purpose. Adding is always fine.
   */
  it('never renames or removes a published variable', () => {
    const published = [
      '--ts-cream',
      '--ts-surface',
      '--ts-stone',
      '--ts-navy',
      '--ts-navy80',
      '--ts-navy60',
      '--ts-navy40',
      '--ts-hairline',
      '--ts-terracotta',
      '--ts-terracotta-hover',
      '--ts-terracotta10',
      '--ts-terracotta14',
      '--ts-gold',
      '--ts-gold14',
      '--ts-gold-text',
      '--ts-sage',
      '--ts-sage14',
      '--ts-brick',
      '--ts-space-1',
      '--ts-space-16',
      '--ts-radius-card',
      '--ts-radius-full',
      '--ts-text-body',
      '--ts-text-caption',
      '--ts-font-serif',
      '--ts-font-sans',
      // Added by hi-fi v2. Elevation, motion and the focus ring were being
      // hand-rolled per component before they had names; now that a creation
      // can say `box-shadow: var(--ts-shadow-lifted)`, they are contract too.
      '--ts-shadow-flat',
      '--ts-shadow-raised',
      '--ts-shadow-lifted',
      '--ts-shadow-overlay',
      '--ts-shadow-navy',
      '--ts-ease',
      '--ts-ease-out',
      '--ts-dur-1',
      '--ts-dur-2',
      '--ts-dur-3',
      '--ts-dur-4',
      '--ts-focus',
      // The semantic layer. Pinned the day it landed, because an alias nobody
      // pinned is an alias somebody deletes on a tidy-up, and it will be in
      // creations within the week.
      '--ts-action',
      '--ts-action-hover',
      '--ts-action-quiet',
      '--ts-civic',
      '--ts-civic-text',
      '--ts-verified',
      '--ts-alarm',
      '--ts-quiet',
      '--ts-structure',
      // Density. A container sets these; a row reads them with fallbacks.
      '--ts-row-y',
      '--ts-row-x',
      '--ts-row-gap',
      '--ts-row-lead',
      '--ts-row-title',
    ]
    const actual = cssVariables()
    for (const name of published) {
      expect(actual[name], `${name} disappeared, which breaks every creation using it`).toBeTruthy()
    }
  })

  it('emits every group as a variable, and nothing besides', () => {
    const vars = cssVariables()
    const counted =
      Object.keys(tokens.color).length +
      Object.keys(tokens.space).length +
      Object.keys(tokens.radius).length +
      Object.keys(tokens.type).length +
      Object.keys(tokens.font).length +
      Object.keys(tokens.shadow).length +
      Object.keys(tokens.motion).length +
      Object.keys(tokens.semantic).length +
      Object.keys(tokens.density).length +
      1 // focus, which is one value rather than a group
    expect(Object.keys(vars).length).toBe(counted)
  })

  /**
   * The whole point of the semantic layer is that it is an alias, not a copy.
   *
   * A resolved hex here would look identical on day one and then quietly stop
   * following the town the first time somebody overrode `--ts-terracotta`,
   * which is the exact failure the layer exists to prevent.
   */
  it('keeps semantic tokens as references, so a reskin moves them too', () => {
    const vars = cssVariables()
    expect(vars['--ts-action']).toBe('var(--ts-navy)')
    expect(vars['--ts-verified']).toBe('var(--ts-sage)')
    expect(vars['--ts-alarm']).toBe('var(--ts-brick)')
    for (const [name, value] of Object.entries(tokens.semantic)) {
      expect(value, `${name} resolved a value instead of aliasing one`).toMatch(/^var\(--ts-[a-z0-9-]+\)$/)
    }
  })

  /**
   * Every semantic name must point at a token that actually exists. An alias
   * to a typo resolves to nothing and the component silently loses its colour.
   */
  it('never aliases a token that does not exist', () => {
    const vars = cssVariables()
    for (const [name, value] of Object.entries(tokens.semantic)) {
      const target = value.slice('var('.length, -1)
      expect(vars[target], `--ts-${name} points at ${target}, which is not published`).toBeTruthy()
    }
  })

  /**
   * The short motion names are the ones the design and every builder will
   * type. A mechanical flattening would have produced `--ts-motion-dur1`, and
   * this is the test that catches somebody tidying the emitter later.
   */
  it('emits motion under its short names, not under a motion- prefix', () => {
    const vars = cssVariables()
    expect(vars['--ts-dur-3']).toBe('260ms')
    expect(vars['--ts-ease-out']).toContain('cubic-bezier')
    expect(vars['--ts-motion-dur1']).toBeUndefined()
  })

  /**
   * Elevation that resolves to a literal colour is elevation that stops
   * matching the town it sits in. Every shadow is ink or navy at alpha,
   * referenced by name.
   */
  it('builds every shadow out of other tokens, never a literal colour', () => {
    for (const [name, value] of Object.entries(tokens.shadow)) {
      expect(value, `${name} has a raw hex`).not.toMatch(/#[0-9a-f]{3,8}/i)
      expect(value, `${name} has a raw rgb()`).not.toMatch(/\brgba?\(/)
      expect(value, `${name} references no token`).toContain('var(--ts-')
    }
  })

  it('gives every variable the --ts- prefix, which is the namespace guests trust', () => {
    for (const name of Object.keys(cssVariables())) {
      expect(name.startsWith('--ts-'), name).toBe(true)
    }
  })
})

describe('the approved Daily palette', () => {
  it('uses the app surface, not the canvas behind the phone', () => {
    // #EDE9E0 is the body of the design document. #F7F9F5 is the screen.
    expect(tokens.color.cream).toBe('#F7F9F5')
    expect(tokens.color.cream).not.toBe('#EDE9E0')
  })

  it('carries the Daily hues and retains legacy accent tokens', () => {
    expect(tokens.color.navy).toBe('#315B4C')
    expect(tokens.color.terracotta).toBe('#C4714E')
    expect(tokens.color.ink).toBe('#263B32')
    expect(tokens.color.brick).toBe('#7E1F0C')
  })

  it('uses readable muted text and ink-based hairlines', () => {
    // The hi-fi is consistent about this, and it is the difference between text
    // that recedes and text that looks like a faded link.
    expect(tokens.color.ink60).toBe('#58685E')
    expect(tokens.color.hairline).toContain('38,59,50')
  })
})

describe('self-hosted typefaces', () => {
  it('names a face for each file it ships', () => {
    const css = fontFaceCss()
    for (const file of FONT_FILES) {
      expect(css).toContain(`${file}.woff2`)
    }
  })

  it('points only at our own origin, so font-src self is enough', () => {
    const css = guestThemeCss()
    expect(css).not.toContain('googleapis')
    expect(css).not.toContain('gstatic')
    expect(css).not.toContain('http://')
    expect(css).not.toContain('https://')
  })

  it('swaps rather than blocking, so slow connections still show text', () => {
    expect(fontFaceCss()).toContain('font-display: swap')
  })

  it('lets the host relocate the font directory without touching a creation', () => {
    expect(fontFaceCss('/assets/f')).toContain("url('/assets/f/dm-sans.woff2')")
  })
})

describe('the guest stylesheet', () => {
  it('sets the variables and a minimal base, and does not dictate layout', () => {
    const css = guestThemeCss()
    expect(css).toContain('--ts-navy: #315B4C')
    expect(css).toContain('@font-face')
    // A creation owns its own look. We supply the palette, not the grid.
    expect(css).not.toContain('display: grid')
    expect(css).not.toContain('max-width')
  })
})
