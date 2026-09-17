// Render the coalition deck to PDF (and per-slide PNGs for review).
// Run from the repo root:  node coalition/deck/render.mjs
import { chromium } from '@playwright/test'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { mkdirSync } from 'node:fs'

const here = dirname(fileURLToPath(import.meta.url))
const url = 'file://' + join(here, 'deck.html')

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } })
await page.goto(url, { waitUntil: 'networkidle' })
await page.evaluate(() => document.fonts.ready)

const slideCount = await page.$$eval('.slide', (els) => els.length)
const pdf = join(here, 'town-square-russellville.pdf')
await page.pdf({
  path: pdf,
  width: '1600px',
  height: '900px',
  printBackground: true,
  pageRanges: `1-${slideCount}`,
  margin: { top: 0, right: 0, bottom: 0, left: 0 },
})
console.log('  ' + pdf.split('/').pop())

// per-slide PNGs, handy for review and for dropping single slides into email
const shots = join(here, 'slides')
mkdirSync(shots, { recursive: true })
const n = slideCount
for (let i = 0; i < n; i++) {
  const p = join(shots, String(i + 1).padStart(2, '0') + '.png')
  await page.locator('.slide').nth(i).screenshot({ path: p })
}
console.log(`  slides/ (${n} png)`)

await browser.close()
console.log('done')
