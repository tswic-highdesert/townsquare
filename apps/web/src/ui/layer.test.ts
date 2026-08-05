import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const read = (p: string) => readFileSync(fileURLToPath(new URL(p, import.meta.url)), 'utf8')

/**
 * The contract five people are writing against.
 *
 * A screen must be able to override a primitive by writing an ordinary rule.
 * That used to depend on `ui.css` being imported before any screen stylesheet,
 * which is false for a stylesheet imported from its own component — the
 * measured order in dev was nav.css, news.css, ui.css, index.css, so every
 * screen override lost silently and one agent only caught it from a
 * screenshot.
 *
 * Cascade layers make it true by construction. These assertions are cheap and
 * they are the difference between the guarantee holding and the comment
 * claiming it holds.
 */
describe('the cascade layer contract', () => {
  const ui = read('./ui.css')
  const base = read('../styles/base.css')

  it('declares the order before it uses it', () => {
    // A layer used before its position is declared lands last, which would put
    // primitives above screens and reintroduce exactly the bug.
    const declaration = ui.indexOf('@layer ts-base, ts-primitives;')
    const use = ui.indexOf('@layer ts-primitives {')
    expect(declaration).toBeGreaterThanOrEqual(0)
    expect(use).toBeGreaterThan(declaration)
  })

  it('puts the whole primitives sheet inside the layer', () => {
    expect(ui).toContain('@layer ts-primitives {')
    // One opening block, one closing brace at the end of the file.
    expect(ui.match(/@layer ts-primitives \{/g)).toHaveLength(1)
    expect(ui.trimEnd().endsWith('}')).toBe(true)
    // Balanced, so nothing escaped the layer on the way in.
    expect((ui.match(/\{/g) ?? []).length).toBe((ui.match(/\}/g) ?? []).length)
  })

  it('keeps the element resets below the primitives', () => {
    // `button { cursor: pointer }` unlayered would beat `.ts-btn:disabled
    // { cursor: not-allowed }` layered, because layer order outranks specificity.
    expect(base).toContain('@layer ts-base {')
    expect(base).toContain('@layer ts-base, ts-primitives;')
    expect((base.match(/\{/g) ?? []).length).toBe((base.match(/\}/g) ?? []).length)
  })

  /**
   * Screen stylesheets must stay unlayered. A screen that helpfully wrapped
   * itself in `@layer` would drop below the primitives and lose the override
   * it was written to make.
   */
  it('leaves every screen stylesheet unlayered', () => {
    for (const sheet of ['today', 'nearby', 'yours', 'map', 'review', 'gallery', 'chrome', 'trust', 'boot', 'identity']) {
      expect(read(`../styles/${sheet}.css`), `${sheet}.css is layered`).not.toContain('@layer')
    }
  })

  it('loads the stylesheets before the component tree in the entry', () => {
    const main = read('../main.tsx')
    expect(main.indexOf("import './ui/ui.css'")).toBeLessThan(main.indexOf("from './App.js'"))
  })
})
