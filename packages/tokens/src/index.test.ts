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
    ]
    const actual = cssVariables()
    for (const name of published) {
      expect(actual[name], `${name} disappeared, which breaks every creation using it`).toBeTruthy()
    }
  })

  it('emits every colour, space, radius and size as a variable', () => {
    const vars = cssVariables()
    const counted =
      Object.keys(tokens.color).length +
      Object.keys(tokens.space).length +
      Object.keys(tokens.radius).length +
      Object.keys(tokens.type).length +
      Object.keys(tokens.font).length
    expect(Object.keys(vars).length).toBe(counted)
  })

  it('gives every variable the --ts- prefix, which is the namespace guests trust', () => {
    for (const name of Object.keys(cssVariables())) {
      expect(name.startsWith('--ts-'), name).toBe(true)
    }
  })
})

describe('the hi-fi palette', () => {
  it('uses the app surface, not the canvas behind the phone', () => {
    // #EDE9E0 is the body of the design document. #F8F6F1 is the screen.
    expect(tokens.color.cream).toBe('#F8F6F1')
    expect(tokens.color.cream).not.toBe('#EDE9E0')
  })

  it('carries the hi-fi hues exactly', () => {
    expect(tokens.color.navy).toBe('#26405B')
    expect(tokens.color.terracotta).toBe('#C4714E')
    expect(tokens.color.ink).toBe('#1D1B16')
    expect(tokens.color.brick).toBe('#7E1F0C')
  })

  it('derives muted text from ink, not from navy', () => {
    // The hi-fi is consistent about this, and it is the difference between text
    // that recedes and text that looks like a faded link.
    expect(tokens.color.ink60).toContain('29,27,22')
    expect(tokens.color.hairline).toContain('29,27,22')
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
    expect(css).toContain('--ts-navy: #26405B')
    expect(css).toContain('@font-face')
    // A creation owns its own look. We supply the palette, not the grid.
    expect(css).not.toContain('display: grid')
    expect(css).not.toContain('max-width')
  })
})
