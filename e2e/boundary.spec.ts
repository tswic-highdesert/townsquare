/**
 * The sandbox boundary suite.
 *
 * Numbered against the threat model in `design/design-sandbox-and-bridge.md` §7,
 * so a reviewer can read a row of that table and find the test that holds it up.
 *
 * The rule for this file: assert on what the browser actually did, never on the
 * absence of an exception. "It didn't crash" is not evidence that an escape
 * failed. Where the browser deliberately gives an opaque answer — an image load
 * error, for instance — the assertion goes through the `securitypolicyviolation`
 * event, which is the browser telling us first-hand that it blocked something.
 */

import { test, expect, type Frame, type Page } from '@playwright/test'

const SANDBOX_PORT = process.env['BOUNDARY_SANDBOX_PORT'] ?? '4412'
const SANDBOX_ORIGIN_SUFFIX = `.tsq-apps.localhost:${SANDBOX_PORT}`
const SHELL = `http://townsquare.localhost:${process.env['BOUNDARY_SHELL_PORT'] ?? '4410'}`
const API = `http://127.0.0.1:${process.env['BOUNDARY_API_PORT'] ?? '4411'}`

interface Probe {
  outcome?: string
  value?: string
  error?: string
  message?: string
}

interface AttackResults {
  [key: string]: Probe | unknown
  secret: string
  violations: Array<{ directive: string; blocked: string }>
}

/**
 * Walk the shell: Today → gallery → trust page → running, and hand back the
 * guest frame.
 *
 * The landing screen is Today, which features one creation rather than listing
 * them all, so the walk goes through the gallery — that is the screen that can
 * name a specific creation, and these tests each want a specific one.
 *
 * Frames are re-queried rather than captured once. React StrictMode mounts
 * effects twice in development, so the host builds a frame, tears it down, and
 * builds another — and teardown *removes the element*, deliberately, because a
 * frame is never reused across creations. A handle taken too early therefore
 * points at a detached frame.
 */
async function openCreation(page: Page, name: string): Promise<Frame> {
  await page.goto(`${SHELL}/creations`)
  await page.getByRole('button', { name: new RegExp(name, 'i') }).click()
  await expect(page.getByText('What it can touch')).toBeVisible()
  await page.getByRole('button', { name: 'Open' }).click()
  return liveGuestFrame(page)
}

/** The most recent attached frame on a bundle origin, or throw with what we saw. */
async function liveGuestFrame(page: Page, timeoutMs = 20_000): Promise<Frame> {
  const deadline = Date.now() + timeoutMs
  let last = ''

  while (Date.now() < deadline) {
    const candidates = page.frames().filter((f) => f.url().includes(SANDBOX_ORIGIN_SUFFIX))
    for (const frame of candidates.reverse()) {
      if (frame.isDetached()) continue
      try {
        // Prove it is alive and has a document before handing it over.
        await frame.evaluate(() => document.readyState)
        return frame
      } catch {
        // Detached between the check and the call. Try the next one.
      }
    }
    last = page.frames().map((f) => f.url()).join(', ')
    await page.waitForTimeout(200)
  }
  throw new Error(`no live guest frame after ${timeoutMs}ms; frames: ${last}`)
}

async function attackResults(page: Page): Promise<AttackResults> {
  await openCreation(page, 'Neighborhood Watch')

  const deadline = Date.now() + 25_000
  while (Date.now() < deadline) {
    const frame = await liveGuestFrame(page)
    try {
      const results = await frame.evaluate(
        () => (window as never as { __attackResults?: AttackResults }).__attackResults ?? null,
      )
      if (results) return results
    } catch {
      // The frame went away mid-probe. Get the current one and keep waiting.
    }
    await page.waitForTimeout(250)
  }
  throw new Error('the attacker never published its results')
}

// ─────────────────────────────────────────────────────────────────────────────

test.describe('the frame is a real boundary', () => {
  let results: AttackResults

  test.beforeAll(async ({ browser }) => {
    const page = await browser.newPage()
    results = await attackResults(page)
    await page.close()
  })

  test('#1 the guest cannot read the embedder DOM', () => {
    // A different registrable domain, so `window.parent` is opaque. This is
    // also what makes `allow-scripts` with `allow-same-origin` safe here: the
    // "delete your own sandbox attribute" escape needs parent access.
    expect(results['parentDocument']).toMatchObject({ outcome: 'threw' })
    expect(results['topDocument']).toMatchObject({ outcome: 'threw' })
    expect(results['parentLocation']).toMatchObject({ outcome: 'threw' })
  })

  test('#2 the guest cannot reach its own sandbox attribute to remove it', () => {
    expect(results['frameElement']).toMatchObject({ outcome: 'threw' })
  })

  test('#3 no session cookie is reachable from a creation origin', () => {
    // Not a policy we enforce — the cookie is scoped to the shell's domain, so
    // the cookie jar makes it structurally unreachable from here.
    expect(results['cookie']).toMatchObject({ outcome: 'returned', value: '' })
  })

  test('#13 code the reviewer never saw cannot run', () => {
    // Built from string fragments, so the publish-time validator never saw an
    // `eval(` to reject. The CSP is what stops it, which is the point.
    expect(results['eval']).toMatchObject({ outcome: 'threw', error: 'EvalError' })
    expect(results['newFunction']).toMatchObject({ outcome: 'threw', error: 'EvalError' })
  })

  test('#8 window.open is not available as an egress channel', () => {
    expect(results['windowOpen']).toMatchObject({ outcome: 'returned', value: 'null' })
  })
})

test.describe('exfiltration', () => {
  let results: AttackResults

  test.beforeAll(async ({ browser }) => {
    const page = await browser.newPage()
    results = await attackResults(page)
    await page.close()
  })

  const blockedBy = (r: AttackResults, directive: string) =>
    r.violations.filter((v) => v.directive === directive)

  test('#5 fetch to an undeclared host is refused', () => {
    expect(results['fetchUndeclared']).toMatchObject({ outcome: 'rejected' })
    expect(blockedBy(results, 'connect-src').length).toBeGreaterThan(0)
  })

  test('#6 an image beacon is blocked, which is the bypass people miss', () => {
    // `new Image().src = url + secret` needs no response to leak, so img-src
    // has to be exactly as tight as connect-src. Asserted through the
    // violation event, because an <img> error is deliberately opaque and
    // cannot distinguish "blocked" from "404".
    expect(blockedBy(results, 'img-src').length).toBeGreaterThan(0)
    expect(results['imageBeacon']).toMatchObject({ outcome: 'errored' })
  })

  test('#7 a form POST offsite is blocked', () => {
    expect(blockedBy(results, 'form-action').length).toBeGreaterThan(0)
  })

  test('#9 a nested frame cannot be used as a fetch context', () => {
    expect(blockedBy(results, 'frame-src').length).toBeGreaterThan(0)
  })

  test('#13 a blob worker cannot become an unpoliced fetch context', () => {
    const stopped =
      blockedBy(results, 'worker-src').length > 0 ||
      (results['blobWorker'] as Probe)?.outcome === 'threw'
    expect(stopped).toBe(true)
  })

  test('the secret never left: every attempt is accounted for', () => {
    expect(results.secret).toMatch(/^SECRET-/)
    // Nothing reached evil.example by any route. If a channel had worked, its
    // probe would read "resolved" or "loaded" rather than appearing here.
    expect(results.violations.length).toBeGreaterThanOrEqual(3)
  })
})

test.describe('the bridge holds when the SDK is bypassed', () => {
  let results: AttackResults

  test.beforeAll(async ({ browser }) => {
    const page = await browser.newPage()
    results = await attackResults(page)
    await page.close()
  })

  const reply = (r: AttackResults, id: string) =>
    r[`bridge:${id}`] as { ok: boolean; error?: { code: string } } | undefined

  test('#21 hand-written port messages asserting their own grants gain nothing', () => {
    // The message carries a full `grants` object claiming everything. The host
    // reads the frozen manifest on the version row and ignores every word.
    expect(reply(results, 'atk-identity')).toMatchObject({
      ok: false,
      error: { code: 'permission_denied' },
    })
    expect(reply(results, 'atk-write')).toMatchObject({
      ok: false,
      error: { code: 'permission_denied' },
    })
    expect(reply(results, 'atk-read')).toMatchObject({
      ok: false,
      error: { code: 'permission_denied' },
    })
    expect(reply(results, 'atk-storage')).toMatchObject({
      ok: false,
      error: { code: 'permission_denied' },
    })
  })

  test('#19 a prototype-shaped method resolves to nothing', () => {
    expect(reply(results, 'atk-unknown')).toMatchObject({
      ok: false,
      error: { code: 'invalid_request' },
    })
  })

  test('a call the creation is genuinely allowed still works', () => {
    // The suite would be worthless if everything failed. town.* needs no
    // declaration, so this must succeed.
    expect(reply(results, 'atk-town')).toMatchObject({ ok: true })
  })

  test('#27 a forged second init cannot take over the established channel', () => {
    expect(results['secondInitAccepted']).toBeUndefined()
  })

  test('#20 editing the served manifest buys nothing', () => {
    // The bundle's own townsquare.json is readable — source is public by
    // design. It is simply never what the runtime reads.
    expect(results['manifestFetch']).toMatchObject({ readable: true })
    expect(reply(results, 'atk-write')).toMatchObject({ ok: false })
  })
})

test.describe('the served response', () => {
  test('#24 path traversal is a 404, because there is no filesystem to traverse', async ({
    request,
  }) => {
    const origin = await creationOrigin(request, 'Neighborhood Watch')
    for (const attempt of [
      '/../../etc/passwd',
      '/%2e%2e/%2e%2e/etc/passwd',
      '/..%2findex.html',
      '/%252e%252e/index.html',
      '/.env',
    ]) {
      const res = await fetchBundle(request, origin, attempt)
      expect(res.status(), attempt).toBe(404)
    }
  })

  test('#25 an extension with no allowlisted type is a 404, never a download', async ({
    request,
  }) => {
    const origin = await creationOrigin(request, 'Neighborhood Watch')
    const res = await fetchBundle(request, origin, '/payload.wasm')
    expect(res.status()).toBe(404)
    expect(res.headers()['content-type']).not.toContain('octet-stream')
  })

  test('the CSP header is pinned, so nobody can loosen it without a visible diff', async ({
    request,
  }) => {
    const origin = await creationOrigin(request, 'Neighborhood Watch')
    const res = await fetchBundle(request, origin, '/')
    expect(res.headers()['content-security-policy']).toBe(
      "default-src 'none'; " +
        "script-src 'self' 'unsafe-inline'; " +
        "style-src 'self' 'unsafe-inline'; " +
        "img-src 'self' data: https://tile.openstreetmap.org; " +
        "font-src 'self' data: https://tile.openstreetmap.org; " +
        "media-src 'self' https://tile.openstreetmap.org; " +
        "connect-src 'self' https://tile.openstreetmap.org; " +
        "frame-src 'none'; " +
        "child-src 'none'; " +
        "object-src 'none'; " +
        "base-uri 'none'; " +
        "form-action 'none'; " +
        "worker-src 'self'; " +
        // The shell, not 'self'. A creation is framed by the shell, which is a
        // different registrable domain by design, so 'self' here would mean
        // nothing could ever embed a creation at all.
        `frame-ancestors ${SHELL}`,
    )
  })

  test('#3 the bundle origin never sets a cookie', async ({ request }) => {
    const origin = await creationOrigin(request, 'Neighborhood Watch')
    for (const path of ['/', '/index.html', '/_ts/sdk/1/sdk.js', '/nope']) {
      const res = await fetchBundle(request, origin, path)
      expect(Object.keys(res.headers()).map((h) => h.toLowerCase()), path).not.toContain(
        'set-cookie',
      )
    }
  })

  test('a misdirected Host gets 421, not somebody else content', async ({ request }) => {
    for (const host of ['evil.example', 'evil-tsq-apps.localhost', 'a.b.tsq-apps.localhost']) {
      const res = await request.get(`http://127.0.0.1:${SANDBOX_PORT}/`, { headers: { Host: host } })
      expect(res.status(), host).toBe(421)
    }
  })
})

test.describe('the frame element', () => {
  test('carries exactly the sandbox tokens we intend, and no more', async ({ page }) => {
    await openCreation(page, 'Neighborhood Watch')
    const sandbox = await page.locator('iframe').first().getAttribute('sandbox')

    expect(sandbox).toBe('allow-scripts allow-same-origin allow-forms allow-modals')

    for (const forbidden of [
      'allow-popups',
      'allow-top-navigation',
      'allow-downloads',
      'allow-pointer-lock',
      'allow-storage-access-by-user-activation',
    ]) {
      expect(sandbox, forbidden).not.toContain(forbidden)
    }
  })

  test('denies every powerful feature and sends no referrer', async ({ page }) => {
    await openCreation(page, 'Neighborhood Watch')
    const iframe = page.locator('iframe').first()
    const allow = await iframe.getAttribute('allow')

    for (const feature of ['camera', 'microphone', 'geolocation', 'payment', 'usb']) {
      expect(allow, feature).toContain(`${feature} 'none'`)
    }
    expect(await iframe.getAttribute('referrerpolicy')).toBe('no-referrer')
  })
})

test.describe('#16 per-creation origins', () => {
  test('two creations get different origins, so neither can read the other storage', async ({
    page,
    request,
  }) => {
    const attacker = await creationOrigin(request, 'Neighborhood Watch')
    const lunch = await creationOrigin(request, 'Lunch around town')
    expect(attacker).not.toBe(lunch)

    // The attacker writes to its own localStorage during its probes. Wait for
    // it to actually have run rather than racing it.
    await attackResults(page)
    const guest = await liveGuestFrame(page)
    expect(await guest.evaluate(() => localStorage.getItem('attacker-was-here'))).toBe('yes')

    // The other creation's origin is a different storage area entirely.
    const other = await openCreation(page, 'Lunch around town')
    expect(await other.evaluate(() => localStorage.getItem('attacker-was-here'))).toBeNull()
  })
})

test.describe('the ordinary path still works', () => {
  test('a real creation renders themed and reads the town through the bridge', async ({
    page,
  }) => {
    // If the boundary suite passed but nothing worked, we would have built a
    // very secure blank page.
    await openCreation(page, 'Lunch around town')

    // Poll for the rendered list on whichever frame is currently live.
    await expect
      .poll(
        async () => {
          const frame = await liveGuestFrame(page)
          return frame.locator('li').count()
        },
        { timeout: 20_000 },
      )
      .toBeGreaterThan(0)

    const guest = await liveGuestFrame(page)

    // The theme reached the guest, from the guest's own origin.
    const navy = await guest.evaluate(() =>
      getComputedStyle(document.documentElement).getPropertyValue('--ts-navy').trim(),
    )
    expect(navy).toBe('#315B4C')

    // And the self-hosted typeface actually loaded, rather than falling back.
    const font = await guest.evaluate(() => getComputedStyle(document.body).fontFamily)
    expect(font).toContain('Nunito Sans')
    expect(await guest.evaluate(async () => {
      const faces = await document.fonts.load('16px "Nunito Sans"')
      return faces.length > 0 && faces.every(face => face.status === 'loaded')
    })).toBe(true)
  })

  test('the starter creation renders, so the folder people copy is known to work', async ({
    page,
  }) => {
    // apps/sandbox/examples/starter is what a new builder copies first. If it
    // stopped loading, the first hour of every new team would be debugging a
    // starter rather than building on it.
    // The gallery labels every example as a starter, so match the card by its tagline too.
    await openCreation(page, 'Starter The smallest')

    await expect
      .poll(
        async () => {
          const frame = await liveGuestFrame(page)
          return frame.locator('#lede').textContent()
        },
        { timeout: 20_000 },
      )
      .toContain('places from the town directory')

    const guest = await liveGuestFrame(page)
    expect(await guest.locator('li').count()).toBeGreaterThan(0)
  })

  test('the shell shows the chrome a creation cannot draw over', async ({ page }) => {
    await openCreation(page, 'Lunch around town')
    await expect(page.getByText('Sandboxed')).toBeVisible()
    await expect(page.getByText('running on Town Square')).toBeVisible()
  })
})

// ─────────────────────────────────────────────────────────────────────────────

/** Resolve a creation's bundle origin from the catalogue, rather than hardcoding a key. */
async function creationOrigin(
  request: { get(url: string): Promise<{ json(): Promise<unknown> }> },
  name: string,
): Promise<string> {
  const res = await request.get(`${API}/api/creations`)
  const list = (await res.json()) as Array<{ name: string; origin: string }>
  const found = list.find((c) => c.name === name)
  if (!found) throw new Error(`no creation named ${name}; have ${list.map((c) => c.name)}`)
  return found.origin
}

/**
 * Fetch a bundle URL over HTTP, without a browser.
 *
 * Playwright's `request` fixture resolves names through **Node**, and Node does
 * not implement the `*.localhost` rule — only browsers do. So these requests go
 * to loopback with an explicit `Host` header, which is exactly what the server
 * routes on anyway. Asserting on `Host` rather than on DNS is also closer to
 * what production does behind a load balancer.
 */
async function fetchBundle(
  request: {
    get(
      url: string,
      opts?: { headers?: Record<string, string>; maxRedirects?: number },
    ): Promise<{ status(): number; headers(): Record<string, string> }>
  },
  origin: string,
  path: string,
) {
  const { host, port } = new URL(origin)
  return request.get(`http://127.0.0.1:${port}${path}`, {
    headers: { Host: host },
    maxRedirects: 0,
  })
}

test.describe('#4 identity reaches a creation only through the bridge', () => {
  /** Sign up through the shell proxy so the browser receives its real session cookie. */
  async function signIn(page: Page, handle: string, _email: string): Promise<void> {
    await page.goto(SHELL)
    const result = await page.evaluate(async (handle) => {
      const response = await fetch('/api/auth/signup', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ handle, password: 'Boundary-test-only-passphrase-2026' }),
      })
      return { ok: response.ok, status: response.status, body: await response.text() }
    }, handle)
    expect(result.ok, `${result.status}: ${result.body}`).toBe(true)
    await page.goto(SHELL)
    await expect(page.getByRole('button', { name: new RegExp(handle) })).toBeVisible()
    expect((await page.context().cookies(SHELL)).some(cookie => cookie.httpOnly)).toBe(true)
  }

  test('a signed-in handle reaches the guest, and the credential behind it does not', async ({
    page,
  }) => {
    await signIn(page, 'boundary-tester', 'boundary@example.com')
    const frame = await openCreation(page, 'Boundary Identity Probe')

    // The handle arrives — through the port, projected by the server, in a
    // creation that declared `permissions.identity: "handle"`.
    await expect(frame.locator('#lede')).toContainText('boundary-tester')

    const probe = await frame.evaluate(async (api: string) => {
      const violations: string[] = []
      document.addEventListener('securitypolicyviolation', (e) =>
        violations.push(e.violatedDirective),
      )

      // What the guest would do if it wanted the credential rather than the
      // answer: go to the source itself.
      const attempts: Record<string, string> = {}
      for (const path of ['/api/bridge/me', '/api/creations/burrito-index/act', '/api/auth/me']) {
        try {
          const res = await fetch(api + path, { method: 'GET' })
          attempts[path] = `returned ${res.status}`
        } catch {
          attempts[path] = 'blocked'
        }
      }

      await new Promise((r) => setTimeout(r, 250))
      return { attempts, violations, cookie: document.cookie, storage: JSON.stringify(sessionStorage ?? null) }
    }, API)

    // Every direct route to the credential is refused by the frame's own CSP,
    // before the request reaches a server that could have answered it.
    for (const [path, outcome] of Object.entries(probe.attempts)) {
      expect(outcome, path).toBe('blocked')
    }
    expect(probe.violations.join(' ')).toContain('connect-src')

    // And there is nothing to steal in here anyway: the session cookie is
    // scoped to the shell's domain, and the act token never leaves the closure
    // it was minted into on the host page.
    expect(probe.cookie).toBe('')
  })

  test('storage is private to one creation and one resident', async ({ page, browser }) => {
    // Threat model #17, in a real browser: two residents, one creation, one
    // key. Neither request names a user anywhere — the scope comes from the
    // act token — so this is the property holding, not a filter working.
    await signIn(page, 'storage-one', 'storage-one@example.com')
    const first = await openCreation(page, 'Boundary Identity Probe')
    // Frame locators, not page locators: the button lives inside the guest, on
    // a different origin, which is the entire point of the architecture.
    await expect(first.locator('#pin')).toHaveText('Pin my favourite')
    await first.locator('#pin').click()
    await expect(first.locator('#pin')).toHaveText('Pinned')

    // Reopening reads it back: the value survived the frame being destroyed,
    // which is what makes it storage rather than a variable.
    await openCreation(page, 'Boundary Identity Probe')
    const reopened = await liveGuestFrame(page)
    await expect(reopened.locator('#favourite')).toBeVisible()

    const other = await browser.newPage()
    await signIn(other, 'storage-two', 'storage-two@example.com')
    const theirs = await openCreation(other, 'Boundary Identity Probe')
    await expect(theirs.locator('#pin')).toHaveText('Pin my favourite')
    await expect(theirs.locator('#favourite')).toHaveCount(0)
    await other.close()
  })

  test('a creation that never declared identity is refused it server-side too', async ({
    request,
  }) => {
    // The Neighborhood Watch fixture declares no identity permission. Even
    // holding a legitimately minted act token for itself, the API refuses —
    // the host's check is a fast error message, this is the boundary.
    const res = await request.post(`${API}/api/creations/attacker/act`, {
      headers: { Origin: SHELL },
      data: {},
    })
    expect(res.status(), 'the adversarial fixture must be loaded').toBe(200)

    const { token } = (await res.json()) as { token: string }
    const me = await request.get(`${API}/api/bridge/me`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    expect(me.status()).toBe(403)
  })
})
