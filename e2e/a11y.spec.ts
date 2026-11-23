/**
 * The accessibility suite.
 *
 * Every resident route, at a desktop and a phone width, run through axe-core
 * against WCAG 2.1 A and AA, plus the checks axe cannot make: reflow at 320
 * CSS pixels, text at 200%, a visible focus indicator on every tab stop,
 * nothing moving under `prefers-reduced-motion`, and a creation's frame that
 * keyboard focus can enter and leave. It shares the boundary suite's three
 * servers, so it sees the shell as a resident does: real origins, real API,
 * real creation frame.
 *
 * Fort Smith and every other city we work with faces the ADA Title II web rule
 * (WCAG 2.1 AA) from April 2027. A violation here is a failure, not a warning,
 * because the only accessibility work that stays done is the kind a test holds.
 *
 * axe-core is injected from `apps/web`'s own dependency rather than through a
 * wrapper package, so the suite adds one package to the lockfile and nothing to
 * the root manifest.
 *
 * Set `A11Y_REPORT=<file>` to append every finding to that file as JSON lines
 * instead of failing, which is how the before and after counts in the PR were
 * taken.
 */

import { test, expect, type Page } from '@playwright/test'
import { createRequire } from 'node:module'
import { appendFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const require = createRequire(fileURLToPath(new URL('../apps/web/package.json', import.meta.url)))
const AXE_PATH = require.resolve('axe-core/axe.min.js')
const SHELL = `http://townsquare.localhost:${process.env['BOUNDARY_SHELL_PORT'] ?? '4410'}`
const API = `http://127.0.0.1:${process.env['BOUNDARY_API_PORT'] ?? '4411'}`
const REPORT = process.env['A11Y_REPORT']

/**
 * Structure rules from axe's best-practice set that the shell holds itself to.
 * They are not WCAG success criteria on their own, but each is how a screen
 * reader user finds their way around a page (1.3.1, 2.4.1, 2.4.6 in practice).
 */
const STRUCTURE_RULES = [
  'landmark-one-main',
  'landmark-no-duplicate-main',
  'landmark-unique',
  'page-has-heading-one',
  'heading-order',
  'region',
]

interface Finding {
  id: string
  impact?: string | null
  help: string
  nodes: Array<{ target: string[]; html?: string; failureSummary?: string }>
}

/** Fail, or in report mode record, a set of findings for one page. */
function report(check: string, label: string, findings: Finding[]) {
  if (REPORT) {
    appendFileSync(REPORT, JSON.stringify({ check, page: `${test.info().titlePath[1]} ${label}`, findings }) + '\n')
    return
  }
  expect(
    findings,
    `${check} ${label}\n${findings.map((f) => `${f.id}: ${f.help}\n  ${f.nodes.map((n) => n.target.join(' ')).join('\n  ')}`).join('\n')}`,
  ).toEqual([])
}

async function axe(page: Page, label: string) {
  await page.addScriptTag({ path: AXE_PATH })
  const run = (only: unknown) => page.evaluate(async (runOnly) => {
    const w = window as unknown as { axe: { run: (ctx: unknown, opts: unknown) => Promise<{ violations: Finding[] }> } }
    // `iframes: false`: the creation is a cross-origin document written by a
    // neighbour, reviewed in the queue. The frame element and its title are ours.
    const result = await w.axe.run(document, { runOnly, iframes: false })
    return result.violations.map((v) => ({
      id: v.id, impact: v.impact, help: v.help,
      nodes: v.nodes.map((n) => ({ target: n.target, html: n.html?.slice(0, 200), failureSummary: n.failureSummary })),
    }))
  }, only)
  report('wcag', label, await run({ type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] }))
  report('structure', label, await run({ type: 'rule', values: STRUCTURE_RULES }))
}

/** Let the screen finish arriving: fonts, the first fetch, and any transition. */
async function settle(page: Page) {
  // Capped: a screen that polls never goes fully idle, and that is not a fault.
  await page.waitForLoadState('networkidle', { timeout: 8_000 }).catch(() => undefined)
  await page.evaluate(() => document.fonts.ready)
  await page.locator('h1, h2').first().waitFor({ timeout: 10_000 }).catch(() => undefined)
  await page.waitForTimeout(300)
}

async function ids() {
  const firstId = async (path: string) =>
    JSON.stringify(await (await fetch(`${API}${path}`)).json().catch(() => null)).match(/"id":"([^"]+)"/)?.[1]
  const nearby = await (await fetch(`${API}/api/nearby`)).json() as { places?: Array<{ id: string }> }
  const creations = await (await fetch(`${API}/api/creations`)).json() as Array<{ slug: string }>
  return { place: nearby.places?.[0]?.id, creation: creations[0]?.slug, story: await firstId('/api/news'), event: await firstId('/api/events') }
}

const STATIC_ROUTES = [
  '/', '/places', '/places?view=map', '/weekend', '/saved', '/creations', '/builder',
  '/news', '/events', '/contribute', '/contribute?new=1', '/account',
]

const DETAIL_ROUTES = [
  ['place', (id: string) => `/places/${encodeURIComponent(id)}`],
  ['story', (id: string) => `/news/${encodeURIComponent(id)}`],
  ['event', (id: string) => `/events/${encodeURIComponent(id)}`],
  ['creation', (slug: string) => `/creations/${encodeURIComponent(slug)}`],
  ['creation', (slug: string) => `/creations/${encodeURIComponent(slug)}/about`],
  ['creation', (slug: string) => `/creations/${encodeURIComponent(slug)}/open`],
] as const

for (const viewport of [{ name: 'desktop', width: 1280, height: 900 }, { name: 'phone', width: 390, height: 844 }]) {
  test.describe(viewport.name, () => {
    test.use({ viewport: { width: viewport.width, height: viewport.height } })

    for (const path of STATIC_ROUTES) {
      test(`axe ${path}`, async ({ page }) => {
        await page.goto(`${SHELL}${path}`)
        await settle(page)
        await axe(page, path)
      })
    }

    for (const [kind, path] of DETAIL_ROUTES) {
      test(`axe ${path(`:${kind}`)}`, async ({ page }) => {
        const id = (await ids())[kind]
        test.skip(!id, `no ${kind} in this town's data`)
        await page.goto(`${SHELL}${path(id!)}`)
        await settle(page)
        await axe(page, path(`:${kind}`))
      })
    }

    test('axe search overlay', async ({ page }) => {
      await page.goto(`${SHELL}/`)
      await settle(page)
      await page.locator('.ts-appbar-search').click()
      await page.getByRole('dialog').first().waitFor()
      await page.keyboard.type('park')
      await page.waitForTimeout(600)
      await axe(page, 'search overlay')
    })
  })
}

test.describe('reflow and text size', () => {
  /**
   * 1.4.10: content at 320 CSS pixels wide scrolls in one direction only.
   * 1.4.4: 200% browser zoom on a 1280 window is a 640 pixel viewport, and
   * text-only enlargement is the root font size doubled. Tokens are in rem, so
   * the second is the harder of the two.
   */
  for (const mode of [
    { name: '320px', width: 320, height: 640, text: 1 },
    { name: '200% zoom', width: 640, height: 450, text: 1 },
    { name: '200% text', width: 1280, height: 900, text: 2 },
  ]) {
    for (const path of STATIC_ROUTES) test(`no sideways scroll at ${mode.name} on ${path}`, async ({ page }) => {
      await page.setViewportSize({ width: mode.width, height: mode.height })
      const findings: Finding[] = []
      await page.goto(`${SHELL}${path}`)
      await settle(page)
      if (mode.text !== 1) await page.addStyleTag({ content: `html { font-size: ${mode.text * 100}% !important }` })
      const overflow = await page.evaluate(() => {
        const width = document.documentElement.clientWidth
        if (document.documentElement.scrollWidth <= width + 1) return []
        // Name the widest offenders, so a failure says where to look.
        return [...document.querySelectorAll('body *')]
          .filter((el) => {
            const r = el.getBoundingClientRect()
            return r.right > width + 1 && getComputedStyle(el).position !== 'fixed' && r.width > 0
              && !el.closest('[aria-hidden="true"], .ts-skip')
          })
          .slice(0, 5)
          .map((el) => `${el.tagName.toLowerCase()}.${[...el.classList].join('.')}`)
      })
      if (overflow.length) findings.push({ id: 'reflow', help: `scrolls sideways at ${mode.name}`, nodes: [{ target: [path, ...overflow] }] })
      report('reflow', `${mode.name} ${path}`, findings)
    })
  }
})

test.describe('in Spanish', () => {
  /**
   * Spanish runs a fifth to a third longer than English, so the narrowest
   * screen is where it breaks first. The page has to say it is Spanish, too,
   * or a screen reader reads it in an English voice (3.1.1).
   */
  test.use({ viewport: { width: 320, height: 640 } })
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem('ts-locale', 'es'))
  })

  for (const path of STATIC_ROUTES) test(`axe and reflow on ${path}`, async ({ page }) => {
    await page.goto(`${SHELL}${path}`)
    await settle(page)
    await expect(page.locator('html')).toHaveAttribute('lang', 'es')
    await axe(page, path)
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
    report('reflow', `es ${path}`, overflow > 1 ? [{ id: 'reflow', help: `scrolls sideways by ${overflow}px`, nodes: [{ target: [path] }] }] : [])
  })
})

test.describe('keyboard', () => {
  test.use({ viewport: { width: 1280, height: 900 } })

  /**
   * 2.4.7: every tab stop shows where focus is. Measured as a change in
   * outline, box shadow, background or border between the focused element and
   * the same element blurred, so any of the shell's focus treatments counts and
   * a control with none does not.
   */
  for (const path of ['/', '/places', '/creations', '/events', '/account', '/contribute?new=1']) {
    test(`visible focus on every tab stop of ${path}`, async ({ page }) => {
      await page.goto(`${SHELL}${path}`)
      await settle(page)
      const findings: Finding[] = []
      const seen = new Set<string>()
      for (let i = 0; i < 40; i++) {
        await page.keyboard.press('Tab')
        const stop = await page.evaluate(() => {
          const el = document.activeElement as HTMLElement | null
          if (!el || el === document.body || el.tagName === 'IFRAME') return null
          const look = (s: CSSStyleDeclaration) =>
            [s.outlineStyle !== 'none' ? `${s.outlineStyle} ${s.outlineWidth} ${s.outlineColor}` : 'none', s.boxShadow, s.backgroundColor, s.borderColor, s.textDecorationLine].join('|')
          const focused = look(getComputedStyle(el))
          const id = el.id || el.getAttribute('aria-label') || el.textContent?.trim().slice(0, 40) || el.tagName
          const key = `${el.tagName}:${id}:${el.getBoundingClientRect().top}`
          el.blur()
          const blurred = look(getComputedStyle(el))
          el.focus({ preventScroll: true })
          return { key, id, html: el.outerHTML.slice(0, 160), visible: focused !== blurred }
        })
        if (!stop) continue
        if (seen.has(stop.key)) break
        seen.add(stop.key)
        if (!stop.visible) findings.push({ id: 'focus-visible', help: 'no visible change on focus', nodes: [{ target: [stop.id], html: stop.html }] })
      }
      expect(seen.size, 'tabbing reached no controls').toBeGreaterThan(0)
      report('focus', path, findings)
    })
  }

  test('the skip link lands on the screen content', async ({ page }) => {
    await page.goto(`${SHELL}/`)
    await settle(page)
    await page.keyboard.press('Tab')
    const skip = page.locator('.ts-skip')
    await expect(skip).toBeFocused()
    await page.keyboard.press('Enter')
    await expect(page.locator('#ts-main')).toBeFocused()
  })

  /**
   * The creation's frame: titled, reachable, and not a trap. Focus that goes
   * into a neighbour's app has to be able to come back out by keyboard alone.
   */
  test('a creation frame is titled and does not trap focus', async ({ page }) => {
    const { creation } = await ids()
    test.skip(!creation, 'no creation in this town')
    await page.goto(`${SHELL}/creations/${encodeURIComponent(creation!)}/open`)
    await settle(page)
    const frame = page.locator('iframe').first()
    await frame.waitFor()
    await expect(frame).toHaveAttribute('title', /\S/)
    let entered = false
    let left = false
    for (let i = 0; i < 60 && !left; i++) {
      await page.keyboard.press('Tab')
      const inFrame = await page.evaluate(() => document.activeElement?.tagName === 'IFRAME')
      if (inFrame) entered = true
      else if (entered) left = true
    }
    expect(entered, 'Tab never reached the creation').toBe(true)
    expect(left, 'Tab could not leave the creation').toBe(true)
  })
})

test.describe('reduced motion', () => {
  test.use({ viewport: { width: 1280, height: 900 } })

  /**
   * With `prefers-reduced-motion: reduce`, nothing on a screen is animating
   * or set to travel. State changes still show; they just do not move.
   */
  for (const path of STATIC_ROUTES) test(`nothing moves on ${path}`, async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' })
    const findings: Finding[] = []
    await page.goto(`${SHELL}${path}`)
    await settle(page)
    const moving = await page.evaluate(() => {
      const seconds = (v: string) => Math.max(...v.split(',').map((d) => (d.trim().endsWith('ms') ? parseFloat(d) / 1000 : parseFloat(d))))
      return [...document.querySelectorAll('*')].flatMap((el) => {
        const s = getComputedStyle(el)
        const animated = s.animationName !== 'none' && seconds(s.animationDuration) > 0.01
        const travels = /transform|translate|scale|all/.test(s.transitionProperty) && seconds(s.transitionDuration) > 0.01
        return animated || travels ? [`${el.tagName.toLowerCase()}.${[...el.classList].join('.')} ${animated ? s.animationName : s.transitionProperty}`] : []
      }).slice(0, 8)
    })
    if (moving.length) findings.push({ id: 'reduced-motion', help: 'moves under reduced motion', nodes: [{ target: [path, ...moving] }] })
    report('motion', path, findings)
  })
})
