/*
 * Assemble the master specimen sheet.
 *
 * Every section is authored as an independent pair — `sections/NN-slug.html`
 * (one <section class="sheet-section">) and `sections/NN-slug.css` — so the
 * sheet can be built by many hands at once without anyone merging a monolith.
 * This script is the only thing that knows the order.
 *
 *   node design/hifi-v2/build.mjs
 */

import { readdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const dir = join(here, 'sections')

const files = readdirSync(dir)
  .filter((f) => f.endsWith('.html'))
  .sort()

const icons = existsSync(join(here, 'icons.svg')) ? readFileSync(join(here, 'icons.svg'), 'utf8') : ''

/*
 * A section whose stylesheet has not landed yet is skipped rather than rendered
 * bare. Unstyled markup in the middle of a design review reads as a broken
 * component, not as a missing file, and it costs a conversation to explain.
 */
const pending = files.filter((f) => !existsSync(join(dir, f.replace(/\.html$/, '.css'))))
const ready = files.filter((f) => !pending.includes(f))

const parts = ready.map((f) => {
  const html = readFileSync(join(dir, f), 'utf8')
  const cssPath = join(dir, f.replace(/\.html$/, '.css'))
  const css = existsSync(cssPath) ? readFileSync(cssPath, 'utf8') : ''
  const id = (html.match(/<section[^>]*\bid=["']([^"']+)["']/) || [])[1] || f.replace(/\.html$/, '')
  // Entities survive tag-stripping, and "what&rsquo;s on" in the rail looks broken.
  const title =
    (html.match(/<h2[^>]*>([\s\S]*?)<\/h2>/) || [])[1]
      ?.replace(/<[^>]+>/g, '')
      .replace(/&rsquo;/g, '’')
      .replace(/&amp;/g, '&')
      .replace(/&nbsp;|&thinsp;/g, ' ')
      .trim() || id
  const num = (html.match(/class=["']sec-num["'][^>]*>([\s\S]*?)</) || [])[1]?.trim() || ''
  return { file: f, id, title, num, html, css }
})

const nav = parts
  .map((p) => `      <a href="#${p.id}"><span class="n">${p.num}</span>${p.title}</a>`)
  .join('\n')

const out = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Town Square — hi-fi v2 component sheet</title>
<link rel="stylesheet" href="./foundation.css">
<style>
${parts.map((p) => `/* ═══ ${p.file} ═══ */\n${p.css}`).join('\n\n')}
</style>
</head>
<body>
${icons}
<div class="sheet">
  <nav class="rail">
    <div class="rail-brand">
      <div class="rail-mark"></div>
      <div>
        <div class="rail-title">Town Square</div>
        <div class="rail-sub">Hi-fi v2</div>
      </div>
    </div>
    <div class="rail-group">Sections</div>
${nav}
  </nav>
  <main class="stack">
    <header class="masthead">
      <div class="kicker">Component sheet &middot; ${parts.length} sections</div>
      <h1>The whole surface of a town, drawn once.</h1>
      <p>Every specimen below is built from the published <code>--ts-*</code> token
      contract in <code>packages/tokens</code>. Not one hex literal appears in a
      section stylesheet, which is what lets a town reskin the shell and every
      resident-built creation inside it in the same move.</p>
      <p>Mobile first: whole screens are drawn at 390&thinsp;px inside a device,
      parts are drawn loose. Rationale sits beside the thing it explains.</p>
    </header>
${parts.map((p) => p.html.trim()).join('\n\n')}
  </main>
</div>
<script>
// The rail follows the read: whichever section owns the most of the viewport wins.
const links = new Map(
  [...document.querySelectorAll('.rail a')].map((a) => [a.getAttribute('href').slice(1), a]),
)
const seen = new Map()
const observer = new IntersectionObserver(
  (entries) => {
    for (const e of entries) seen.set(e.target.id, e.intersectionRatio)
    let best = null
    for (const [id, ratio] of seen) {
      if (ratio > 0 && (best === null || ratio > seen.get(best))) best = id
    }
    for (const [id, a] of links) a.classList.toggle('on', id === best)
  },
  { threshold: [0, 0.05, 0.25, 0.5, 0.75, 1] },
)
for (const s of document.querySelectorAll('.sheet-section')) observer.observe(s)
</script>
</body>
</html>
`

writeFileSync(join(here, 'index.html'), out)
console.log(`built index.html from ${parts.length} sections:`)
for (const p of parts) console.log(`  ${p.num.padEnd(3)} ${p.title}  (${p.css.length} bytes css)`)
if (pending.length) console.log(`\nskipped, stylesheet not landed yet: ${pending.join(', ')}`)
