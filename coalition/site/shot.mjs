// Screenshot the assembled site for review.
// node coalition/site/shot.mjs            -> per-section PNGs into site/_review/
// node coalition/site/shot.mjs full       -> also one tall full-page PNG
import { chromium } from '@playwright/test'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { mkdirSync, rmSync } from 'node:fs'

const here = dirname(fileURLToPath(import.meta.url))
const out = join(here, '_review')
rmSync(out, { recursive: true, force: true })
mkdirSync(out, { recursive: true })

const browser = await chromium.launch()
const page = await browser.newPage({
  viewport: { width: 1600, height: 950 },
  deviceScaleFactor: 2,
})
await page.goto('file://' + join(here, 'index.html'), { waitUntil: 'networkidle' })
await page.evaluate(() => document.fonts.ready)
// force every reveal visible so screenshots are not blank
await page.addStyleTag({ content: '.reveal{opacity:1!important;transform:none!important} .nav{display:none!important}' })
await page.waitForTimeout(400)

const secs = await page.$$eval('main > section', (els) =>
  els.map((e) => ({ id: e.id, h: Math.round(e.getBoundingClientRect().height) })))

let i = 0
for (const s of secs) {
  i++
  const name = String(i).padStart(2, '0') + '-' + (s.id || 'unnamed')
  await page.locator(`main > section#${s.id}`).screenshot({
    path: join(out, name + '.png'),
  })
  console.log(`  ${name}  ${s.h}px`)
}

if (process.argv[2] === 'full') {
  await page.screenshot({ path: join(out, '_full.png'), fullPage: true })
  console.log('  _full.png')
}

const total = await page.evaluate(() => document.documentElement.scrollHeight)
console.log(`\n  ${secs.length} sections, ${total}px tall`)
await browser.close()
