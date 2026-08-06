// Enforce the section contract. Run: node coalition/site/check.mjs
// 1. no raw colour in any section stylesheet (everything via --ts-*)
// 2. every class in a section stylesheet carries its section prefix
// 3. no inline <style>, no external http(s) requests, no <script> in sections
import { readdirSync, readFileSync, existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const secDir = join(here, 'sections')
const SHARED = new Set(['wrap', 'wrap-narrow', 'section', 'section--alt',
  'section--invert', 'section--tight', 'eyebrow', 'eyebrow--plain', 'h1', 'h2',
  'h3', 'lead', 'body', 'accent', 'gold', 'mono', 'rule', 'hairline', 'grid',
  'grid-2', 'grid-3', 'grid-4', 'split', 'card', 'card__k', 'card--invert',
  'figure', 'figure--bare', 'reveal', 'is-in'])

const HEX = /#[0-9a-fA-F]{3,8}\b/g
const FUNC = /\b(?:rgba?|hsla?|lab|lch|oklch|oklab)\s*\(/g
const NAMED = /(?<![\w-])(?:white|black|red|blue|green|gray|grey|silver|navy|gold|teal|orange|purple|pink|brown|beige|ivory|tan|cyan|magenta|maroon|olive|lime|aqua|fuchsia)(?![\w-])\s*(?:;|,|\))/g

let fail = 0
const say = (m) => { console.log('  ' + m); fail++ }

for (const f of readdirSync(secDir).filter((f) => f.endsWith('.css')).sort()) {
  const id = f.replace(/^\d+-/, '').replace(/\.css$/, '')
  const prefix = 's-' + id
  const src = readFileSync(join(secDir, f), 'utf8')
  const code = src.replace(/\/\*[\s\S]*?\*\//g, '')

  for (const re of [HEX, FUNC, NAMED]) {
    const hits = code.match(re)
    if (hits) say(`${f}: raw colour ${[...new Set(hits)].slice(0, 4).join(' ')} — use var(--ts-*)`)
  }
  for (const m of code.matchAll(/\.(-?[A-Za-z_][\w-]*)/g)) {
    const cls = m[1]
    if (SHARED.has(cls)) continue
    if (!cls.startsWith(prefix)) say(`${f}: class .${cls} must start with .${prefix}`)
  }
}

for (const f of readdirSync(secDir).filter((f) => f.endsWith('.html')).sort()) {
  const src = readFileSync(join(secDir, f), 'utf8')
  if (/<style[\s>]/i.test(src)) say(`${f}: inline <style> — put it in the .css`)
  if (/<script[\s>]/i.test(src)) say(`${f}: <script> not allowed in a section`)
  if (/(?:src|href)\s*=\s*["']https?:/i.test(src)) say(`${f}: external request — site must work offline`)
  if (!existsSync(join(secDir, f.replace(/\.html$/, '.css')))) say(`${f}: no stylesheet`)
  const ids = [...src.matchAll(/\bid="([^"]+)"/g)].map((m) => m[1])
  if (!ids.length) say(`${f}: section needs an id for the nav`)
}

console.log(fail ? `\n  ${fail} problem(s)` : '  contract clean')
process.exit(fail ? 1 : 0)
