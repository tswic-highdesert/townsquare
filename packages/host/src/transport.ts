/**
 * The handshake, and the one moment the host listens on `window`.
 *
 * Three checks run before anything on the message is touched, and they are
 * ordered cheapest-and-strongest first:
 *
 *   1. `event.source === iframe.contentWindow` — a capability check. It asks
 *      "is this literally our frame", which no amount of origin spoofing can
 *      answer falsely.
 *   2. `event.origin === guestOrigin` — exact string equality against the
 *      origin we assigned. Never `startsWith` and never `endsWith`, both of
 *      which `https://a7k2m9x4.tsq-apps.net.evil.com` passes.
 *   3. shape.
 *
 * Then the latch closes and the `window` listener is removed, so the host's
 * message surface after connect is zero. Everything afterwards runs on a
 * `MessagePort`, which is unforgeable: no other frame, opener or extension
 * content script can post to it, and there is no origin to spoof because no
 * origin is involved.
 */

import { PROTOCOL_VERSION, isHello, LIMITS, type Init } from '@townsquare/shared'

export interface ConnectOptions {
  iframe: HTMLIFrameElement
  /** The exact origin this frame was given. */
  guestOrigin: string
  /** Built lazily, so grants reflect the frozen manifest at handshake time. */
  buildInit: () => Init
  timeoutMs?: number
  /**
   * Cancels the handshake, its listener and its timer.
   *
   * A resident who navigates away mid-load should not leave a timer holding a
   * reference to a frame that is already gone, and a teardown that races the
   * handshake is the normal case, not the exotic one.
   */
  signal?: AbortSignal
}

export class HandshakeError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'HandshakeError'
  }
}

export interface Connection {
  port: MessagePort
  close(): void
}

export function connect(opts: ConnectOptions): Promise<Connection> {
  const { iframe, guestOrigin, buildInit } = opts
  const timeoutMs = opts.timeoutMs ?? LIMITS.handshakeTimeoutMs

  return new Promise((resolve, reject) => {
    let settled = false

    const cleanup = () => {
      window.removeEventListener('message', onMessage)
      clearTimeout(timer)
      opts.signal?.removeEventListener('abort', onAbort)
    }

    const onAbort = () => {
      if (settled) return
      settled = true
      cleanup()
      reject(new HandshakeError('The creation was closed before it connected.'))
    }

    const onMessage = (e: MessageEvent) => {
      if (e.source !== iframe.contentWindow) return
      if (e.origin !== guestOrigin) return
      if (!isHello(e.data)) return
      if (e.data.sdk !== PROTOCOL_VERSION) return

      // Exactly one handshake per frame, ever. A second `hello` is an attack or
      // a re-navigation, and neither should be able to take over an
      // established channel. Reusing a frame is never correct; the host tears
      // the element down and builds a new one instead.
      if (settled) return
      settled = true
      cleanup()

      const { port1, port2 } = new MessageChannel()
      // An explicit targetOrigin, always. '*' here would post the init payload,
      // grants included, to whatever the frame had navigated itself to.
      iframe.contentWindow?.postMessage(buildInit(), guestOrigin, [port2])
      port1.start()
      resolve({
        port: port1,
        close: () => {
          try {
            port1.close()
          } catch {
            // Already closed; a teardown racing a crash is normal.
          }
        },
      })
    }

    const timer = setTimeout(() => {
      if (settled) return
      settled = true
      cleanup()
      reject(new HandshakeError('The creation did not connect to Town Square.'))
    }, timeoutMs)

    window.addEventListener('message', onMessage)

    if (opts.signal?.aborted) onAbort()
    else opts.signal?.addEventListener('abort', onAbort, { once: true })
  })
}
