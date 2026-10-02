import { randomBytes } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { expect, test, type Page } from '@playwright/test'

async function register(page: Page, handle: string, password: string) {
  await page.goto('/account')
  await page.getByRole('button', { name: 'New here? Create an account', exact: true }).click()
  await page.getByLabel('Handle', { exact: true }).fill(handle)
  await page.getByLabel('Password', { exact: true }).fill(password)
  await page.getByRole('button', { name: 'Create my account', exact: true }).click()
  await expect(page.getByRole('heading', { name: `@${handle}`, exact: true })).toBeVisible()
}

function provision(handle: string, role: 'moderator' | 'user') {
  if (process.env['TOWNSQUARE_REVIEW_MODE'] === 'local') {
    const database = process.env['TOWNSQUARE_REVIEW_DB']
    if (!database) throw new Error('Set TOWNSQUARE_REVIEW_DB to the running local API database')
    execFileSync('pnpm', ['exec', 'tsx', 'apps/api/src/provisionReviewer.ts', handle, role], { env: { ...process.env, TOWNSQUARE_DB_PATH: database }, stdio: 'pipe', timeout: 30_000 })
  } else if (process.env['TOWNSQUARE_REVIEW_MODE'] === 'railway') {
    execFileSync('railway', ['ssh', '--project', '20d807a4-40ae-471f-abf8-eecc8d00a427', '--service', '3f5124af-9bd3-4ac2-bed3-7daacd0bc873', '--environment', '9e7b4cb1-3ff3-4343-b225-9bbe71bab994', '--', 'pnpm', 'exec', 'tsx', 'apps/api/src/provisionReviewer.ts', handle, role], { stdio: 'pipe', timeout: 45_000 })
  } else throw new Error('Operator mode is required for role provisioning')
}

test('moderator reads a real correction and declines with a durable note, then loses review access', async ({ page, browser, baseURL }, testInfo) => {
  test.skip(!process.env['TOWNSQUARE_REVIEW_MODE'], 'Requires explicit operator access to the isolated test deployment')
  if (process.env['TOWNSQUARE_REVIEW_MODE'] === 'railway') expect(baseURL).toBe('https://townsquare-live-production.up.railway.app')
  const resident = `qa_${Date.now().toString(36)}_${randomBytes(2).toString('hex')}`
  const reviewer = `qa_${Date.now().toString(36)}_${randomBytes(2).toString('hex')}`
  await register(page, resident, randomBytes(24).toString('base64url'))
  const directory = await (await page.request.get('/api/directory')).json()
  const place = directory.places[0]
  const submit = await page.request.post('/api/contributions', { headers: { Origin: baseURL! }, data: { type: 'correction', content: { targetRef: place.id, targetLabel: place.name, field: 'name', beforeValue: place.name, newValue: place.name, reason: 'QA moderator-path validation only. Please decline. No public data change requested.' } } })
  expect(submit.ok()).toBe(true)
  const id = (await submit.json()).contribution.id as string
  const moderatorContext = await browser.newContext({ baseURL, viewport: page.viewportSize() ?? { width: 1440, height: 1000 } })
  const moderator = await moderatorContext.newPage()
  let promoted = false
  let declined = false
  try {
    await register(moderator, reviewer, randomBytes(24).toString('base64url'))
    expect((await moderator.request.get('/api/review/contributions')).status()).toBe(404)
    provision(reviewer, 'moderator')
    promoted = true
    await moderator.goto('/review')
    await expect(moderator.getByRole('heading', { name: 'Community corrections', exact: true })).toBeVisible()
    await moderator.getByRole('button').filter({ hasText: `@${resident}` }).click()
    await expect(moderator.getByRole('heading', { name: 'On the listing now', exact: true })).toBeVisible()
    await expect(moderator.getByRole('heading', { name: 'Proposed change', exact: true })).toBeVisible()
    await expect(moderator.getByRole('button', { name: 'Decline correction', exact: true })).toBeDisabled()
    const note = 'QA check complete. The directory stays unchanged; this was a test submission.'
    await moderator.getByRole('textbox', { name: 'Note to the neighbor', exact: true }).fill(note)
    await moderator.screenshot({ path: testInfo.outputPath('review-correction.png'), fullPage: true })
    await moderator.getByRole('button', { name: 'Decline correction', exact: true }).focus()
    await moderator.keyboard.press('Enter')
    await expect(moderator.getByRole('heading', { name: 'Correction declined', exact: true })).toBeVisible()
    declined = true
    await page.goto('/contribute')
    await expect(page.getByText(note, { exact: true })).toBeVisible()
    await page.reload()
    await expect(page.getByText(note, { exact: true })).toBeVisible()
    const mine = await (await page.request.get('/api/contributions')).json()
    expect(mine.contributions.find((row: { id: string }) => row.id === id)).toMatchObject({ status: 'declined', decisionNote: note })
    await page.screenshot({ path: testInfo.outputPath('resident-review-note.png'), fullPage: true })
    await moderator.getByRole('button', { name: 'Back to corrections', exact: true }).click()
    await expect(moderator.getByRole('button').filter({ hasText: `@${resident}` })).toHaveCount(0)
  } finally {
    if (promoted) {
      provision(reviewer, 'user')
      expect((await moderator.request.get('/api/review/contributions')).status()).toBe(404)
    }
    if (!declined) await page.request.post(`/api/contributions/${id}/withdraw`, { headers: { Origin: baseURL! }, data: {} })
    await moderatorContext.close()
  }
})
