// @vitest-environment happy-dom
// @vitest-environment-options { "settings": { "navigation": { "disableChildFrameNavigation": true }, "disableJavaScriptFileLoading": true, "disableCSSFileLoading": true } }
/**
 * The frame element and its lifecycle.
 *
 * Iframe navigation is off: the src points at a real bundle origin that does
 * not exist in a test process, and letting happy-dom try to fetch it produces
 * pages of navigation noise without testing anything. What matters here is the
 * element we construct and the state machine around it.
 *
 * Two traps in the line above, both of which once left that noise on. Vitest
 * nests the docblock options under `happyDOM` itself, so wrapping them in a
 * `happyDOM` key here hides them one level too deep and they are ignored. And
 * happy-dom 20's older `disableIframePageLoading` logs a `NotSupportedError`
 * for every frame it declines to load, which is the same noise in a different
 * shape; `navigation.disableChildFrameNavigation` declines quietly.
 *
 * The attribute assertions here are snapshot-strict on purpose. `sandbox` and
 * `allow` *are* the boundary, so loosening either must require editing a test
 * that says so, and must show up as a visible diff in review. A silent
 * `allow-popups` is exactly the change this catches.
 */

import { describe, expect, it, vi } from 'vitest'
import { parseManifest, type Manifest } from '@townsquare/manifest'
import { CreationHost, SANDBOX_TOKENS, ALLOW_ATTRIBUTE, type HostState } from './CreationHost.js'

function manifest(overrides: Record<string, unknown> = {}): Manifest {
  const parsed = parseManifest({
    manifest_version: 1,
    sdk: 1,
    name: 'The Burrito Index',
    tagline: 'Fourteen taquerias, ranked',
    description: 'Fourteen taquerias in town, ranked by whoever shows up to vote each week.',
    version: '1.0.0',
    entry: 'index.html',
    icon: 'icon.png',
    ...overrides,
  })
  if (!parsed.ok) throw new Error(JSON.stringify(parsed.issues))
  return parsed.manifest
}

const townSource = {
  info: async () => ({}),
  thisWeek: async () => ({}),
  items: async () => ({}),
  item: async () => ({}),
  businesses: async () => ({}),
}

function host(overrides: Record<string, unknown> = {}) {
  const el = document.createElement('div')
  document.body.appendChild(el)
  const states: HostState[] = []
  const incidents: Array<{ kind: string; detail: unknown }> = []

  const instance = new CreationHost(el, {
    guestOrigin: 'https://a7k2m9x4tsq.tsq-apps.net',
    manifest: manifest(),
    town: { id: 'russellville-ar', name: 'Russellville', timezone: 'America/Chicago' },
    context: { user: null, town: townSource },
    onStateChange: (s) => states.push(s),
    onIncident: (kind, detail) => incidents.push({ kind, detail }),
    timeouts: { handshakeMs: 20, readyMs: 20 },
    ...overrides,
  })

  return { instance, el, states, incidents }
}

const frameIn = (el: HTMLElement) => el.querySelector('iframe')

describe('the frame element', () => {
  it('pins the exact sandbox token list', () => {
    expect(SANDBOX_TOKENS).toBe('allow-scripts allow-same-origin allow-forms allow-modals')
  })

  it('never grants the tokens that would open an egress or navigation channel', () => {
    for (const forbidden of [
      'allow-popups',
      'allow-popups-to-escape-sandbox',
      'allow-top-navigation',
      'allow-top-navigation-by-user-activation',
      'allow-downloads',
      'allow-pointer-lock',
      'allow-presentation',
      'allow-storage-access-by-user-activation',
    ]) {
      expect(SANDBOX_TOKENS, forbidden).not.toContain(forbidden)
    }
  })

  it("denies every powerful feature in the allow attribute", () => {
    for (const feature of ['camera', 'microphone', 'geolocation', 'payment', 'usb', 'display-capture']) {
      expect(ALLOW_ATTRIBUTE).toContain(`${feature} 'none'`)
    }
  })

  it('sets the security attributes on the element it creates', async () => {
    const { instance, el } = host()
    void instance.mount()
    const iframe = frameIn(el)!
    expect(iframe.getAttribute('sandbox')).toBe(SANDBOX_TOKENS)
    expect(iframe.getAttribute('allow')).toBe(ALLOW_ATTRIBUTE)
    expect(iframe.getAttribute('referrerpolicy')).toBe('no-referrer')
    expect(iframe.getAttribute('src')).toBe('https://a7k2m9x4tsq.tsq-apps.net/')
    instance.destroy()
  })

  it('gives the frame an accessible title naming who built it', async () => {
    const { instance, el } = host()
    void instance.mount()
    expect(frameIn(el)!.getAttribute('title')).toBe(
      'The Burrito Index, a resident-built creation',
    )
    instance.destroy()
  })

  it('loads eagerly by default, because a hidden lazy frame never loads at all', async () => {
    // Found by the boundary suite. A `loading="lazy"` iframe that is off-screen
    // or inside a `display: none` wrapper is never loaded, so the handshake
    // never happens, so the creation never becomes ready — and it then fails
    // with a timeout that reads like the creation's fault rather than ours.
    const { instance, el } = host()
    void instance.mount()
    expect(frameIn(el)!.getAttribute('loading')).toBe('eager')
    instance.destroy()
  })

  it('still allows lazy when a caller genuinely wants it below the fold', async () => {
    const { instance, el } = host({ loading: 'lazy' })
    void instance.mount()
    expect(frameIn(el)!.getAttribute('loading')).toBe('lazy')
    instance.destroy()
  })

  it('starts at the skeleton height so the page does not jump', async () => {
    const { instance, el } = host()
    void instance.mount()
    expect(frameIn(el)!.style.height).toBe('320px')
    instance.destroy()
  })
})

describe('lifecycle', () => {
  it('fails with a readable reason when the guest never connects', async () => {
    const { instance, states, incidents } = host()
    await instance.mount()
    expect(instance.getState()).toMatchObject({ name: 'error', reason: 'handshake_timeout' })
    expect(states.map((s) => s.name)).toEqual(['loading', 'error'])
    expect(incidents.map((i) => i.kind)).toContain('handshake_timeout')
    instance.destroy()
  })

  it('logs an incident and fails when the frame navigates itself after loading', async () => {
    const { instance, el, incidents } = host()
    void instance.mount()
    const iframe = frameIn(el)!
    iframe.dispatchEvent(new Event('load'))
    iframe.dispatchEvent(new Event('load'))
    expect(incidents.map((i) => i.kind)).toContain('unexpected_navigation')
    expect(instance.getState()).toMatchObject({ name: 'error', reason: 'navigated' })
    instance.destroy()
  })

  it('does not treat the first load as a navigation', async () => {
    const { instance, el, incidents } = host()
    void instance.mount()
    frameIn(el)!.dispatchEvent(new Event('load'))
    expect(incidents.map((i) => i.kind)).not.toContain('unexpected_navigation')
    instance.destroy()
  })

  it('removes the element on teardown rather than reusing it', async () => {
    const { instance, el } = host()
    await instance.mount()
    expect(frameIn(el)).not.toBeNull()
    instance.destroy()
    expect(frameIn(el)).toBeNull()
    expect(instance.getState()).toMatchObject({ name: 'teardown' })
  })

  it('is safe to tear down twice', async () => {
    const { instance } = host()
    await instance.mount()
    instance.destroy()
    expect(() => instance.destroy()).not.toThrow()
  })

  it('does not report a state change after teardown', async () => {
    const { instance, states } = host()
    await instance.mount()
    instance.destroy()
    const count = states.length
    await new Promise((r) => setTimeout(r, 40))
    expect(states.length).toBe(count)
  })
})

describe('height', () => {
  /** Reach the private clamp the way a guest would, through the bridge frame. */
  function heightsFrom(reported: number[]): number[] {
    const seen: number[] = []
    const { instance, el } = host({ onHeightChange: (px: number) => seen.push(px) })
    void instance.mount()
    const iframe = frameIn(el)!
    for (const px of reported) {
      // The frame controls are private; drive them the way the bridge does.
      ;(instance as unknown as { applyHeight(px: number): void })['applyHeight'](px)
    }
    void iframe
    instance.destroy()
    return seen
  }

  it('clamps an absurd report rather than destroying the shell scroll', () => {
    expect(heightsFrom([10_000_000])).toEqual([4000])
  })

  it('clamps a tiny or negative report up to the floor', () => {
    expect(heightsFrom([0])).toEqual([200])
    expect(heightsFrom([-500])).toEqual([200])
  })

  it('ignores a report that is not a number at all', () => {
    expect(heightsFrom([Number.NaN, Number.POSITIVE_INFINITY])).toEqual([])
  })

  it('does not churn when the height has not changed', () => {
    expect(heightsFrom([600, 600, 600])).toEqual([600])
  })

  it('passes an ordinary height through', () => {
    expect(heightsFrom([720])).toEqual([720])
  })
})

describe('title', () => {
  it('truncates to the documented length and hands over a plain string', async () => {
    const titles: string[] = []
    const { instance } = host({ onTitleChange: (t: string) => titles.push(t) })
    void instance.mount()
    ;(instance as unknown as { applyTitle(t: string): void })['applyTitle']('x'.repeat(500))
    expect(titles[0]?.length).toBe(80)
    instance.destroy()
  })
})
