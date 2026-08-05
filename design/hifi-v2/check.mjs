/*
 * Check every authored section against the contract in AUTHORING.md.
 *
 * The sheet is written by many hands into one document, so the two failure
 * modes are a raw colour (which silently breaks the multi-town theming seam,
 * and only shows up when someone reskins months later) and an unprefixed class
 * (which collides with another author's and only shows up on the one page where
 * both sections are rendered together). Both are cheap to catch here and
 * expensive to find by eye.
 *
 *   node design/hifi-v2/check.mjs
 */

import { readdirSync, readFileSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const dir = join(here, 'sections')

/** Classes the sheet itself owns. A section may use these unprefixed. */
const CHROME = new Set([
  'sheet-section', 'sec-head', 'sec-num', 'sec-note', 'spec', 'spec-label',
  'spec-row', 'spec-grid', 'plate', 'why', 'phone', 'phone-cap', 'phone-screen',
  'i', 'i-sm', 'i-lg', 'i-xl', 'sheet', 'rail', 'stack', 'masthead',
])

const sprite = existsSync(join(here, 'icons.svg')) ? readFileSync(join(here, 'icons.svg'), 'utf8') : ''
const spriteIds = new Set([...sprite.matchAll(/id="(i-[a-z0-9-]+)"/g)].map((m) => m[1]))

let problems = 0
const report = (file, msg) => {
  problems++
  console.log(`  ✗ ${file}: ${msg}`)
}

const files = readdirSync(dir).filter((f) => f.endsWith('.html')).sort()

if (!files.length) {
  console.log('no sections authored yet')
  process.exit(0)
}

console.log(`checking ${files.length} sections against ${spriteIds.size} sprite symbols\n`)

for (const f of files) {
  const html = readFileSync(join(dir, f), 'utf8')
  const cssPath = join(dir, f.replace(/\.html$/, '.css'))
  const css = existsSync(cssPath) ? readFileSync(cssPath, 'utf8') : ''
  const slugPrefix = null

  console.log(f)

  // ── structure ──────────────────────────────────────────────────────────
  if (!/^\s*<section class="sheet-section" id="[a-z-]+"/.test(html)) {
    report(f, 'does not open with <section class="sheet-section" id="...">')
  }
  // Anchored so <header> and <hgroup> are not mistaken for document furniture.
  for (const banned of [/<html[\s>]/, /<head[\s>]/, /<body[\s>]/, /<!doctype/i, /<link[\s>]/]) {
    if (banned.test(html)) report(f, `contains ${banned.source}, which belongs to the shell`)
  }
  // A <style> block would escape the build's ordering and cascade.
  if (/<style[\s>]/.test(html)) report(f, 'contains a <style> block; put it in the .css file')
  if ((html.match(/<section class="sheet-section"/g) || []).length !== 1) {
    report(f, 'must contain exactly one .sheet-section')
  }
  if (!css) report(f, 'has no matching .css file')
  if (!/class="sec-num"/.test(html)) report(f, 'missing the .sec-num badge in .sec-head')

  // ── the colour contract ────────────────────────────────────────────────
  const rawColour = [...css.matchAll(/(^|[^&\w])(#[0-9a-fA-F]{3,8}\b|rgba?\([^)]*\)|hsla?\([^)]*\))/g)]
  for (const m of rawColour.slice(0, 6)) {
    const line = css.slice(0, m.index).split('\n').length
    report(f, `raw colour "${m[2]}" at ${cssPath.split('/').pop()}:${line} — every colour must be var(--ts-*)`)
  }
  if (rawColour.length > 6) report(f, `…and ${rawColour.length - 6} more raw colours`)

  // ── external requests ──────────────────────────────────────────────────
  for (const m of html.matchAll(/(?:src|href)="(https?:)?\/\//g)) {
    report(f, 'references an external URL; the sheet must render with no network')
    break
  }
  if (/@import|url\(\s*['"]?https?:/.test(css)) report(f, 'css fetches something external')

  /*
   * Sections legitimately show markup as *content* (an escaped code sample of
   * the aria-live regions, say). That text is not markup this file renders, so
   * it is stripped before anything below inspects classes or icon references.
   */
  const rendered = html.replace(/&lt;[\s\S]*?&gt;/g, '')

  // ── icons ──────────────────────────────────────────────────────────────
  const localSymbols = new Set([...html.matchAll(/<symbol[^>]*id="([^"]+)"/g)].map((m) => m[1]))
  // A reference built at runtime ('#' + c.icon) cannot be resolved statically.
  const used = new Set(
    [...rendered.matchAll(/<use[^>]*href="#([a-z0-9-]+)"/g)].map((m) => m[1]),
  )
  const missing = [...used].filter((id) => !spriteIds.has(id) && !localSymbols.has(id))
  if (missing.length) report(f, `uses icons that exist nowhere: ${missing.join(' ')}`)

  // ── class namespacing ──────────────────────────────────────────────────
  const classes = new Set()
  for (const m of rendered.matchAll(/class="([^"]*)"/g)) {
    for (const c of m[1].split(/\s+/)) if (c) classes.add(c)
  }
  const prefixes = new Map()
  for (const c of classes) {
    if (CHROME.has(c)) continue
    const p = c.split('-')[0]
    prefixes.set(p, (prefixes.get(p) || 0) + 1)
  }
  // The section's own prefix is whichever two-letter stem dominates.
  const own = [...prefixes.entries()].sort((a, b) => b[1] - a[1])[0]?.[0]
  const strays = [...classes].filter(
    (c) => !CHROME.has(c) && !c.startsWith(`${own}-`) && c !== own,
  )
  if (strays.length) {
    report(f, `${strays.length} class(es) not prefixed "${own}-": ${strays.slice(0, 12).join(' ')}${strays.length > 12 ? ' …' : ''}`)
  }

  // ── substance ──────────────────────────────────────────────────────────
  const specs = (html.match(/class="spec"/g) || []).length
  const whys = (html.match(/class="why"/g) || []).length
  if (specs < 8) report(f, `only ${specs} specimens; the target is 8 or more`)
  if (whys < 1) report(f, 'no .why rationale block')
  if (/[Ll]orem ipsum|Card Title|Business Name|Placeholder/.test(html)) {
    report(f, 'contains placeholder copy')
  }
  // House rule, enforced everywhere: no em dashes.
  const em = (html.match(/—/g) || []).length
  if (em) report(f, `${em} em dash(es); the house style forbids them`)

  console.log(`  ${specs} specimens, ${whys} rationale blocks, ${classes.size} classes, ${used.size} distinct icons`)
}

console.log(problems ? `\n${problems} problem(s)` : '\nall sections pass')
process.exit(problems ? 1 : 0)
