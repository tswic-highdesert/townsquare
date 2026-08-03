/**
 * The frame, its lifecycle, and the exact attributes that are the boundary.
 *
 * Plain TypeScript with no framework imports, because a native WebView host
 * should be able to drive the same protocol without reimplementing any of it,
 * and because the security-critical attribute list should be readable in one
 * place rather than routed through a rendering shim.
 */

import type { Manifest } from '@townsquare/manifest'
import { advisoryGrants } from '@townsquare/sdk'
import { cssVariables } from '@townsquare/tokens'
import { LIMITS, PROTOCOL_VERSION, type Event as WireEvent, type Init } from '@townsquare/shared'
import { Bridge, type BridgeContext } from './bridge.js'
import { connect, type Connection } from './transport.js'

/**
 * The sandbox token list, and why each absence is deliberate.
 *
 * `allow-scripts` with `allow-same-origin` is safe *here specifically* because
 * the bundle origin is a different registrable domain from the shell. The
 * usual warning about this pair applies when the framed document is same-origin
 * with its embedder, where the frame can reach into the parent and delete its
 * own sandbox attribute. It cannot: `window.parent` is opaque to it. This is
 * the CodePen and StackBlitz configuration. Expect to re-explain this in every
 * future review, which is why the explanation lives next to the string.
 *
 * Absent on purpose:
 *   allow-popups                      window.open() is egress that CSP cannot see
 *   allow-popups-to-escape-sandbox    would hand a popup ambient privileges
 *   allow-top-navigation*             would let a frame navigate the whole tab away
 *   allow-downloads                   drive-by download
 *   allow-pointer-lock                UI hijack
 *   allow-presentation                no use case
 *   allow-storage-access-by-user-activation   nothing good comes of granting it
 *
 * `allow-modals` is included reluctantly. alert() and confirm() appear in a
 * large share of generated code and silently no-op without it.
 */
export const SANDBOX_TOKENS = 'allow-scripts allow-same-origin allow-forms allow-modals'

/** Every powerful feature, denied at the frame boundary as well as in the CSP. */
export const ALLOW_ATTRIBUTE = [
  'accelerometer',
  'ambient-light-sensor',
  'autoplay',
  'camera',
  'clipboard-read',
  'clipboard-write',
  'display-capture',
  'encrypted-media',
  'geolocation',
  'gyroscope',
  'hid',
  'idle-detection',
  'local-fonts',
  'magnetometer',
  'microphone',
  'midi',
  'payment',
  'publickey-credentials-get',
  'screen-wake-lock',
  'serial',
  'usb',
  'xr-spatial-tracking',
]
  .map((feature) => `${feature} 'none'`)
  .join('; ')

export type HostState =
  | { name: 'mounting' }
  | { name: 'loading' }
  | { name: 'ready' }
  | { name: 'error'; reason: ErrorReason; detail?: string }
  | { name: 'teardown' }

/**
 * `navigated` is the residual hole named honestly in the threat model: CSP
 * cannot stop a frame navigating *itself* offsite, because `navigate-to` was
 * dropped from the spec and never shipped. What we can do is notice, and a
 * second load event after ready is exactly what that looks like.
 */
export type ErrorReason = 'handshake_timeout' | 'ready_timeout' | 'navigated' | 'crashed'

export interface CreationHostConfig {
  /** The creation's own origin, e.g. `https://a7k2m9x4.tsq-apps.net`. */
  guestOrigin: string
  /** The approved, frozen manifest. The permission boundary. */
  manifest: Manifest
  town: { id: string; name: string; timezone: string }
  /** Everything the bridge can reach on the creation's behalf. */
  context: Omit<BridgeContext, 'manifest' | 'frame'>
  onStateChange?(state: HostState): void
  onTitleChange?(title: string): void
  onHeightChange?(px: number): void
  onIncident?(kind: string, detail: Record<string, unknown>): void
  /** Injectable for tests. */
  timeouts?: { handshakeMs?: number; readyMs?: number }
}

export class CreationHost {
  private readonly el: HTMLElement
  private readonly cfg: CreationHostConfig
  private iframe: HTMLIFrameElement | null = null
  private connection: Connection | null = null
  private bridge: Bridge | null = null
  private state: HostState = { name: 'mounting' }
  private readyTimer: ReturnType<typeof setTimeout> | null = null
  private loadCount = 0
  private readonly aborter = new AbortController()
  private height: number = LIMITS.skeletonHeight

  constructor(el: HTMLElement, cfg: CreationHostConfig) {
    this.el = el
    this.cfg = cfg
  }

  getState(): HostState {
    return this.state
  }

  getHeight(): number {
    return this.height
  }

  async mount(): Promise<void> {
    const iframe = document.createElement('iframe')
    iframe.setAttribute('src', this.cfg.guestOrigin + '/')
    iframe.setAttribute('sandbox', SANDBOX_TOKENS)
    iframe.setAttribute('allow', ALLOW_ATTRIBUTE)
    iframe.setAttribute('referrerpolicy', 'no-referrer')
    iframe.setAttribute('loading', 'lazy')
    iframe.setAttribute('title', `${this.cfg.manifest.name} — a resident-built creation`)
    iframe.style.width = '100%'
    iframe.style.border = '0'
    iframe.style.display = 'block'
    iframe.style.height = `${LIMITS.skeletonHeight}px`

    iframe.addEventListener('load', this.onLoad)

    this.iframe = iframe
    this.el.appendChild(iframe)
    this.setState({ name: 'loading' })

    try {
      const connection = await connect({
        iframe,
        guestOrigin: this.cfg.guestOrigin,
        buildInit: () => this.buildInit(),
        timeoutMs: this.cfg.timeouts?.handshakeMs ?? LIMITS.handshakeTimeoutMs,
        signal: this.aborter.signal,
      })
      if (this.state.name === 'teardown') {
        connection.close()
        return
      }
      this.connection = connection
      this.bridge = new Bridge({
        ...this.cfg.context,
        manifest: this.cfg.manifest,
        frame: {
          ready: () => this.onGuestReady(),
          setHeight: (px) => this.applyHeight(px),
          setTitle: (text) => this.applyTitle(text),
        },
        onIncident: this.cfg.onIncident,
      })
      connection.port.onmessage = this.onPortMessage

      this.readyTimer = setTimeout(() => {
        this.fail('ready_timeout')
      }, this.cfg.timeouts?.readyMs ?? LIMITS.readyTimeoutMs)
    } catch {
      // A teardown that races the handshake is not a failure to report.
      if (this.state.name !== 'teardown') this.fail('handshake_timeout')
    }
  }

  /**
   * A second load after the handshake means the frame navigated itself, which
   * is the one exfiltration channel CSP cannot close. It is self-defeating (the
   * app visibly disappears) but it should never pass silently.
   */
  private onLoad = (): void => {
    this.loadCount++
    if (this.loadCount > 1 && this.state.name !== 'teardown') {
      this.cfg.onIncident?.('unexpected_navigation', { loads: this.loadCount })
      this.fail('navigated')
    }
  }

  private onPortMessage = (e: MessageEvent): void => {
    void this.dispatch(e.data)
  }

  private async dispatch(data: unknown): Promise<void> {
    if (!this.bridge || !this.connection) return
    const response = await this.bridge.handle(data)
    if (!response) return
    if (this.state.name === 'teardown') return
    try {
      this.connection.port.postMessage(response)
    } catch {
      // The port closed under us mid-flight. Normal during teardown.
    }
  }

  private onGuestReady(): void {
    if (this.readyTimer) {
      clearTimeout(this.readyTimer)
      this.readyTimer = null
    }
    // Idempotent: `app.ready()` also auto-fires from the SDK, so a creation
    // that calls it explicitly must not be punished with a state churn.
    if (this.state.name === 'loading') this.setState({ name: 'ready' })
  }

  /**
   * The host cannot measure cross-origin content, so the guest reports and the
   * host clamps. The clamp is not cosmetic: an unclamped guest can report ten
   * million pixels and destroy the shell's scrolling.
   */
  private applyHeight(px: number): void {
    if (!Number.isFinite(px)) return
    const clamped = Math.min(LIMITS.maxHeight, Math.max(LIMITS.minHeight, Math.round(px)))
    if (clamped === this.height) return
    this.height = clamped
    if (this.iframe) this.iframe.style.height = `${clamped}px`
    this.cfg.onHeightChange?.(clamped)
  }

  private applyTitle(text: string): void {
    // Truncated, and handed to the shell as a plain string. The shell renders
    // it as a text node; it never reaches innerHTML.
    this.cfg.onTitleChange?.(String(text).slice(0, LIMITS.maxTitleChars))
  }

  /** Host to guest, unsolicited. */
  send(event: WireEvent['event'], data: unknown): void {
    if (!this.connection || this.state.name === 'teardown') return
    const message: WireEvent = { ts: PROTOCOL_VERSION, kind: 'evt', event, data }
    try {
      this.connection.port.postMessage(message)
    } catch {
      // Closed port. Nothing to do.
    }
  }

  private buildInit(): Init {
    const height = this.cfg.manifest.display.height
    return {
      ts: PROTOCOL_VERSION,
      kind: 'init',
      town: this.cfg.town,
      theme: cssVariables(),
      display: { surface: this.cfg.manifest.display.surface, height },
      grants: advisoryGrants(this.cfg.manifest),
    }
  }

  private fail(reason: ErrorReason, detail?: string): void {
    if (this.state.name === 'teardown' || this.state.name === 'error') return
    this.cfg.onIncident?.(reason, detail ? { detail } : {})
    this.setState(detail ? { name: 'error', reason, detail } : { name: 'error', reason })
  }

  private setState(state: HostState): void {
    this.state = state
    this.cfg.onStateChange?.(state)
  }

  /**
   * Teardown always removes the element.
   *
   * A frame is never reused across creations or versions. Building a fresh
   * element is the only reliable way to discard the guest's execution context,
   * its timers, and its in-flight work; anything else leaves the previous app
   * running behind the new one.
   */
  destroy(): void {
    if (this.state.name === 'teardown') return
    this.send('teardown', null)
    this.setState({ name: 'teardown' })
    this.aborter.abort()

    if (this.readyTimer) {
      clearTimeout(this.readyTimer)
      this.readyTimer = null
    }
    this.connection?.close()
    this.connection = null
    this.bridge = null

    if (this.iframe) {
      this.iframe.removeEventListener('load', this.onLoad)
      this.iframe.remove()
      this.iframe = null
    }
  }
}
