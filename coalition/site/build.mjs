// Assemble a multi-page site from sections/NN-*.html + their stylesheets.
// One page per entry in PAGES, a persistent left sidebar on every one.
// Run:  node coalition/site/build.mjs   (from the repo root, or anywhere)
import { readdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const secDir = join(here, 'sections')

// ---------------------------------------------------------------- the book
// part:     sidebar group heading (null = ungrouped, sits above the first part)
// slug:     output filename, minus .html ('index' is the landing page)
// label:    sidebar label
// title:    browser title
// sections: section file basenames, in order, composed onto this page
export const PAGES = [
  { slug: 'index', part: null, label: 'Overview', title: 'Overview',
    sections: ['01-hero'] },

  { slug: 'problem', part: 'The case', label: 'The problem',
    title: 'The problem', sections: ['02-problem'] },
  { slug: 'how-we-got-here', part: 'The case', label: 'How we got here',
    title: 'How we got here', sections: ['03-how-we-got-here'] },
  { slug: 'answer', part: 'The answer', label: 'What it is',
    title: 'What it is', sections: ['05-answer'] },
  { slug: 'build-layer', part: 'The answer', label: 'What people make of it',
    title: 'What people make of it', sections: ['06-build-layer'] },
  { slug: 'ownership', part: 'The answer', label: 'Ownership',
    title: 'Ownership', sections: ['08-ownership'] },

  { slug: 'coalition', part: 'The plan', label: 'The coalition',
    title: 'The coalition', sections: ['09-coalition'] },
  { slug: 'proposals', part: 'The plan', label: 'The projects',
    title: 'The projects', sections: ['10-proposals'] },

  { slug: 'ask', part: 'The ask', label: 'The ask',
    title: 'The ask', sections: ['11-ask'] },
  { slug: 'close', part: 'The ask', label: 'Where it stands',
    title: 'Where it stands', sections: ['12-close'] },
]

const href = (p) => (p.slug === 'index' ? 'index.html' : p.slug + '.html')

// build.mjs is imported by shot.mjs for the page list; only emit when run direct
const RUN = process.argv[1] && process.argv[1].endsWith('build.mjs')

// ---------------------------------------------------------------- gather
const onDisk = readdirSync(secDir).filter((f) => f.endsWith('.html'))
  .map((f) => f.replace(/\.html$/, '')).sort()
const claimed = new Set(PAGES.flatMap((p) => p.sections))
const orphans = onDisk.filter((s) => !claimed.has(s))
const problems = []

function stylesheet() {
  const styles = []
  for (const base of onDisk) {
    const css = join(secDir, base + '.css')
    if (!existsSync(css)) { problems.push(base + ' (no stylesheet)'); continue }
    styles.push(`/* ===== ${base}.css ===== */\n` +
      readFileSync(css, 'utf8').trim())
  }
  writeFileSync(join(here, 'sections.css'), styles.join('\n\n') + '\n')
}

const bodyOf = (base) => {
  const f = join(secDir, base + '.html')
  if (!existsSync(f)) { problems.push(base + ' (missing)'); return '' }
  const html = readFileSync(f, 'utf8').trim()
  if (!html) { problems.push(base + ' (empty)'); return '' }
  return `<!-- ${base}.html -->\n${html}`
}

// ---------------------------------------------------------------- sidebar
function sidebar(current) {
  const out = []
  let part = null
  let n = 0
  for (const p of PAGES) {
    if (p.part !== part) {
      part = p.part
      if (part) out.push(`      <p class="side__part">${part}</p>`)
    }
    const num = p.slug === 'index' ? '' :
      `<span class="side__n" aria-hidden="true">${String(++n).padStart(2, '0')}</span>`
    const on = p.slug === current.slug
    out.push(
      `      <a class="side__link${on ? ' is-on' : ''}" href="${href(p)}"` +
      `${on ? ' aria-current="page"' : ''}>${num}<span class="side__t">${p.label}</span></a>`)
  }
  return out.join('\n')
}

// ---------------------------------------------------------------- pager
function pager(i) {
  const prev = PAGES[i - 1]
  const next = PAGES[i + 1]
  const cell = (p, kind, word) => p
    ? `    <a class="pager__a pager__a--${kind}" href="${href(p)}">
      <span class="pager__k">${word}</span>
      <span class="pager__t">${p.label}</span>
    </a>`
    : ''
  const solo = !prev || !next ? ' pager--solo' : ''
  return `<nav class="pager${solo}" aria-label="Page">
${[cell(prev, 'prev', 'Back'), cell(next, 'next', 'Next')].filter(Boolean).join('\n')}
  </nav>`
}

// ---------------------------------------------------------------- emit
function pageDoc(p, i) {
  const body = p.sections.map(bodyOf).filter(Boolean).join('\n\n')
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${p.title} &middot; Town Square Russellville</title>
<meta name="description" content="A town square the town actually owns. Prepared for the ATU CCEAO community coalition, August 2026.">
<link rel="icon" href="assets/favicon.png">
<link rel="stylesheet" href="tokens.css">
<link rel="stylesheet" href="base.css">
<link rel="stylesheet" href="sections.css">
</head>
<body data-page="${p.slug}">

<a class="skip" href="#top">Skip to content</a>

<header class="topbar">
  <a class="topbar__brand" href="index.html">
    <img src="assets/mark.png" alt="">
    <span>Town Square</span>
  </a>
  <button class="topbar__btn" type="button" id="sideToggle"
          aria-controls="side" aria-expanded="false">
    <span class="topbar__bars" aria-hidden="true"></span>
    <span class="topbar__btntxt">${p.label}</span>
  </button>
</header>

<aside class="side" id="side">
  <a class="side__brand" href="index.html">
    <img src="assets/mark.png" alt="">
    <span class="side__brandtxt">Town&nbsp;Square</span>
  </a>
  <nav class="side__nav" aria-label="Sections">
${sidebar(p)}
  </nav>
  <div class="side__foot">
    <span>Russellville, Arkansas</span>
    <span>August 2026</span>
  </div>
</aside>

<div class="side__scrim" id="sideScrim" hidden></div>

<main class="page" id="top">

${body}

  ${pager(i)}

</main>

<script>
// mobile drawer
const btn = document.getElementById('sideToggle')
const scrim = document.getElementById('sideScrim')
const setOpen = (v) => {
  document.body.classList.toggle('side-open', v)
  btn.setAttribute('aria-expanded', String(v))
  scrim.hidden = !v
}
btn.addEventListener('click', () => setOpen(!document.body.classList.contains('side-open')))
scrim.addEventListener('click', () => setOpen(false))
addEventListener('keydown', (e) => { if (e.key === 'Escape') setOpen(false) })

// reveal on enter
const io = new IntersectionObserver((es) => {
  for (const e of es) if (e.isIntersecting) { e.target.classList.add('is-in'); io.unobserve(e.target) }
}, { rootMargin: '0px 0px -8% 0px', threshold: 0.06 })
document.querySelectorAll('.reveal').forEach((el) => io.observe(el))

// left / right arrows walk the book
const PREV = ${JSON.stringify(PAGES[i - 1] ? href(PAGES[i - 1]) : null)}
const NEXT = ${JSON.stringify(PAGES[i + 1] ? href(PAGES[i + 1]) : null)}
addEventListener('keydown', (e) => {
  if (e.metaKey || e.ctrlKey || e.altKey) return
  const t = e.target
  if (t && /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName)) return
  if (e.key === 'ArrowLeft' && PREV) location.href = PREV
  if (e.key === 'ArrowRight' && NEXT) location.href = NEXT
})
</script>
</body>
</html>
`
}

if (RUN) {
  stylesheet()
  PAGES.forEach((p, i) => writeFileSync(join(here, href(p)), pageDoc(p, i)))
  console.log(`  ${PAGES.length} pages  <- ${claimed.size} sections`)
  if (orphans.length) console.log('  UNPLACED sections: ' + orphans.join(', '))
  if (problems.length) console.log('  PROBLEMS: ' + problems.join(', '))
}
