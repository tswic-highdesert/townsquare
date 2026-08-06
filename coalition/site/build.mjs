// Assemble index.html from sections/NN-*.html + their stylesheets.
// Run:  node coalition/site/build.mjs   (from the repo root, or anywhere)
import { readdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const secDir = join(here, 'sections')

const NAV = [
  ['problem', 'The problem'],
  ['how-we-got-here', 'How we got here'],
  ['answer', 'The answer'],
  ['build-layer', 'The build layer'],
  ['compounds', 'Why it compounds'],
  ['ownership', 'Ownership'],
  ['coalition', 'The coalition'],
  ['proposals', 'Projects'],
  ['ask', 'The ask'],
]

const files = readdirSync(secDir).filter((f) => f.endsWith('.html')).sort()
const missing = []
const parts = []
const styles = []

for (const f of files) {
  const html = readFileSync(join(secDir, f), 'utf8').trim()
  if (!html) { missing.push(f + ' (empty)'); continue }
  const css = join(secDir, f.replace(/\.html$/, '.css'))
  if (!existsSync(css)) { missing.push(f + ' (no stylesheet)'); continue }
  parts.push(`<!-- ${f} -->\n${html}`)
  styles.push(`/* ===== ${f.replace(/\.html$/, '.css')} ===== */\n` +
    readFileSync(css, 'utf8').trim())
}

writeFileSync(join(here, 'sections.css'), styles.join('\n\n') + '\n')

const nav = NAV.map(([id, label]) =>
  `        <a href="#${id}">${label}</a>`).join('\n')

const doc = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Town Square &middot; Russellville</title>
<meta name="description" content="A town square the town actually owns. Prepared for the ATU CCEAO community coalition, August 2026.">
<link rel="icon" href="assets/favicon.png">
<link rel="stylesheet" href="tokens.css">
<link rel="stylesheet" href="base.css">
<link rel="stylesheet" href="sections.css">
</head>
<body>

<header class="nav">
  <div class="nav__in">
    <a class="nav__brand" href="#top">
      <img src="assets/mark.png" alt="">
      <span>Town Square</span>
    </a>
    <nav class="nav__links">
${nav}
    </nav>
  </div>
  <div class="nav__progress" id="navProgress"></div>
</header>

<main id="top">

${parts.join('\n\n')}

</main>

<script>
// scroll progress
const bar = document.getElementById('navProgress')
const onScroll = () => {
  const h = document.documentElement
  const pct = h.scrollTop / (h.scrollHeight - h.clientHeight || 1)
  bar.style.width = (pct * 100).toFixed(2) + '%'
}
addEventListener('scroll', onScroll, { passive: true }); onScroll()

// reveal on enter
const io = new IntersectionObserver((es) => {
  for (const e of es) if (e.isIntersecting) { e.target.classList.add('is-in'); io.unobserve(e.target) }
}, { rootMargin: '0px 0px -8% 0px', threshold: 0.06 })
document.querySelectorAll('.reveal').forEach((el) => io.observe(el))

// current section in nav
const ids = [${NAV.map(([id]) => `'${id}'`).join(', ')}]
const links = new Map(ids.map((id) => [id, document.querySelector('.nav__links a[href="#' + id + '"]')]))
const spy = new IntersectionObserver((es) => {
  for (const e of es) {
    const a = links.get(e.target.id)
    if (a) a.setAttribute('aria-current', e.isIntersecting ? 'true' : 'false')
  }
}, { rootMargin: '-45% 0px -50% 0px' })
ids.forEach((id) => { const el = document.getElementById(id); if (el) spy.observe(el) })
</script>
</body>
</html>
`

writeFileSync(join(here, 'index.html'), doc)
console.log(`  index.html  <- ${parts.length} sections`)
if (missing.length) console.log('  SKIPPED: ' + missing.join(', '))
