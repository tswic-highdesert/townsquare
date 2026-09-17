// Screenshot every page of the assembled site for review.
// node coalition/site/shot.mjs            -> one full-page PNG per page
// node coalition/site/shot.mjs fold       -> also the first 950px of each page
import { chromium } from '@playwright/test'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { mkdirSync, rmSync } from 'node:fs'
import { PAGES } from './build.mjs'

const here = dirname(fileURLToPath(import.meta.url))
const out = join(here, '_review')
rmSync(out, { recursive: true, force: true })
mkdirSync(out, { recursive: true })

const browser = await chromium.launch()
const page = await browser.newPage({
  viewport: { width: 1600, height: 950 },
  deviceScaleFactor: 2,
})

let i = 0
for (const p of PAGES) {
  i++
  const file = p.slug === 'index' ? 'index.html' : p.slug + '.html'
  const name = String(i).padStart(2, '0') + '-' + p.slug
  await page.goto('file://' + join(here, file), { waitUntil: 'networkidle' })
  await page.evaluate(() => document.fonts.ready)
  await page.addStyleTag({
    content: '.reveal{opacity:1!important;transform:none!important}',
  })
  await page.waitForTimeout(300)
  await page.screenshot({ path: join(out, name + '.png'), fullPage: true })
  const h = await page.evaluate(() => document.documentElement.scrollHeight)
  console.log(`  ${name}  ${h}px`)
  if (process.argv[2] === 'fold') {
    await page.screenshot({ path: join(out, name + '-fold.png') })
  }
}

console.log(`\n  ${PAGES.length} pages`)
await browser.close()
