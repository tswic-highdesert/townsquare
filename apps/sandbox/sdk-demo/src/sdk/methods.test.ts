// @vitest-environment happy-dom

/**
 * Runs every catalog method through the real guest runtime against a mock
 * host (see `mockBridge.ts`), and checks three things a reader of the demo
 * relies on:
 *   - the call the demo makes is one the host accepts (permission and params),
 *   - the snippet it shows sends exactly the same thing,
 *   - bad form input is stopped before anything goes over the wire.
 */

import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import * as sdk from '@townsquare/sdk'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { InputError, initialValues, METHODS, nextCursorOf, type InputValues, type SdkMethod } from './methods.js'
import { installMockBridge, type MockBridge, type MockBridgeOptions } from './mockBridge.js'
import { isNotYet, toCallError } from './useSdkCall.js'

vi.mock('@townsquare/sdk', () => import('../../../../../packages/sdk/runtime/sdk.js'))

let bridge: MockBridge | null = null
function bridgeWith(opts?: MockBridgeOptions): MockBridge {
  bridge = installMockBridge(opts)
  return bridge
}
afterEach(() => {
  bridge?.close()
  bridge = null
})

/** The form as a user would first submit it: defaults, plus an id where one is needed. */
function filled(method: SdkMethod, extra: InputValues = {}): InputValues {
  const values = initialValues(method)
  if ('id' in values && !values.id) values.id = method.namespace === 'town' ? 'item_1' : 'rec_1'
  return { ...values, ...extra }
}

/** Runs a method and waits until its request has reached the host. */
async function send(b: MockBridge, method: SdkMethod, values: InputValues) {
  const before = b.requests.length
  await method.run(values)
  await b.waitForRequests(before + 1)
  return b.requests[before]!
}

/** Runs a `code()` snippet as real code against the same runtime. */
const AsyncFunction = Object.getPrototypeOf(async () => {}).constructor as new (
  ...args: string[]
) => (...ns: unknown[]) => Promise<unknown>
async function runSnippet(code: string) {
  const fn = new AsyncFunction('app', 'town', 'user', 'records', 'storage', code)
  await fn(sdk.app, sdk.town, sdk.user, sdk.records, sdk.storage)
}

/** Every optional input filled, to exercise the options-building paths too. */
const ALL_OPTIONS: Record<string, InputValues> = {
  'town.items': { type: 'event', q: 'park', limit: '5', cursor: 'c1', since: '2026-11-01T00:00:00Z' },
  'town.businesses': { tag: 'restaurant', q: 'tacos', limit: '5', cursor: 'c1' },
  'records.list': { limit: '5', cursor: 'c1', since: '2026-11-01T00:00:00Z' },
}

describe.each(METHODS.map((m) => [m.id, m] as const))('%s', (_id, method) => {
  const cases: Array<[string, InputValues]> = [['default inputs', filled(method)]]
  if (ALL_OPTIONS[method.id]) cases.push(['every option set', filled(method, ALL_OPTIONS[method.id])])

  for (const [label, values] of cases) {
    it(`with ${label}, sends a call the host accepts`, async () => {
      const b = bridgeWith()
      const req = await send(b, method, values)
      expect(req.method).toBe(method.id)
      expect(req.check, JSON.stringify(req.check)).toEqual({ ok: true })
      expect(b.requests).toHaveLength(1)
    })

    it(`with ${label}, shows a snippet that sends the same call`, async () => {
      const b = bridgeWith()
      const fromRun = await send(b, method, values)

      await runSnippet(method.code(values))
      await b.waitForRequests(2)
      const fromSnippet = b.requests[1]!

      expect(fromSnippet.method).toBe(fromRun.method)
      expect(fromSnippet.params).toEqual(fromRun.params)
    })
  }
})

describe('bad input never reaches the host', () => {
  const byId = (id: string) => METHODS.find((m) => m.id === id)!

  const cases: Array<[string, InputValues, RegExp]> = [
    ['town.item', { id: '   ' }, /"id" is required/],
    ['town.items', { limit: '2.5' }, /whole number/],
    ['app.setHeight', { px: '' }, /"px" is required/],
    ['app.setTitle', { text: 'x'.repeat(81) }, /over 80/],
    ['storage.set', { key: 'k', value: '{not json' }, /not valid JSON/],
    ['records.create', { data: '[1, 2]' }, /must be a JSON object/],
    ['records.update', { id: 'rec_1', patch: 'null' }, /must be a JSON object/],
  ]

  it.each(cases)('%s with %j', async (id, values, message) => {
    const b = bridgeWith()
    const method = byId(id)
    let thrown: unknown
    try {
      await method.run({ ...filled(method), ...values })
    } catch (err) {
      thrown = err
    }
    expect(thrown).toBeInstanceOf(InputError)
    expect((thrown as InputError).message).toMatch(message)
    expect(toCallError(thrown)).toMatchObject({ code: 'invalid_input', retryable: false })

    // Give a stray request time to arrive before asserting there was none.
    await new Promise((r) => setTimeout(r, 20))
    expect(b.requests).toHaveLength(0)
  })

  it('shows a placeholder snippet instead of throwing', () => {
    expect(byId('storage.set').code({ key: 'k', value: '{not json' })).toBe('// fix the inputs to see the code')
  })
})

describe('what the host says comes back as an error code', () => {
  const storageGet = METHODS.find((m) => m.id === 'storage.get')!
  const recordsCreate = METHODS.find((m) => m.id === 'records.create')!

  async function errorOf(promise: unknown) {
    try {
      await promise
    } catch (err) {
      return toCallError(err)
    }
    throw new Error('expected the call to fail')
  }

  it('storage throws unauthenticated when signed out, as the demo notes say', async () => {
    bridgeWith({ user: null })
    expect(await errorOf(storageGet.run(filled(storageGet)))).toMatchObject({
      code: 'unauthenticated',
      retryable: false,
    })
  })

  it('records.create needs a verified resident', async () => {
    bridgeWith({ user: { handle: 'newcomer', verified: false } })
    expect(await errorOf(recordsCreate.run(filled(recordsCreate)))).toMatchObject({ code: 'not_verified' })
  })

  it.each([
    ['rate_limited', true],
    ['unavailable', true],
    ['permission_denied', false],
    ['not_found', false],
  ])('%s is marked retryable: %s', async (code, retryable) => {
    bridgeWith({ handler: () => ({ ok: false, error: { code, message: `host said ${code}` } }) })
    const townInfo = METHODS.find((m) => m.id === 'town.info')!
    expect(await errorOf(townInfo.run({}))).toEqual({
      status: 'error',
      code,
      message: `host said ${code}`,
      retryable,
      notYet: false,
    })
  })

  it.each(['records.list', 'records.get', 'records.create', 'records.update', 'records.history'])(
    '%s, not built yet, is marked notYet and not retryable',
    async (id) => {
      // What the real host sends today: NotYetError, flattened to `unavailable`.
      bridgeWith({
        handler: (req) => ({
          ok: false,
          error: { code: 'unavailable', message: `${req.method} is not available yet in this town.` },
        }),
      })
      const method = METHODS.find((m) => m.id === id)!
      expect(await errorOf(method.run(filled(method)))).toMatchObject({
        code: 'unavailable',
        retryable: false,
        notYet: true,
      })
    },
  )

  it('matches the exact wording of the host NotYetError', () => {
    // Read from source, because importing the host would pull in all of it.
    const bridgeSource = readFileSync(
      join(dirname(fileURLToPath(import.meta.url)), '../../../../../packages/host/src/bridge.ts'),
      'utf8',
    )
    const template = bridgeSource.match(/class NotYetError[\s\S]*?super\(`\$\{method\}([^`]*)`\)/)?.[1]
    expect(template, 'NotYetError in bridge.ts no longer has the expected shape').toBeDefined()
    expect(isNotYet('unavailable', `records.list${template}`)).toBe(true)
  })

  it('treats any other unavailable as a real outage', () => {
    expect(isNotYet('unavailable', 'Town Square could not complete that request.')).toBe(false)
    expect(isNotYet('permission_denied', 'records.list is not available yet in this town.')).toBe(false)
  })

  it('anything that is not an SDK error becomes "unknown"', () => {
    expect(toCallError(new TypeError('boom'))).toEqual({
      status: 'error',
      code: 'unknown',
      message: 'boom',
      retryable: false,
      notYet: false,
    })
    expect(toCallError('plain string')).toMatchObject({ code: 'unknown', message: 'plain string' })
  })
})

describe('results come back as the host sent them', () => {
  it('town.info resolves to the host result', async () => {
    const town = { id: 't', name: 'Testville', timezone: 'America/Chicago' }
    bridgeWith({ handler: () => ({ ok: true, result: town }) })
    expect(await METHODS.find((m) => m.id === 'town.info')!.run({})).toEqual(town)
  })

  it('nextCursorOf finds the next page only when there is one', () => {
    expect(nextCursorOf({ items: [], nextCursor: 'abc' })).toBe('abc')
    expect(nextCursorOf({ items: [], nextCursor: null })).toBeNull()
    expect(nextCursorOf({ items: [], nextCursor: '' })).toBeNull()
    expect(nextCursorOf({ items: [] })).toBeNull()
    expect(nextCursorOf(null)).toBeNull()
    expect(nextCursorOf('abc')).toBeNull()
  })
})
