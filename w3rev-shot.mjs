import { chromium } from '@playwright/test'
const b = await chromium.launch()
const out = '/Users/talswicegood/.claude-profiles/whitecap/jobs/785723b0/tmp/w3-news/shots'
const SHELL = 'http://townsquare.localhost:5310'

for (const width of [390, 1200]) {
  const ctx = await b.newContext({ viewport: { width, height: 950 } })
  const p = await ctx.newPage()
  const errs = []
  p.on('pageerror', e => errs.push(String(e)))
  p.on('console', m => m.type() === 'error' && errs.push(m.text()))
  await p.goto(SHELL, { waitUntil: 'networkidle' })

  const who = await p.evaluate(async () => {
    const r = await fetch('/api/auth/signin', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'mod@example.com' }) })
    const body = await r.json()
    const token = new URL(body.devLink).searchParams.get('confirm')
    const c = await fetch('/api/auth/confirm', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token }) })
    return c.ok ? await c.json() : c.status
  })
  if (width === 390) console.log('moderator session:', JSON.stringify(who).slice(0, 140))

  // File a report so the Reports tab has something in it.
  const filed = await p.evaluate(async () => {
    const r = await fetch('/api/reports', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ slug: 'burrito-index', reason: 'broken', detail: 'The index has not updated since Friday and the page is blank.' }) })
    return { status: r.status, body: await r.json() }
  })
  if (width === 390) console.log('report filed:', JSON.stringify(filed).slice(0, 220))

  await p.reload({ waitUntil: 'networkidle' }); await p.waitForTimeout(2200)
  const rq = p.locator('button', { hasText: 'Review queue' }).first()
  if (!(await rq.count())) { console.log(width, '! no Review queue button'); await ctx.close(); continue }
  await rq.click(); await p.waitForTimeout(1600)
  await p.screenshot({ path: `${out}/rev-submissions-${width}.png`, fullPage: true })

  for (const tab of ['Reports', 'Live creations']) {
    const t = p.locator('button', { hasText: new RegExp(`^${tab}`) }).first()
    if (await t.count()) {
      await t.click(); await p.waitForTimeout(1400)
      await p.screenshot({ path: `${out}/rev-${tab.split(' ')[0].toLowerCase()}-${width}.png`, fullPage: true })
    } else console.log(width, '! no tab', tab)
  }
  console.log(width, 'errors:', errs.length ? errs.slice(0, 3) : 'none')
  await ctx.close()
}
await b.close()
