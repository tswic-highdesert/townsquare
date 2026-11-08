/**
 * A stand-in for the Town Square host, for tests only. Nothing in the app
 * imports this, so it never reaches the built creation.
 *
 * It speaks the real wire protocol to the real guest runtime
 * (`packages/sdk/runtime/sdk.js`): it answers the `hello` with an `init` and a
 * message port, then serves requests on that port. Every request goes through
 * the host's own gate, `checkCall`, against this demo's real manifest, so a
 * test that passes here means the host would accept the same call: the
 * permission is declared and the params match the method table's schema.
 *
 * Test files must point `@townsquare/sdk` at the guest runtime first, because
 * the repo-wide vitest alias points it at the build-time package instead:
 *
 *   vi.mock('@townsquare/sdk', () => import('../../../../../packages/sdk/runtime/sdk.js'))
 */

import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { MessageChannel, type MessagePort } from 'node:worker_threads'
import { parseManifest, type Manifest } from '../../../../../packages/manifest/src/index.js'
import {
  advisoryGrants,
  checkCall,
  type ActingUser,
  type CheckResult,
} from '../../../../../packages/sdk/src/permissions.js'
import { __internal } from '../../../../../packages/sdk/runtime/sdk.js'

export interface WireRequest {
  method: string
  params: unknown
  /** What the host's gate decided about this request. */
  check: CheckResult
}

export type Reply =
  | { ok: true; result: unknown }
  | { ok: false; error: { code: string; message: string } }

export type Handler = (req: WireRequest) => Reply | Promise<Reply>

export interface MockBridgeOptions {
  /** The signed-in user. Defaults to a verified resident; pass null for signed out. */
  user?: ActingUser | null
  /** Answers requests that pass the gate. Defaults to `{ ok: true, result: null }`. */
  handler?: Handler
}

export interface MockBridge {
  /** Every request the guest sent, in order, including fire-and-forget `app.*` calls. */
  readonly requests: WireRequest[]
  /** Resolves once at least `n` requests have arrived. */
  waitForRequests(n: number): Promise<void>
  /** Closes the port and resets the runtime, so the next test handshakes again. */
  close(): void
}

/** This demo's `public/townsquare.json`, parsed by the real manifest schema. */
export function loadDemoManifest(): Manifest {
  // A path, not `new URL(...)`: a test DOM replaces the global URL with one Node's fs rejects.
  const file = join(dirname(fileURLToPath(import.meta.url)), '../../public/townsquare.json')
  const parsed = parseManifest(JSON.parse(readFileSync(file, 'utf8')))
  if (!parsed.ok) {
    throw new Error(`The demo manifest is invalid: ${JSON.stringify(parsed.issues)}`)
  }
  return parsed.manifest
}

export const TEST_TOWN = { id: 'town_test', name: 'Testville', timezone: 'America/Chicago' }

export function installMockBridge(opts: MockBridgeOptions = {}): MockBridge {
  const manifest = loadDemoManifest()
  const user = opts.user === undefined ? { handle: 'tester', verified: true } : opts.user
  const handler: Handler = opts.handler ?? (() => ({ ok: true, result: null }))

  const requests: WireRequest[] = []
  const waiters: Array<{ n: number; resolve: () => void }> = []
  let host: MessagePort | null = null
  let guest: MessagePort | null = null

  function settleWaiters() {
    for (let i = waiters.length - 1; i >= 0; i--) {
      const w = waiters[i]!
      if (requests.length >= w.n) {
        waiters.splice(i, 1)
        w.resolve()
      }
    }
  }

  async function onRequest(data: { id: string; method: string; params: unknown }) {
    const req: WireRequest = {
      method: data.method,
      params: data.params,
      check: checkCall(data.method, data.params, { manifest, user }),
    }
    requests.push(req)
    settleWaiters()

    // Fire-and-forget calls get no reply; the runtime would drop one anyway.
    if (data.id.startsWith('n')) return

    const reply: Reply = req.check.ok ? await handler(req) : { ok: false, error: req.check.error }
    host?.postMessage({ ts: 1, kind: 'res', id: data.id, ...reply })
  }

  // The runtime says hello on `window.parent`, which is `window` in a test DOM.
  const originalPostMessage = window.postMessage.bind(window)
  window.postMessage = ((data: unknown, ...rest: unknown[]) => {
    const d = data as { kind?: string } | null
    if (d?.kind !== 'hello') return (originalPostMessage as (...a: unknown[]) => void)(data, ...rest)

    const channel = new MessageChannel()
    host = channel.port1
    guest = channel.port2
    host.on('message', (msg: { kind?: string; id: string; method: string; params: unknown }) => {
      if (msg?.kind === 'req') void onRequest(msg)
    })

    const init = {
      ts: 1,
      kind: 'init',
      town: TEST_TOWN,
      theme: {},
      display: { surface: 'full', height: 'auto' },
      grants: advisoryGrants(manifest),
    }
    window.dispatchEvent(new MessageEvent('message', { data: init, source: window, ports: [guest as never] }))
  }) as typeof window.postMessage

  return {
    requests,
    waitForRequests(n) {
      if (requests.length >= n) return Promise.resolve()
      return new Promise((resolve) => waiters.push({ n, resolve }))
    },
    close() {
      window.postMessage = originalPostMessage
      host?.close()
      guest?.close()
      __internal.reset()
    },
  }
}
