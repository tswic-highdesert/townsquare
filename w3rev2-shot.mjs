import { chromium } from '@playwright/test'
const b = await chromium.launch()
const out = '/Users/talswicegood/.claude-profiles/whitecap/jobs/785723b0/tmp/w3-news/shots'
const SHELL = 'http://townsquare.localhost:5320'
for (const width of [390, 1200]) {
  const ctx = await b.newContext({ viewport: { width, height: 1000 } })
  const p = await ctx.newPage()
  const errs = []
  p.on('pageerror', e => errs.push(String(e)))
  p.on('console', m => m.type() === 'error' && errs.push(m.text()))
  await p.goto(SHELL, { waitUntil: 'networkidle' })
  await p.evaluate(async () => {
    const r = await fetch('/api/auth/signin', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'mod@example.com' }) })
    const t = new URL((await r.json()).devLink).searchParams.get('confirm')
    await fetch('/api/auth/confirm', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token: t }) })
  })
  if (width === 390) console.log('queue payload:', JSON.stringify(await p.evaluate(async () => (await (await fetch('/api/review/queue', { credentials: 'same-origin' })).json())), null, 1).slice(0, 900))
  await p.reload({ waitUntil: 'networkidle' }); await p.waitForTimeout(2200)
  const rq = p.locator('button', { hasText: 'Review queue' }).first()
  if (!(await rq.count())) { console.log(width, '! no Review queue button'); await ctx.close(); continue }
  await rq.click(); await p.waitForTimeout(1600)
  await p.screenshot({ path: `${out}/q-list-${width}.png`, fullPage: true })
  // Open the queued v2.
  const row = p.locator('button, a').filter({ hasText: /River Level/ }).first()
  if (await row.count()) {
    await row.click(); await p.waitForTimeout(1700)
    await p.screenshot({ path: `${out}/q-detail-${width}.png`, fullPage: true })
    if (width === 390) {
      const t = await p.locator('.mod-screen, main, body').first().innerText()
      console.log('\n--- SUBMISSION DETAIL TEXT ---\n' + t.slice(0, 2600))
    }
  } else console.log(width, '! could not open the submission')
  console.log(width, 'errors:', errs.length ? errs.slice(0, 3) : 'none')
  await ctx.close()
}
await b.close()
