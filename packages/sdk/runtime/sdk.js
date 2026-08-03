/**
 * @townsquare/sdk, guest runtime.
 *
 * Ships verbatim into a creation's sandboxed frame, which is why it is plain
 * JavaScript rather than compiled output: what a reviewer reads here is exactly
 * what a resident's browser runs.
 *
 * This module is the only door out of the frame. Everything it does is
 * re-checked on the host side, so nothing here is a security control. The
 * checks that exist are for error quality: failing fast with a readable message
 * beats a round trip that returns `permission_denied`.
 */

const PROTOCOL_VERSION = 1

const LIMITS = {
  timeoutMs: 15000,
  maxInFlight: 32,
  handshakeTimeoutMs: 10000,
}

export class TownSquareError extends Error {
  constructor(code, message, extra) {
    super(message)
    this.name = 'TownSquareError'
    this.code = code
    this.retryAfter = extra && extra.retryAfter
    this.details = extra && extra.details
  }

  /** Only these two are worth trying again. Everything else is an answer. */
  get retryable() {
    return this.code === 'rate_limited' || this.code === 'unavailable'
  }
}

/** @type {{port: MessagePort, init: object} | null} */
let channel = null
let connecting = null
const pending = new Map()
let nextId = 0

function connect() {
  if (channel) return Promise.resolve(channel)
  if (connecting) return connecting

  connecting = new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      window.removeEventListener('message', onInit)
      reject(
        new TownSquareError(
          'unavailable',
          'Town Square did not respond to the handshake. Is this page running inside Town Square?',
        ),
      )
    }, LIMITS.handshakeTimeoutMs)

    function onInit(e) {
      // The host is our parent and nobody else. A message from any other window
      // is ignored outright rather than inspected.
      if (e.source !== window.parent) return
      const d = e.data
      if (!d || d.ts !== PROTOCOL_VERSION || d.kind !== 'init') return
      const port = e.ports && e.ports[0]
      if (!port) return

      clearTimeout(timer)
      window.removeEventListener('message', onInit)

      port.onmessage = onPortMessage
      port.start && port.start()
      channel = { port, init: d }
      applyTheme(d.theme)
      resolve(channel)
    }

    window.addEventListener('message', onInit)

    // targetOrigin '*' is correct and necessary here: the guest does not know
    // the shell's origin, and this message carries nothing secret. The host
    // validates our origin on receipt, which is the check that matters.
    window.parent.postMessage(
      { ts: PROTOCOL_VERSION, kind: 'hello', sdk: 1, sdkBuild: '1.0.0' },
      '*',
    )
  })

  return connecting
}

function onPortMessage(e) {
  const d = e.data
  if (!d || d.ts !== PROTOCOL_VERSION) return

  if (d.kind === 'evt') {
    if (d.event === 'theme') applyTheme(d.data)
    if (d.event === 'teardown') {
      for (const [, p] of pending) {
        p.reject(new TownSquareError('unavailable', 'Town Square closed this creation.'))
      }
      pending.clear()
    }
    return
  }

  if (d.kind !== 'res' || typeof d.id !== 'string') return
  const p = pending.get(d.id)
  // An unknown id is a duplicate or forged response. Dropping it silently is
  // right: settling twice would be worse than ignoring it.
  if (!p) return
  pending.delete(d.id)
  clearTimeout(p.timer)

  if (d.ok) p.resolve(d.result)
  else p.reject(new TownSquareError(d.error.code, d.error.message, d.error))
}

function applyTheme(vars) {
  if (!vars) return
  const root = document.documentElement
  for (const k in vars) {
    if (k.startsWith('--ts-')) root.style.setProperty(k, vars[k])
  }
}

async function call(method, params) {
  const ch = await connect()

  if (pending.size >= LIMITS.maxInFlight) {
    throw new TownSquareError(
      'rate_limited',
      'Too many Town Square calls in flight at once. Await your calls, or batch them.',
    )
  }

  const id = String(++nextId)
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      pending.delete(id)
      reject(new TownSquareError('unavailable', `${method} timed out.`))
    }, LIMITS.timeoutMs)

    pending.set(id, { resolve, reject, timer })
    ch.port.postMessage({ ts: PROTOCOL_VERSION, kind: 'req', id, method, params })
  })
}

/**
 * Fire-and-forget, for the `app.*` calls that have nothing to return.
 * Deliberately does not reject: a creation should not have to await a title
 * change, and an unhandled rejection from one would be worse than silence.
 */
function notify(method, params) {
  connect().then(
    (ch) => ch.port.postMessage({ ts: PROTOCOL_VERSION, kind: 'req', id: 'n' + ++nextId, method, params }),
    () => {},
  )
}

// ── public surface ──────────────────────────────────────────────────────────

export const app = {
  ready: () => notify('app.ready', undefined),
  setHeight: (px) => notify('app.setHeight', px),
  setTitle: (text) => notify('app.setTitle', text),
}

export const town = {
  info: () => call('town.info', undefined),
  thisWeek: () => call('town.thisWeek', undefined),
  items: (opts) => call('town.items', opts || {}),
  item: (id) => call('town.item', id),
  businesses: (opts) => call('town.businesses', opts || {}),
}

export const user = {
  current: () => call('user.current', undefined),
}

export const records = {
  list: (type, opts) => call('records.list', [type, opts]),
  get: (type, id) => call('records.get', [type, id]),
  create: (type, data) => call('records.create', [type, data]),
  update: (type, id, patch) => call('records.update', [type, id, patch]),
  history: (type, id) => call('records.history', [type, id]),
}

export const storage = {
  get: (key) => call('storage.get', key),
  set: (key, value) => call('storage.set', [key, value]),
}

/** Town id, name and timezone, available once connected. */
export async function townInfo() {
  const ch = await connect()
  return ch.init.town
}

/** Exposed for tests only. Not part of the contract. */
export const __internal = {
  reset() {
    channel = null
    connecting = null
    for (const [, p] of pending) clearTimeout(p.timer)
    pending.clear()
    nextId = 0
  },
  get pendingCount() {
    return pending.size
  },
}
