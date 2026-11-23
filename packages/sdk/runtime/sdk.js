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
  /**
   * @param {string} code
   * @param {string} message
   * @param {{retryAfter?: number, details?: unknown}} [extra]
   */
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

/** @typedef {{port: MessagePort, init: any}} Channel */

/** @type {Channel | null} */
let channel = null
/** @type {Promise<Channel> | null} */
let connecting = null
/** @type {Map<string, {resolve: (v:any)=>void, reject: (e:any)=>void, timer: any}>} */
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

    /** @param {MessageEvent} e */
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

/** @param {MessageEvent} e */
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

/** @param {Record<string,string>|undefined} vars */
function applyTheme(vars) {
  if (!vars) return
  const root = document.documentElement
  for (const k in vars) {
    const v = vars[k]
    if (v !== undefined && k.startsWith('--ts-')) root.style.setProperty(k, v)
  }
}

/**
 * @param {string} method
 * @param {unknown} params
 * @returns {Promise<any>}
 */
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
 *
 * @param {string} method
 * @param {unknown} params
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
  /** @param {number} px */
  setHeight: (px) => notify('app.setHeight', px),
  /** @param {string} text */
  setTitle: (text) => notify('app.setTitle', text),
  /**
   * Ask Town Square to open a link for the resident. They see where it goes
   * and choose whether to go. Ordinary `<a href>` links already come here on
   * their own; see `installLinkHandling` below.
   *
   * @param {string} url absolute, or relative to this page
   * @returns {Promise<void>}
   */
  openLink: (url) => call('app.openLink', absolute(url)),
}

/**
 * Resolve a link the way the browser would have, so `app.openLink('/x')` and
 * `<a href="x">` mean what they mean in a normal page. The host checks the
 * result; nothing here decides whether a link is allowed.
 *
 * @param {unknown} url
 * @returns {string}
 */
function absolute(url) {
  try {
    return new URL(String(url), document.baseURI).href
  } catch {
    return String(url)
  }
}

/**
 * Whether following this URL would leave the creation.
 *
 * Same-origin http(s) links stay put, because they are the creation's own
 * business (an in-page `#section`, or its own router). `javascript:` stays put
 * too: it runs in the frame, which is where it was always going to run.
 * Everything else, including `tel:` and `mailto:`, is a link out, and a link
 * out from a sandboxed frame either does nothing or replaces the creation.
 *
 * @param {string} href
 */
function leavesApp(href) {
  let url
  try {
    url = new URL(href)
  } catch {
    return false
  }
  if (url.protocol === 'javascript:') return false
  if ((url.protocol === 'http:' || url.protocol === 'https:') && url.origin === location.origin) {
    return false
  }
  return true
}

/** @param {unknown} err */
function warnLink(err) {
  const message = err && /** @type {any} */ (err).message ? /** @type {any} */ (err).message : err
  console.warn('[Town Square] That link was not opened:', message)
}

/**
 * The closest `<a>` or `<area>` with an href on the event's path, including
 * through shadow roots and inside SVG.
 *
 * @param {Event} e
 * @returns {string | null} the resolved href
 */
function linkHrefFor(e) {
  const path = typeof e.composedPath === 'function' ? e.composedPath() : [e.target]
  for (const node of path) {
    const el = /** @type {any} */ (node)
    if (!el || typeof el.getAttribute !== 'function') continue
    const name = String(el.localName || '').toLowerCase()
    if (name !== 'a' && name !== 'area') continue
    const raw = el.getAttribute('href') ?? el.getAttribute('xlink:href')
    if (raw === null) continue
    try {
      return new URL(raw, el.baseURI || document.baseURI).href
    } catch {
      return null
    }
  }
  return null
}

/**
 * Make ordinary links work inside the sandbox, with no code from the builder.
 *
 * The frame has no `allow-popups`, so `target="_blank"`, `tel:` and `mailto:`
 * links do nothing, and a plain link out replaces the creation with a "tried
 * to send you somewhere else" screen. This catches those clicks and sends them
 * to `app.openLink`, where Town Square shows the resident where the link goes.
 *
 * Bubble phase on `document`, so a creation that handles a click itself and
 * calls `preventDefault()` keeps that click. A handler that calls
 * `stopPropagation()` hides the click from us too, and the browser does what it
 * would have done anyway.
 *
 * `window.open` is routed the same way, and returns `null` just as a blocked
 * popup does, so generated code that checks for a blocked popup still works.
 */
function installLinkHandling() {
  if (typeof document === 'undefined' || typeof window === 'undefined') return

  /** @param {MouseEvent} e */
  const onClick = (e) => {
    if (e.defaultPrevented) return
    // Primary button on `click`, middle button on `auxclick`. Right-click and
    // the rest belong to the browser's context menu.
    if (e.type === 'click' && e.button !== 0) return
    if (e.type === 'auxclick' && e.button !== 1) return
    const href = linkHrefFor(e)
    if (href === null || !leavesApp(href)) return
    e.preventDefault()
    app.openLink(href).catch(warnLink)
  }
  document.addEventListener('click', onClick)
  document.addEventListener('auxclick', onClick)

  /** @type {typeof window.open} */
  const nativeOpen = window.open.bind(window)

  /**
   * @param {string | URL} [url]
   * @param {string} [target]
   * @param {string} [features]
   * @returns {Window | null}
   */
  function routedOpen(url, target, features) {
    if (url !== undefined && url !== '') {
      const href = absolute(url)
      if (leavesApp(href)) {
        app.openLink(href).catch(warnLink)
        return null
      }
    }
    return nativeOpen(url, target, features)
  }
  window.open = routedOpen
}

installLinkHandling()

export const town = {
  info: () => call('town.info', undefined),
  thisWeek: () => call('town.thisWeek', undefined),
  /** @param {object} [opts] */
  items: (opts) => call('town.items', opts || {}),
  /** @param {string} id */
  item: (id) => call('town.item', id),
  /** @param {object} [opts] */
  businesses: (opts) => call('town.businesses', opts || {}),
}

export const user = {
  current: () => call('user.current', undefined),
}

export const records = {
  /** @param {string} type @param {object} [opts] */
  list: (type, opts) => call('records.list', [type, opts]),
  /** @param {string} type @param {string} id */
  get: (type, id) => call('records.get', [type, id]),
  /** @param {string} type @param {object} data */
  create: (type, data) => call('records.create', [type, data]),
  /** @param {string} type @param {string} id @param {object} patch */
  update: (type, id, patch) => call('records.update', [type, id, patch]),
  /** @param {string} type @param {string} id */
  history: (type, id) => call('records.history', [type, id]),
}

export const storage = {
  /** @param {string} key */
  get: (key) => call('storage.get', key),
  /** @param {string} key @param {unknown} value */
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
