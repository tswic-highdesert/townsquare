// @vitest-environment happy-dom

/**
 * `useSdkCall` through a real React render, against the mock host.
 * The race tests are the reason this file exists: a slow answer must never
 * overwrite a newer one on screen.
 */

import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { METHODS, type SdkMethod } from './methods.js'
import { installMockBridge, type MockBridge, type Reply } from './mockBridge.js'
import { useSdkCall } from './useSdkCall.js'

vi.mock('@townsquare/sdk', () => import('../../../../../packages/sdk/runtime/sdk.js'))

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const byId = (id: string) => METHODS.find((m) => m.id === id)!

/** Mounts the hook and exposes its latest return value. */
function renderHook(method: SdkMethod) {
  let latest!: ReturnType<typeof useSdkCall>
  function Probe() {
    latest = useSdkCall(method)
    return null
  }
  const root: Root = createRoot(document.createElement('div'))
  act(() => root.render(createElement(Probe)))
  return {
    get current() {
      return latest
    },
    unmount: () => act(() => root.unmount()),
  }
}

/** A reply the test releases by hand, to control the order answers land in. */
function deferred() {
  let release!: (r: Reply) => void
  const promise = new Promise<Reply>((resolve) => (release = resolve))
  return { promise, release }
}

let bridge: MockBridge | null = null
let unmount: (() => void) | null = null
afterEach(() => {
  unmount?.()
  bridge?.close()
  bridge = unmount = null
})

/** Lets port messages and promise callbacks run, inside act. */
const flush = () => act(() => new Promise((r) => setTimeout(r, 20)))

describe('useSdkCall', () => {
  it('starts idle, shows running, then the result', async () => {
    const town = { id: 't', name: 'Testville', timezone: 'America/Chicago' }
    const gate = deferred()
    bridge = installMockBridge({ handler: () => gate.promise })
    const hook = renderHook(byId('town.info'))
    unmount = hook.unmount

    expect(hook.current.state).toEqual({ status: 'idle' })

    let done!: Promise<void>
    act(() => {
      done = hook.current.run({})
    })
    expect(hook.current.state).toEqual({ status: 'running' })

    await bridge.waitForRequests(1)
    gate.release({ ok: true, result: town })
    await act(() => done)

    expect(hook.current.state).toMatchObject({ status: 'ok', result: town, fired: false })
    expect((hook.current.state as { ms: number }).ms).toBeGreaterThanOrEqual(0)
  })

  it('marks app.* calls as fired, with no result', async () => {
    bridge = installMockBridge()
    const hook = renderHook(byId('app.setTitle'))
    unmount = hook.unmount

    await act(() => hook.current.run({ text: 'Hello' }))
    expect(hook.current.state).toMatchObject({ status: 'ok', fired: true, result: undefined })
    await bridge.waitForRequests(1)
  })

  it('shows bad input as an error without calling the host', async () => {
    bridge = installMockBridge()
    const hook = renderHook(byId('town.item'))
    unmount = hook.unmount

    await act(() => hook.current.run({ id: '' }))
    expect(hook.current.state).toMatchObject({ status: 'error', code: 'invalid_input', retryable: false })
    await flush()
    expect(bridge.requests).toHaveLength(0)
  })

  it('shows a host error with its code', async () => {
    bridge = installMockBridge({ handler: () => ({ ok: false, error: { code: 'rate_limited', message: 'slow down' } }) })
    const hook = renderHook(byId('town.info'))
    unmount = hook.unmount

    await act(() => hook.current.run({}))
    expect(hook.current.state).toEqual({ status: 'error', code: 'rate_limited', message: 'slow down', retryable: true })
  })

  it('keeps the newer answer when an older one lands last', async () => {
    const slow = deferred()
    const fast = deferred()
    bridge = installMockBridge({ handler: (req) => (req.params === 'slow' ? slow.promise : fast.promise) })
    const hook = renderHook(byId('town.item'))
    unmount = hook.unmount

    let first!: Promise<void>
    let second!: Promise<void>
    act(() => {
      first = hook.current.run({ id: 'slow' })
    })
    act(() => {
      second = hook.current.run({ id: 'fast' })
    })
    await bridge.waitForRequests(2)

    fast.release({ ok: true, result: { id: 'fast' } })
    await act(() => second)
    expect(hook.current.state).toMatchObject({ status: 'ok', result: { id: 'fast' } })

    slow.release({ ok: true, result: { id: 'slow' } })
    await act(() => first)
    expect(hook.current.state).toMatchObject({ status: 'ok', result: { id: 'fast' } })
  })

  it('keeps the newer answer when an older call fails last', async () => {
    const slow = deferred()
    bridge = installMockBridge({
      handler: (req) => (req.params === 'slow' ? slow.promise : { ok: true, result: { id: 'fast' } }),
    })
    const hook = renderHook(byId('town.item'))
    unmount = hook.unmount

    let first!: Promise<void>
    act(() => {
      first = hook.current.run({ id: 'slow' })
    })
    await act(() => hook.current.run({ id: 'fast' }))

    slow.release({ ok: false, error: { code: 'unavailable', message: 'late failure' } })
    await act(() => first)
    expect(hook.current.state).toMatchObject({ status: 'ok', result: { id: 'fast' } })
  })

  it('reset returns to idle and ignores the answer still in flight', async () => {
    const gate = deferred()
    bridge = installMockBridge({ handler: () => gate.promise })
    const hook = renderHook(byId('town.info'))
    unmount = hook.unmount

    let done!: Promise<void>
    act(() => {
      done = hook.current.run({})
    })
    act(() => hook.current.reset())
    expect(hook.current.state).toEqual({ status: 'idle' })

    await bridge.waitForRequests(1)
    gate.release({ ok: true, result: { name: 'too late' } })
    await act(() => done)
    expect(hook.current.state).toEqual({ status: 'idle' })
  })
})
