import { randomBytes } from 'node:crypto'
import { expect, test, type Page, type TestInfo } from '@playwright/test'

async function screenshot(page: Page, testInfo: TestInfo, name: string) {
  const path = testInfo.outputPath(`${name}.png`)
  await page.screenshot({ path, fullPage: true })
  await testInfo.attach(name, { path, contentType: 'image/png' })
}

async function healthyLayout(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true)
}

test('guest discovers local content through direct links and responsive screens', async ({ page }, testInfo) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.goto('/')
  await expect(page.getByRole('button', { name: 'Sign in', exact: true }).first()).toBeVisible()
  await expect(page.locator('body')).toContainText('Russellville')
  await healthyLayout(page)
  await screenshot(page, testInfo, 'today')

  await page.goto('/places')
  await expect(page.getByRole('button', { name: /^Eat and drink/ }).first()).toBeVisible()
  await healthyLayout(page)
  await screenshot(page, testInfo, 'places')
  await page.reload()
  await expect(page.getByRole('button', { name: /^Eat and drink/ }).first()).toBeVisible()

  await page.goto('/weekend')
  await expect(page.getByRole('heading', { name: 'Make a day of it.', exact: true }).first()).toBeVisible()
  await healthyLayout(page)
  await screenshot(page, testInfo, 'weekend')
  await page.goBack()
  await expect(page).toHaveURL(/\/places$/)
  expect(errors).toEqual([])
})

test('resident account, save, new session, correction status, and protected review', async ({ page, browser, baseURL }, testInfo) => {
  const handle = `qa_${Date.now().toString(36)}_${randomBytes(2).toString('hex')}`
  const password = randomBytes(24).toString('base64url')
  await page.goto('/account')
  await page.getByRole('button', { name: 'New here? Create an account' }).click()
  await page.getByLabel('Handle', { exact: true }).fill(handle)
  await page.getByLabel('Password', { exact: true }).fill(password)
  await page.getByRole('button', { name: 'Create my account' }).click()
  await expect(page.getByRole('heading', { name: `@${handle}`, exact: true })).toBeVisible()
  await expect(page.getByText('Not verified', { exact: true })).toBeVisible()
  await screenshot(page, testInfo, 'account')

  await page.goto('/places')
  await page.getByRole('button', { name: /^Eat and drink/ }).first().click()
  const save = page.getByRole('button', { name: /^Save / }).first()
  await expect(save).toBeVisible()
  const savedName = (await save.getAttribute('aria-label'))!.replace(/^Save /, '')
  await save.click()
  await expect(page.getByRole('button', { name: `Remove ${savedName} from your saved things`, exact: true }).first()).toBeVisible()
  await page.goto('/saved')
  await expect(page.getByRole('button', { name: savedName, exact: true })).toBeVisible()
  await page.reload()
  await expect(page.getByRole('button', { name: savedName, exact: true })).toBeVisible()
  await screenshot(page, testInfo, 'saved')
  await page.goto('/account')
  await page.getByRole('button', { name: 'Sign out', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Welcome back', exact: true })).toBeVisible()
  expect(await (await page.request.get('/api/auth/me')).json()).toBeNull()

  // No storage state is copied. This is a genuinely new browser session.
  const context = await browser.newContext({ baseURL, viewport: page.viewportSize() ?? { width: 1440, height: 1000 } })
  const returning = await context.newPage()
  try {
    await returning.goto('/account')
    await returning.getByLabel('Handle', { exact: true }).fill(handle)
    await returning.getByLabel('Password', { exact: true }).fill(password)
    await returning.getByRole('button', { name: 'Sign in', exact: true }).click()
    await expect(returning.getByRole('heading', { name: `@${handle}`, exact: true })).toBeVisible()
    await returning.goto('/saved')
    await expect(returning.getByRole('button', { name: savedName, exact: true })).toBeVisible()
    expect((await returning.request.get('/api/review/contributions')).status()).toBe(404)

    await returning.goto('/contribute?new=1')
    await returning.getByRole('button', { name: /A correction/ }).click()
    await returning.getByRole('combobox', { name: 'Which listing' }).fill(savedName)
    await returning.getByRole('option').filter({ hasText: savedName }).first().click()
    await returning.getByRole('button', { name: 'Name', exact: true }).click()
    // The proposed name equals the existing name: even accidental approval
    // cannot introduce invented business facts. The note makes QA explicit.
    await returning.getByLabel('Corrected value', { exact: true }).fill(savedName)
    await returning.getByLabel('How do you know', { exact: true }).fill('QA validation only. Please decline; no public data change requested. This checks that a neighbor can submit a correction and revisit its status.')
    const submitted = returning.waitForResponse((response) => response.url().endsWith('/api/contributions') && response.request().method() === 'POST')
    await returning.getByRole('button', { name: 'Send correction', exact: true }).click()
    const response = await submitted
    expect(response.ok()).toBe(true)
    const result = await response.json()
    expect(result.outcome).toBe('queued')
    const contributionId = result.contribution.id as string
    await expect(returning.getByText('A moderator has this.', { exact: true })).toBeVisible()
    await screenshot(returning, testInfo, 'correction-queued')
    await returning.goto('/contribute')
    await expect(returning.getByText('Being read', { exact: true })).toBeVisible()
    await returning.reload()
    await expect(returning.getByText('Being read', { exact: true })).toBeVisible()
    const refused = await returning.request.post(`/api/review/contributions/${contributionId}/decide`, { headers: { Origin: baseURL! }, data: { decision: 'approve', note: 'must not be accepted' } })
    expect(refused.status()).toBe(404)
    const mine = await (await returning.request.get('/api/contributions')).json()
    expect(mine.contributions.find((row: { id: string }) => row.id === contributionId).status).toBe('queued')
    await screenshot(returning, testInfo, 'contributions')
    // Leave no QA task in a real moderator's queue once evidence is captured.
    await returning.getByRole('button', { name: 'Withdraw it', exact: true }).click()
    await expect(returning.getByText('Withdrawn', { exact: true })).toBeVisible()
  } finally { await context.close() }
})

test('Today details, search, direct-link refresh, browser back and town map use live items', async ({ page }, testInfo) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  const today = await (await page.request.get('/api/today')).json()
  expect(today.lead?.id, 'A real current story must be available for the discovery journey').toBeTruthy()
  expect(today.events.items.length, 'A real current event must be available for the discovery journey').toBeGreaterThan(0)
  await page.goto('/')
  await page.getByRole('button').filter({ has: page.getByRole('heading', { name: today.lead.title, exact: true }) }).click()
  await expect(page).toHaveURL(new RegExp(`/news/${today.lead.id}$`))
  await expect(page.getByRole('heading', { level: 1, name: today.lead.title, exact: true })).toBeVisible()
  await expect(page.getByRole('link', { name: /Read the full story at/ })).toBeVisible()
  await screenshot(page, testInfo, 'story-detail')
  await page.reload()
  await expect(page.getByRole('heading', { level: 1, name: today.lead.title, exact: true })).toBeVisible()
  await page.goBack()
  await expect(page).toHaveURL(/\/$/)
  const event = today.events.items[0]
  await page.getByRole('button').filter({ hasText: event.title }).first().click()
  await expect(page).toHaveURL(new RegExp(`/events/${event.id}$`))
  await expect(page.getByRole('heading', { level: 1, name: event.title, exact: true })).toBeVisible()
  await expect(page.locator('.ev-source')).toContainText('From')
  await healthyLayout(page)
  await screenshot(page, testInfo, 'event-detail')
  await page.reload()
  await expect(page.getByRole('heading', { level: 1, name: event.title, exact: true })).toBeVisible()
  const directory = await (await page.request.get('/api/directory')).json()
  const place = directory.places.find((item: { group: string; name: string }) => item.group === 'eat' && item.name.length < 35)
  expect(place).toBeTruthy()
  await page.goto('/')
  const search = page.getByRole('button', { name: 'Search Russellville', exact: true })
  await search.click()
  const dialog = page.getByRole('dialog', { name: 'Search Russellville', exact: true })
  await dialog.getByRole('searchbox', { name: 'Search Russellville', exact: true }).fill(place.name)
  await dialog.getByRole('button').filter({ hasText: place.name }).first().click()
  await expect(page).toHaveURL(new RegExp(`/places/${place.id}$`))
  await expect(page.getByRole('dialog', { name: place.name, exact: true })).toBeVisible()
  await expect(page.getByRole('dialog', { name: place.name, exact: true }).getByRole('link', { name: /Directions/ }).first()).toBeVisible()
  await screenshot(page, testInfo, 'place-detail')
  await page.reload()
  await expect(page.getByRole('dialog', { name: place.name, exact: true })).toBeVisible()
  await expect(page.getByRole('dialog', { name: place.name, exact: true }).getByRole('heading', { name: place.name, exact: true })).toBeFocused()
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog', { name: place.name, exact: true })).toBeHidden()
  await page.goto('/places?view=map')
  await expect(page.getByRole('img', { name: /^(OpenStreetMap map of Russellville|A map of the town)/ })).toBeVisible()
  await page.getByRole('button', { name: 'Zoom in', exact: true }).click()
  await page.getByRole('button', { name: 'Zoom out', exact: true }).click()
  await page.getByRole('button', { name: 'List', exact: true }).last().click()
  await expect(page).toHaveURL(/\/places\?view=list$/)
  await page.reload()
  await expect(page.getByRole('button', { name: 'Map', exact: true })).toBeVisible()
  await expect(page.getByRole('img', { name: /^OpenStreetMap map/ })).toHaveCount(0)
  await page.getByRole('button', { name: 'Map', exact: true }).click()
  await expect(page).toHaveURL(/\/places\?view=map$/)
  await expect(page.getByRole('img', { name: /^OpenStreetMap map/ })).toBeVisible()
  await healthyLayout(page)
  await screenshot(page, testInfo, 'town-map')
  expect(errors).toEqual([])
})

test('day planner keeps choices through account creation and saves real stops across a new session', async ({ page, browser, baseURL }, testInfo) => {
  await page.goto('/weekend')
  await expect(page.getByRole('heading', { name: 'Make a day of it.', exact: true })).toBeVisible()
  const coffee = page.getByRole('combobox', { name: 'Coffee or bakery', exact: true })
  const food = page.getByRole('combobox', { name: 'Restaurant', exact: true })
  await expect.poll(() => coffee.locator('option').count()).toBeGreaterThan(1)
  await expect.poll(() => food.locator('option').count()).toBeGreaterThan(1)
  await coffee.selectOption({ index: 1 })
  await food.selectOption({ index: 1 })
  const coffeeName = (await coffee.locator('option:checked').textContent())!
  const foodName = (await food.locator('option:checked').textContent())!
  const day = page.getByLabel('Your day', { exact: true })
  let date = await day.inputValue()
  let calendar = await (await page.request.get(`/api/events?day=${date}`)).json()
  let events = calendar.segments.flatMap((segment: { kind: string; rows?: unknown[] }) => segment.kind === 'rows' ? segment.rows : [])
  if (!events.length && calendar.next) {
    date = calendar.next.day
    await day.fill(date)
    calendar = await (await page.request.get(`/api/events?day=${date}`)).json()
    events = calendar.segments.flatMap((segment: { kind: string; rows?: unknown[] }) => segment.kind === 'rows' ? segment.rows : [])
  }
  expect(events.length, 'The itinerary uses a published event, never a manufactured one').toBeGreaterThan(0)
  const eventName = events[0].title as string
  await page.getByRole('button').filter({ hasText: eventName }).first().click()
  await page.getByRole('button', { name: 'Sign in to save stops', exact: true }).click()
  await expect(page).toHaveURL(/\/account\?next=/)
  const handle = `qa_${Date.now().toString(36)}_${randomBytes(2).toString('hex')}`
  const password = randomBytes(24).toString('base64url')
  await page.getByRole('button', { name: 'New here? Create an account' }).click()
  await page.getByLabel('Handle', { exact: true }).fill(handle)
  await page.getByLabel('Password', { exact: true }).fill(password)
  await page.getByRole('button', { name: 'Create my account' }).click()
  await expect(page).toHaveURL(/\/weekend$/)
  await expect(page.locator('.dayout-summary')).toContainText(coffeeName)
  await expect(page.locator('.dayout-summary')).toContainText(foodName)
  await expect(page.locator('.dayout-summary')).toContainText(eventName)
  await page.getByRole('button', { name: 'Save my stops', exact: true }).click()
  await expect(page.getByRole('status')).toContainText('Your stops are saved.')
  await screenshot(page, testInfo, 'day-plan-saved')
  await page.reload()
  await expect(coffee.locator('option:checked')).toHaveText(coffeeName)
  await expect(food.locator('option:checked')).toHaveText(foodName)
  await page.goto('/saved')
  for (const name of [coffeeName, foodName, eventName]) await expect(page.getByRole('button', { name, exact: true })).toBeVisible()
  await screenshot(page, testInfo, 'day-plan-in-saved')
  await page.goto('/account')
  await page.getByRole('button', { name: 'Sign out', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Welcome back', exact: true })).toBeVisible()
  const context = await browser.newContext({ baseURL, viewport: page.viewportSize() ?? { width: 1440, height: 1000 } })
  try {
    const again = await context.newPage()
    await again.goto('/account?next=%2Fsaved')
    await again.getByLabel('Handle', { exact: true }).fill(handle)
    await again.getByLabel('Password', { exact: true }).fill(password)
    await again.getByRole('button', { name: 'Sign in', exact: true }).click()
    await expect(again).toHaveURL(/\/saved$/)
    for (const name of [coffeeName, foodName, eventName]) await expect(again.getByRole('button', { name, exact: true })).toBeVisible()
  } finally { await context.close() }
})

test('empty search, failed requests and missing photos remain usable with a keyboard', async ({ page }, testInfo) => {
  await page.route('**/api/images/**', (route) => route.fulfill({ status: 404, body: '' }))
  await page.goto('/')
  await expect(page.locator('.daily-lead .daily-source-art')).toBeVisible()
  await expect(page.locator('.daily-lead img')).toHaveCount(0)
  await screenshot(page, testInfo, 'photo-fallback')
  const opener = page.getByRole('button', { name: 'Search Russellville', exact: true })
  await opener.focus()
  await page.keyboard.press('Enter')
  const dialog = page.getByRole('dialog', { name: 'Search Russellville', exact: true })
  const input = dialog.getByRole('searchbox', { name: 'Search Russellville', exact: true })
  await expect(input).toBeFocused()
  await input.fill('qa-no-place-with-this-unique-name-849217')
  await expect(dialog).toContainText('Nothing in Russellville is filed under')
  await page.keyboard.press('Escape')
  await expect(dialog).toBeHidden()
  await expect(opener).toBeFocused()
  await page.route('**/api/directory', (route) => route.fulfill({ status: 503, contentType: 'application/json', body: '{"error":"unavailable"}' }))
  await page.goto('/places')
  await expect(page.getByRole('button', { name: 'Try again', exact: true })).toBeVisible()
  await screenshot(page, testInfo, 'directory-unavailable')
  await page.unroute('**/api/directory')
  await page.getByRole('button', { name: 'Try again', exact: true }).click()
  await expect(page.getByRole('button', { name: /^Eat and drink/ }).first()).toBeVisible()
  await healthyLayout(page)
})

test('Lunch around town runs on its separate origin and cannot read resident identity', async ({ page, baseURL }, testInfo) => {
  const handle = `qa_${Date.now().toString(36)}_${randomBytes(2).toString('hex')}`
  const password = randomBytes(24).toString('base64url')
  await page.goto('/account')
  await page.getByRole('button', { name: 'New here? Create an account', exact: true }).click()
  await page.getByLabel('Handle', { exact: true }).fill(handle)
  await page.getByLabel('Password', { exact: true }).fill(password)
  await page.getByRole('button', { name: 'Create my account', exact: true }).click()
  await expect(page.getByRole('heading', { name: `@${handle}`, exact: true })).toBeVisible()
  const catalogue = await (await page.request.get('/api/creations')).json()
  const creation = catalogue.find((item: { slug: string }) => item.slug === 'burrito-index')
  expect(creation.name).toBe('Lunch around town')
  expect(new URL(creation.origin).origin).not.toBe(new URL(baseURL!).origin)
  expect(creation.manifest.permissions.identity).toBe('none')
  await page.goto('/creations/burrito-index/open')
  const iframe = page.locator('iframe')
  const guest = iframe.contentFrame()
  await expect(guest.getByRole('heading', { name: 'Lunch around town', exact: true })).toBeVisible()
  await expect(guest.getByRole('status')).toContainText('places to explore')
  const firstName = (await guest.locator('#list h2').first().textContent())!
  await guest.getByRole('searchbox', { name: 'Find a restaurant', exact: true }).fill(firstName)
  await expect(guest.locator('#list h2').first()).toHaveText(firstName)
  await screenshot(page, testInfo, 'creation-running')
  const frame = await (await iframe.elementHandle())!.contentFrame()
  expect(frame).not.toBeNull()
  const boundary = await frame!.evaluate(async (shellOrigin) => {
    let parentReadable = false
    try { parentReadable = Boolean(window.parent.document.body) } catch { /* Browser must deny it. */ }
    const moduleName = '@townsquare/sdk'
    const sdk = await import(moduleName)
    let identityCode = 'unexpected-success'
    try { await sdk.user.current() } catch (error) { identityCode = (error as { code: string }).code }
    const violations: string[] = []
    const recordViolation = (event: SecurityPolicyViolationEvent) => violations.push(event.effectiveDirective)
    document.addEventListener('securitypolicyviolation', recordViolation)
    let directRequestBlocked = false
    try { await fetch(`${shellOrigin}/api/auth/me`, { credentials: 'include' }) } catch { directRequestBlocked = true }
    await new Promise((resolve) => setTimeout(resolve, 100))
    document.removeEventListener('securitypolicyviolation', recordViolation)
    return { parentReadable, identityCode, sessionVisible: document.cookie.includes('tsq_session'), directRequestBlocked, violations }
  }, baseURL!)
  expect(boundary.parentReadable).toBe(false)
  expect(boundary.identityCode).toBe('permission_denied')
  expect(boundary.sessionVisible).toBe(false)
  expect(boundary.directRequestBlocked).toBe(true)
  expect(boundary.violations).toContain('connect-src')
  const sessionCookie = (await page.context().cookies(baseURL!)).find((cookie) => cookie.name.includes('tsq_session'))
  expect(sessionCookie?.httpOnly).toBe(true)
  if (baseURL!.startsWith('https://')) expect(sessionCookie?.secure).toBe(true)
})


test('a delayed creation catalogue does not close an active search', async ({ page }) => {
  let release!: () => void
  const ready = new Promise<void>((resolve) => { release = resolve })
  await page.route('**/api/creations', async (route) => {
    const response = await route.fetch()
    await ready
    await route.fulfill({ response })
  })
  await page.goto('/')
  await page.getByRole('button', { name: 'Search Russellville', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: 'Search Russellville', exact: true })
  await expect(dialog).toBeVisible()
  const completed = page.waitForResponse((response) => response.url().endsWith('/api/creations'))
  release()
  await (await completed).finished()
  await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))))
  await expect(dialog).toBeVisible()
  await dialog.getByRole('searchbox').fill('Lake Dardanelle')
  await expect(dialog.getByRole('searchbox')).toHaveValue('Lake Dardanelle')
})


test('a delayed saves response cannot cross a sign-out and account switch', async ({ page, baseURL }) => {
  const register = async () => {
    const handle = `qa_${Date.now().toString(36)}_${randomBytes(2).toString('hex')}`
    await page.getByRole('button', { name: 'New here? Create an account', exact: true }).click()
    await page.getByLabel('Handle', { exact: true }).fill(handle)
    await page.getByLabel('Password', { exact: true }).fill(randomBytes(24).toString('base64url'))
    await page.getByRole('button', { name: 'Create my account', exact: true }).click()
    await expect(page.getByRole('heading', { name: `@${handle}`, exact: true })).toBeVisible()
    return handle
  }
  await page.goto('/account')
  const initialSaves = page.waitForResponse(response => response.url().endsWith('/api/yours'))
  await register()
  await (await initialSaves).finished()
  const directory = await (await page.request.get('/api/directory')).json()
  const place = directory.places[0]
  expect((await page.request.post('/api/saves', { headers: { Origin: baseURL! }, data: { kind: 'business', refId: place.id, title: place.name } })).ok()).toBe(true)
  let release!: () => void
  let captured!: () => void
  const hold = new Promise<void>(resolve => { release = resolve })
  const pending = new Promise<void>(resolve => { captured = resolve })
  let first = true
  await page.route('**/api/yours', async route => {
    if (!first) { await route.continue(); return }
    first = false
    const response = await route.fetch()
    captured()
    await hold
    await route.fulfill({ response })
  })
  await page.reload()
  await pending
  await page.getByRole('button', { name: 'Sign out', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Welcome back', exact: true })).toBeVisible()
  const emptySaves = page.waitForResponse(response => response.url().endsWith('/api/yours'))
  await register()
  expect((await (await emptySaves).json()).saves).toEqual([])
  const oldResponse = page.waitForResponse(response => response.url().endsWith('/api/yours'))
  release()
  await (await oldResponse).finished()
  await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))))
  // Use client navigation so a document reload cannot hide stale React state.
  await page.getByRole('button', { name: 'Back', exact: true }).click()
  await page.getByRole('button', { name: 'Yours', exact: true }).click()
  await expect(page).toHaveURL(/\/saved$/)
  await expect(page.getByRole('button', { name: place.name, exact: true })).toHaveCount(0)
  expect((await (await page.request.get('/api/yours')).json()).saves).toEqual([])
})
