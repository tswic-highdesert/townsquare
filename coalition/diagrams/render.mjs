// Render the coalition SVGs to true-aspect PNGs (1600x900) for review and decks.
// Run from the repo root:  node coalition/diagrams/render.mjs
import { chromium } from '@playwright/test'
import { readdirSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const files = readdirSync(here).filter((f) => f.endsWith('.svg')).sort()

const browser = await chromium.launch()
const page = await browser.newPage({
  viewport: { width: 1600, height: 900 },
  deviceScaleFactor: 2,
})

for (const f of files) {
  const svg = readFileSync(join(here, f), 'utf8')
  await page.setContent(
    `<!doctype html><html><head><style>
       html,body{margin:0;padding:0;width:1600px;height:900px;overflow:hidden}
       svg{display:block}
     </style>
     <link rel="preconnect" href="https://fonts.googleapis.com">
     <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
     <link href="https://fonts.googleapis.com/css2?family=Newsreader:ital,wght@0,400..700;1,400..700&family=DM+Sans:ital,opsz,wght@0,9..40,100..1000;1,9..40,100..1000&family=DM+Mono:ital,wght@0,300;0,400;0,500;1,400&display=swap" rel="stylesheet">
     </head><body>${svg}</body></html>`,
    { waitUntil: 'networkidle' },
  )
  await page.evaluate(() => document.fonts.ready)
  const out = join(here, f.replace(/\.svg$/, '.png'))
  await page.screenshot({ path: out })
  console.log('  ' + out.split('/').pop())
}

await browser.close()
console.log('done')
