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
  let competingId: string | undefined
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
    const competing = await page.request.post('/api/contributions', { headers: { Origin: baseURL! }, data: { type: 'correction', content: { targetRef: place.id, targetLabel: place.name, field: 'name', beforeValue: place.name, newValue: place.name, reason: 'QA concurrent-review validation only. Please decline; no public data change requested.' } } })
    expect(competing.ok()).toBe(true)
    competingId = (await competing.json()).contribution.id
    await moderator.reload()
    await moderator.getByRole('button').filter({ hasText: `@${resident}` }).click()
    await expect(moderator.getByRole('heading', { name: 'Proposed change', exact: true })).toBeVisible()
    const competingNote = 'This correction was already reviewed in another session. No public change.'
    expect((await moderator.request.post(`/api/review/contributions/${competingId}/decide`, { headers: { Origin: baseURL! }, data: { decision: 'decline', note: competingNote } })).ok()).toBe(true)
    await moderator.getByRole('textbox', { name: 'Note to the neighbor', exact: true }).fill('This stale decision must not replace the saved decision.')
    await moderator.getByRole('button', { name: 'Decline correction', exact: true }).click()
    await expect(moderator.getByRole('heading', { name: 'Correction declined', exact: true })).toBeVisible()
    await expect(moderator.getByText(competingNote, { exact: true })).toBeVisible()
    await expect(moderator.getByRole('button', { name: 'Approve correction', exact: true })).toHaveCount(0)
    if (process.env['TOWNSQUARE_REVIEW_MODE'] === 'local') {
      // Exercise the approval-note UI on the isolated local database without
      // publishing artificial activity to the real deployment.
      const approval = await page.request.post('/api/contributions', { headers: { Origin: baseURL! }, data: { type: 'correction', content: { targetRef: place.id, targetLabel: place.name, field: 'name', beforeValue: place.name, newValue: place.name, reason: 'Local approval-note regression. The public value is unchanged.' } } })
      expect(approval.ok()).toBe(true)
      const approvalId = (await approval.json()).contribution.id
      await moderator.goto('/review')
      await moderator.getByRole('button').filter({ hasText: `@${resident}` }).click()
      const approvedNote = 'The existing name is confirmed. This approval note must remain visible to its author.'
      await moderator.getByRole('textbox', { name: 'Note to the neighbor', exact: true }).fill(approvedNote)
      await moderator.getByRole('button', { name: 'Approve correction', exact: true }).click()
      await expect(moderator.getByRole('heading', { name: 'Correction published', exact: true })).toBeVisible()
      await page.goto('/contribute')
      await expect(page.getByText(approvedNote, { exact: true })).toBeVisible()
      await page.reload()
      await expect(page.getByText(approvedNote, { exact: true })).toBeVisible()
      expect((await (await page.request.get('/api/contributions')).json()).contributions.find((row: { id: string }) => row.id === approvalId)).toMatchObject({ status: 'published', decisionNote: approvedNote })
    }


  } finally {
    if (promoted) {
      provision(reviewer, 'user')
      expect((await moderator.request.get('/api/review/contributions')).status()).toBe(404)
    }
    if (competingId) await page.request.post(`/api/contributions/${competingId}/withdraw`, { headers: { Origin: baseURL! }, data: {} })
    if (!declined) await page.request.post(`/api/contributions/${id}/withdraw`, { headers: { Origin: baseURL! }, data: {} })
    await moderatorContext.close()
  }
})

/** This operator-only check publishes one sourced, formatting-only correction.
 * It is disabled in normal suites and never publishes invented QA listing data. */
test('operator approves a sourced phone format correction through the review UI', async ({ page, browser, baseURL }, testInfo) => {
  test.skip(process.env['TOWNSQUARE_APPROVE_SOURCE_CORRECTION'] !== '1' || testInfo.project.name !== 'desktop', 'Requires explicit approval of this particular sourced public correction')
  test.setTimeout(180_000)
  expect(process.env['TOWNSQUARE_REVIEW_MODE']).toBe('railway')
  expect(baseURL).toBe('https://townsquare-live-production.up.railway.app')
  const target = 'biz-retro-roasts-d2ywzpsi'
  const phone = '+1 479-219-9155'
  const directory = await (await page.request.get('/api/directory')).json()
  const place = directory.places.find((row: { id: string }) => row.id === target)
  expect(place).toBeTruthy()
  expect(place.phone.replace(/\D/g, '').replace(/^1(?=\d{10}$)/, '')).toBe('4792199155')
  test.skip(place.phone === phone, 'The sourced formatting correction is already published')
  const resident = `qa_${Date.now().toString(36)}_${randomBytes(2).toString('hex')}`
  const reviewer = `qa_${Date.now().toString(36)}_${randomBytes(2).toString('hex')}`
  await register(page, resident, randomBytes(24).toString('base64url'))
  const reason = 'Formatting-only normalization of the existing phone number to +1 479-219-9155. The official https://www.retroroasts.com/ Contact section identifies 479-219-9155 for its W. 2nd location, checked October 1, 2026. This does not change the phone identity or claim new business activity.'
  const submission = await page.request.post('/api/contributions', { headers: { Origin: baseURL! }, data: { type: 'correction', content: { targetRef: target, targetLabel: place.name, field: 'phone', beforeValue: place.phone, newValue: phone, reason } } })
  expect(submission.ok()).toBe(true)
  const id = (await submission.json()).contribution.id as string
  const moderatorContext = await browser.newContext({ baseURL })
  const moderator = await moderatorContext.newPage()
  let promoted = false
  let published = false
  try {
    await register(moderator, reviewer, randomBytes(24).toString('base64url'))
    provision(reviewer, 'moderator')
    promoted = true
    await moderator.goto('/review')
    await moderator.getByRole('button').filter({ hasText: `@${resident}` }).click()
    await expect(moderator.getByText(reason, { exact: true })).toBeVisible()
    await expect(moderator.getByRole('heading', { name: 'Proposed change', exact: true })).toBeVisible()
    await moderator.getByRole('textbox', { name: 'Note to the neighbor', exact: true }).fill('Confirmed against the official Retro Roasts website: the W. 2nd location lists 479-219-9155. Approved phone formatting only; the destination number is unchanged.')
    await moderator.screenshot({ path: testInfo.outputPath('sourced-correction-before-approval.png'), fullPage: true })
    await moderator.getByRole('button', { name: 'Approve correction', exact: true }).click()
    await expect(moderator.getByRole('heading', { name: 'Correction published', exact: true })).toBeVisible()
    published = true
    await expect.poll(async () => {
      const payload = await (await page.request.get('/api/directory')).json()
      return payload.places.find((row: { id: string }) => row.id === target)?.phone
    }, { timeout: 75_000, intervals: [3000] }).toBe(phone)
    const businesses = await (await page.request.get('/api/businesses?tag=coffee&limit=200')).json()
    expect(businesses.items.find((row: { id: string }) => row.id === target)?.phone).toBe(phone)
    await page.goto('/contribute')
    await expect(page.getByText('Confirmed against the official Retro Roasts website: the W. 2nd location lists 479-219-9155. Approved phone formatting only; the destination number is unchanged.', { exact: true })).toBeVisible()
    await page.screenshot({ path: testInfo.outputPath('sourced-correction-published.png'), fullPage: true })
    await testInfo.attach('public-correction-evidence', { body: JSON.stringify({ target, field: 'phone', before: place.phone, after: phone, contributionId: id, source: 'https://www.retroroasts.com/', checkedAt: '2026-10-01', directoryVerified: true, businessesVerified: true }, null, 2), contentType: 'application/json' })
  } finally {
    if (promoted) {
      provision(reviewer, 'user')
      expect((await moderator.request.get('/api/review/contributions')).status()).toBe(404)
    }
    if (!published) await page.request.post(`/api/contributions/${id}/withdraw`, { headers: { Origin: baseURL! }, data: {} })
    await moderatorContext.close()
  }
})
