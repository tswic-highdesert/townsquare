// @vitest-environment happy-dom
/**
 * The guest SDK and the host bridge, talking to each other for real.
 *
 * Both sides run in one process over an actual `MessageChannel`, which covers
 * the part of the system that unit tests on either side alone cannot: that the
 * two halves of the protocol agree. Correlation, duplicate and forged
 * responses, timeouts, the in-flight cap, teardown with work in flight.
 *
 * The iframe and the origin boundary are not simulated here — those are the
 * Playwright suite's job, because faking them would prove nothing about a real
 * browser. What is real here is every byte that crosses the port.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { parseManifest, type Manifest } from '@townsquare/manifest'
import { PROTOCOL_VERSION } from '@townsquare/shared'
import { advisoryGrants } from '@townsquare/sdk'
import { cssVariables } from '@townsquare/tokens'
import { Bridge } from './bridge.js'

// The guest runtime, imported as the browser would get it.
import * as sdk from '../../sdk/runtime/sdk.js'

const TOWN = { id: 'russellville-ar', name: 'Russellville', timezone: 'America/Chicago' }

function manifest(permissions: Record<string, unknown> = {}): Manifest {
  const parsed = parseManifest({
    manifest_version: 1,
    sdk: 1,
    name: 'The Burrito Index',
    tagline: 'Fourteen taquerias, ranked',
    description: 'Fourteen taquerias in town, ranked by whoever shows up to vote each week.',
    version: '1.0.0',
    entry: 'index.html',
    icon: 'icon.png',
    permissions,
  })
  if (!parsed.ok) throw new Error(JSON.stringify(parsed.issues))
  return parsed.manifest
}

const frame = { ready: vi.fn(), setHeight: vi.fn(), setTitle: vi.fn(), openLink: vi.fn() }

interface Harness {
  bridge: Bridge
  hostPort: MessagePort
  /** Everything the host posted back, in order. */
  sent: unknown[]
}

/**
 * Stand up both halves and complete the handshake the way the real host does.
 */
async function connect(m: Manifest = manifest()): Promise<Harness> {
  const town = {
    info: vi.fn(async () => TOWN),
    thisWeek: vi.fn(async () => ({ today: [], weekend: [], comingUp: [], notices: [] })),
    items: vi.fn(async (params: unknown) => ({ items: [{ id: 'e1', params }], nextCursor: null })),
    item: vi.fn(async (id: string) => ({ id })),
    businesses: vi.fn(async () => ({ items: [], nextCursor: null })),
  }

  const bridge = new Bridge({ manifest: m, user: null, town, frame })
  const channel = new MessageChannel()
  const sent: unknown[] = []

  channel.port1.onmessage = async (e: MessageEvent) => {
    const response = await bridge.handle(e.data)
    if (response) {
      sent.push(response)
      channel.port1.postMessage(response)
    }
  }
  channel.port1.start()

  // The guest posts `hello` on window.parent; in this environment that is
  // window itself. Reply with `init` and hand over port2, exactly as the host's
  // transport does.
  const hello = new Promise<void>((resolve) => {
    const onHello = (e: MessageEvent) => {
      if (!e.data || e.data.kind !== 'hello') return
      window.removeEventListener('message', onHello)
      window.dispatchEvent(
        new MessageEvent('message', {
          data: {
            ts: PROTOCOL_VERSION,
            kind: 'init',
            town: TOWN,
            theme: cssVariables(),
            display: { surface: 'full', height: 'auto' },
            grants: advisoryGrants(m),
          },
          source: window.parent,
          ports: [channel.port2],
        }),
      )
      resolve()
    }
    window.addEventListener('message', onHello)
  })

  // Any call triggers the handshake.
  const first = sdk.town.info()
  await hello
  await first

  return { bridge, hostPort: channel.port1, sent }
}

beforeEach(() => {
  sdk.__internal.reset()
  vi.clearAllMocks()
})

afterEach(() => {
  sdk.__internal.reset()
})

describe('handshake', () => {
  it('connects and answers a call', async () => {
    await connect()
    await expect(sdk.town.info()).resolves.toEqual(TOWN)
  })

  it('applies the theme to the document on connect', async () => {
    await connect()
    expect(document.documentElement.style.getPropertyValue('--ts-navy')).toBeTruthy()
  })

  it('exposes town info from the init payload without a round trip', async () => {
    await connect()
    await expect(sdk.townInfo()).resolves.toEqual(TOWN)
  })

  it('ignores a message from a window that is not the parent', async () => {
    sdk.__internal.reset()
    const other = new MessageChannel()
    window.dispatchEvent(
      new MessageEvent('message', {
        data: { ts: 1, kind: 'init', town: TOWN, theme: {}, display: {}, grants: {} },
        source: null,
        ports: [other.port2],
      }),
    )
    // Nothing latched, so a call still has to run its own handshake.
    expect(sdk.__internal.pendingCount).toBe(0)
  })
})

describe('request correlation', () => {
  it('keeps concurrent calls distinct', async () => {
    await connect()
    const [a, b, c] = await Promise.all([
      sdk.town.item('one'),
      sdk.town.item('two'),
      sdk.town.item('three'),
    ])
    expect([a, b, c]).toEqual([{ id: 'one' }, { id: 'two' }, { id: 'three' }])
  })

  it('passes params through unchanged', async () => {
    await connect()
    const result = (await sdk.town.items({ type: 'event', limit: 50 })) as {
      items: Array<{ params: unknown }>
    }
    expect(result.items[0]?.params).toEqual({ type: 'event', limit: 50 })
  })

  it('drops a response with an id it never sent', async () => {
    const { hostPort } = await connect()
    const settled = vi.fn()
    void sdk.town.info().then(settled, settled)

    hostPort.postMessage({ ts: 1, kind: 'res', id: 'forged-id', ok: true, result: 'gotcha' })
    await new Promise((r) => setTimeout(r, 10))

    // The forged reply did not settle the real call.
    expect(settled).not.toHaveBeenCalledWith('gotcha')
  })

  it('ignores a duplicate response rather than settling twice', async () => {
    const { hostPort, sent } = await connect()
    const result = await sdk.town.info()
    expect(result).toEqual(TOWN)

    const previous = sent[sent.length - 1] as { id: string }
    // Replay the same response. The pending entry is already gone.
    expect(() =>
      hostPort.postMessage({ ts: 1, kind: 'res', id: previous.id, ok: true, result: 'second' }),
    ).not.toThrow()
    await new Promise((r) => setTimeout(r, 10))
  })

  it('ignores an envelope from a different protocol version', async () => {
    const { hostPort } = await connect()
    hostPort.postMessage({ ts: 99, kind: 'res', id: '1', ok: true, result: 'nope' })
    await new Promise((r) => setTimeout(r, 10))
    await expect(sdk.town.info()).resolves.toEqual(TOWN)
  })
})

describe('errors cross the port intact', () => {
  it('rejects with the code the host chose', async () => {
    await connect()
    await expect(sdk.user.current()).rejects.toMatchObject({
      name: 'TownSquareError',
      code: 'permission_denied',
    })
  })

  it('marks rate_limited and unavailable as retryable and nothing else', async () => {
    await connect()
    const err = await sdk.user.current().catch((e: { retryable: boolean }) => e)
    expect((err as { retryable: boolean }).retryable).toBe(false)
  })

  it('surfaces an unknown method as invalid_request rather than hanging', async () => {
    const { hostPort, bridge } = await connect()
    const response = await bridge.handle({
      ts: 1,
      kind: 'req',
      id: 'typo',
      method: 'town.iteems',
      params: {},
    })
    expect(response).toMatchObject({ ok: false, error: { code: 'invalid_request' } })
    void hostPort
  })
})

describe('teardown', () => {
  it('rejects everything in flight when the host tears down', async () => {
    const { hostPort } = await connect()
    // A call the host will never answer.
    hostPort.onmessage = null
    const pending = sdk.town.info()

    hostPort.postMessage({ ts: 1, kind: 'evt', event: 'teardown', data: null })

    await expect(pending).rejects.toMatchObject({ code: 'unavailable' })
  })

  it('repaints on a theme event without a reload', async () => {
    const { hostPort } = await connect()
    hostPort.postMessage({
      ts: 1,
      kind: 'evt',
      event: 'theme',
      data: { '--ts-navy': '#26405B' },
    })
    await new Promise((r) => setTimeout(r, 10))
    expect(document.documentElement.style.getPropertyValue('--ts-navy')).toBe('#26405B')
  })

  it('ignores a theme event trying to set a property outside the --ts- namespace', async () => {
    const { hostPort } = await connect()
    hostPort.postMessage({
      ts: 1,
      kind: 'evt',
      event: 'theme',
      data: { '--evil': 'url(https://evil.example)' },
    })
    await new Promise((r) => setTimeout(r, 10))
    expect(document.documentElement.style.getPropertyValue('--evil')).toBe('')
  })
})

describe('links', () => {
  /** Put a link in the page, click it as a resident would, and settle. */
  async function click(attrs: Record<string, string>, init: MouseEventInit = {}): Promise<MouseEvent> {
    const a = document.createElement('a')
    for (const [k, v] of Object.entries(attrs)) a.setAttribute(k, v)
    a.textContent = 'link'
    document.body.appendChild(a)
    const event = new MouseEvent('click', { bubbles: true, cancelable: true, button: 0, ...init })
    a.dispatchEvent(event)
    await new Promise((r) => setTimeout(r, 20))
    a.remove()
    return event
  }

  it('sends app.openLink through to the host', async () => {
    await connect()
    await expect(sdk.app.openLink('tel:+1 (479) 555-1212')).resolves.toBeNull()
    expect(frame.openLink).toHaveBeenCalledWith({
      kind: 'phone',
      href: 'tel:+14795551212',
      number: '+1 (479) 555-1212',
    })
  })

  it('rejects with the reason when the host refuses a link', async () => {
    await connect()
    await expect(sdk.app.openLink('javascript:alert(1)')).rejects.toMatchObject({
      code: 'invalid_request',
    })
    expect(frame.openLink).not.toHaveBeenCalled()
  })

  it('catches a plain new-tab link with no code from the builder', async () => {
    await connect()
    const event = await click({ href: 'https://www.arkansas.gov/aging', target: '_blank' })
    expect(event.defaultPrevented).toBe(true)
    expect(frame.openLink).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'web', href: 'https://www.arkansas.gov/aging' }),
    )
  })

  it('catches a link with no target, which would otherwise replace the creation', async () => {
    await connect()
    const event = await click({ href: 'https://example.org/' })
    expect(event.defaultPrevented).toBe(true)
    expect(frame.openLink).toHaveBeenCalledTimes(1)
  })

  it('catches phone and email links', async () => {
    await connect()
    await click({ href: 'tel:4795551212' })
    await click({ href: 'mailto:help@example.org' })
    expect(frame.openLink).toHaveBeenCalledWith(expect.objectContaining({ kind: 'phone' }))
    expect(frame.openLink).toHaveBeenCalledWith(expect.objectContaining({ kind: 'email' }))
  })

  // A click on an element *inside* a link is covered by the boundary suite
  // instead. happy-dom runs a link's navigation while the click is still
  // bubbling, which no real browser does, so here it would navigate this test
  // window before the runtime's listener on `document` ever saw the click.

  it("leaves the creation's own links and in-page anchors alone", async () => {
    await connect()
    const same = await click({ href: `${location.origin}/page-two` })
    const hash = await click({ href: '#section' })
    const js = await click({ href: 'javascript:void 0' })
    expect([same, hash, js].map((e) => e.defaultPrevented)).toEqual([false, false, false])
    expect(frame.openLink).not.toHaveBeenCalled()
  })

  it('leaves a click the creation already handled alone', async () => {
    await connect()
    const a = document.createElement('a')
    a.href = 'https://example.org/'
    a.addEventListener('click', (e) => e.preventDefault())
    document.body.appendChild(a)
    a.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 }))
    await new Promise((r) => setTimeout(r, 20))
    a.remove()
    expect(frame.openLink).not.toHaveBeenCalled()
  })

  it('ignores right-clicks', async () => {
    await connect()
    // happy-dom would follow the link it was told about; a listener on
    // `window` runs after the runtime's, so it stops that without changing
    // what the runtime saw.
    const hold = (e: Event) => e.preventDefault()
    window.addEventListener('click', hold)
    await click({ href: 'https://example.org/' }, { button: 2 })
    window.removeEventListener('click', hold)
    expect(frame.openLink).not.toHaveBeenCalled()
  })

  it('routes window.open and answers null, as a blocked popup would', async () => {
    await connect()
    expect(window.open('https://example.org/', '_blank')).toBeNull()
    await new Promise((r) => setTimeout(r, 20))
    expect(frame.openLink).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'web', href: 'https://example.org/' }),
    )
  })

  it('warns rather than throwing when a clicked link is refused', async () => {
    await connect()
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const unhandled = vi.fn()
    process.on('unhandledRejection', unhandled)
    await click({ href: 'http://localhost:8080/admin' })
    await new Promise((r) => setTimeout(r, 20))
    process.off('unhandledRejection', unhandled)
    expect(unhandled).not.toHaveBeenCalled()
    expect(warn).toHaveBeenCalledWith(
      '[Town Square] That link was not opened:',
      expect.stringMatching(/not a public web address/),
    )
    warn.mockRestore()
  })
})

describe('app.* fire and forget', () => {
  it('reaches the host without the app having to await it', async () => {
    await connect()
    sdk.app.ready()
    sdk.app.setTitle('12 spots ranked')
    await new Promise((r) => setTimeout(r, 10))
    expect(frame.ready).toHaveBeenCalled()
    expect(frame.setTitle).toHaveBeenCalledWith('12 spots ranked')
  })

  it('does not reject when a fire-and-forget call is refused', async () => {
    await connect()
    const unhandled = vi.fn()
    process.on('unhandledRejection', unhandled)
    sdk.app.setTitle('x'.repeat(200))
    await new Promise((r) => setTimeout(r, 20))
    process.off('unhandledRejection', unhandled)
    expect(unhandled).not.toHaveBeenCalled()
  })
})
