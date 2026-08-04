/**
 * The React wrapper around `CreationHost`.
 *
 * Deliberately thin. All the security-relevant work — the sandbox attributes,
 * the handshake, the permission gate, the height clamp — lives in
 * `@townsquare/host`, which imports no React at all. This component only
 * decides what a resident sees while that happens, which means a native host
 * can reuse every line that matters and reimplement only this file.
 */

import { useEffect, useRef, useState } from 'react'
import { CreationHost, type HostState } from '@townsquare/host'
import type { Manifest } from '@townsquare/manifest'
import { townData } from './townData.js'

export interface CreationFrameProps {
  guestOrigin: string
  manifest: Manifest
  town: { id: string; name: string; timezone: string }
  onTitleChange?(title: string): void
  onIncident?(kind: string, detail: Record<string, unknown>): void
}

export function CreationFrame(props: CreationFrameProps) {
  const mountRef = useRef<HTMLDivElement | null>(null)
  const [state, setState] = useState<HostState>({ name: 'mounting' })
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    const el = mountRef.current
    if (!el) return

    const host = new CreationHost(el, {
      guestOrigin: props.guestOrigin,
      manifest: props.manifest,
      town: props.town,
      context: { user: null, town: townData },
      onStateChange: setState,
      onTitleChange: props.onTitleChange,
      onIncident: props.onIncident,
    })

    void host.mount()

    // Teardown removes the element. A frame is never reused across creations or
    // versions, which is the only reliable way to discard the previous guest's
    // execution context and its timers.
    return () => host.destroy()
    // `attempt` is in the deps so Try again rebuilds the whole host.
  }, [props.guestOrigin, props.manifest, props.town, attempt])

  if (state.name === 'error') {
    return (
      <div className="frame-wrap">
        <Failure
          manifest={props.manifest}
          reason={state.reason}
          onRetry={() => setAttempt((n) => n + 1)}
        />
      </div>
    )
  }

  /*
   * The skeleton is layered *over* the frame, never in place of it.
   *
   * Hiding the mount point until the creation is ready looks reasonable and
   * deadlocks: a `display: none` iframe is never loaded by the browser, so the
   * handshake never happens, so it never becomes ready, so it stays hidden. It
   * then fails with a handshake timeout that reads like the creation's fault.
   * Found by the boundary suite.
   */
  return (
    <div className="frame-wrap frame-stack">
      <div ref={mountRef} />
      {state.name !== 'ready' && (
        <div className="skeleton skeleton-overlay">starting {props.manifest.name}…</div>
      )}
    </div>
  )
}

const REASONS: Record<string, { title: string; body: string }> = {
  handshake_timeout: {
    title: "This one didn't start",
    // The blame goes to the code, never to the resident, and never to a
    // "network error" they cannot act on.
    body: 'The last update broke something. Its builder has been told — nothing you did.',
  },
  ready_timeout: {
    title: "This one didn't finish loading",
    body: 'It connected but never finished rendering. Its builder has been told.',
  },
  navigated: {
    title: 'This one navigated away',
    body: 'It tried to send you somewhere else instead of running here. We have flagged it for review.',
  },
  crashed: {
    title: 'This one stopped responding',
    body: 'It stopped answering Town Square. Its builder has been told.',
  },
}

function Failure(props: { manifest: Manifest; reason: string; onRetry(): void }) {
  const copy = REASONS[props.reason] ?? REASONS['crashed']!

  return (
    <div className="failure">
      <h2>{copy.title}</h2>
      <p>{copy.body}</p>
      <button className="primary" onClick={props.onRetry}>
        Try again
      </button>
      <div className="meta">
        manifest v{props.manifest.version} · {props.reason.replace(/_/g, ' ')}
      </div>
    </div>
  )
}
