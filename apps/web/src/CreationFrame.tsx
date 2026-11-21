/**
 * The React wrapper around `CreationHost`.
 *
 * Deliberately thin. All the security-relevant work — the sandbox attributes,
 * the handshake, the permission gate, the height clamp — lives in
 * `@townsquare/host`, which imports no React at all. This component only
 * decides what a resident sees while that happens, which means a native host
 * can reuse every line that matters and reimplement only this file.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { CreationHost, openOutboundLink, type ErrorReason, type HostState } from '@townsquare/host'
import type { Manifest } from '@townsquare/manifest'
import type { OutboundLink } from '@townsquare/shared'
import { createActTokenHolder } from './actToken.js'
import { townData } from './townData.js'
import { Icon, type IconName } from './Icon.js'
import { Button } from './ui/index.js'
import { LeavingDialog } from './creations/LeavingDialog.js'
import './creations/creations.css'

export interface CreationFrameProps {
  guestOrigin: string
  manifest: Manifest
  /** Minting an act token needs to name the creation. */
  slug: string
  /**
   * The permission view of the signed-in resident, or null.
   *
   * Only `handle` and `verified` — enough to decide whether a write is allowed
   * without the shell holding anything more about a person than a creation is
   * ever told. What the creation actually receives comes from the server, not
   * from this.
   */
  user: { handle: string; verified: boolean } | null
  town: { id: string; name: string; timezone: string }
  onTitleChange?(title: string): void
  onIncident?(kind: string, detail: Record<string, unknown>): void
  /**
   * Lifted so the chrome *around* the frame can react.
   *
   * A creation that navigated itself away is the one failure the host chrome
   * changes shape for, and the chrome is drawn outside this component on
   * purpose — a creation cannot reach a pixel of it.
   */
  onStateChange?(state: HostState): void
  /** Offered instead of a retry on the failure that should not be retried. */
  onLeave?(): void
  onReport?(): void
}

export function CreationFrame(props: CreationFrameProps) {
  const mountRef = useRef<HTMLDivElement | null>(null)
  const [state, setState] = useState<HostState>({ name: 'mounting' })
  const [attempt, setAttempt] = useState(0)
  // The link a creation asked to open, and how to tell the host the resident
  // has answered. The host refuses another link until `answer` runs.
  const [leaving, setLeaving] = useState<{ link: OutboundLink; answer(): void } | null>(null)
  const leavingRef = useRef(leaving)
  leavingRef.current = leaving
  const stackRef = useRef<HTMLDivElement | null>(null)
  const wasLeaving = useRef(false)

  /*
   * After the dialog closes, focus lands just outside the frame rather than
   * back inside it.
   *
   * The host only accepts a link when focus is in the frame and the resident
   * has just pressed something. The dialog's own "Stay here" click is such a
   * press, so returning focus into the frame would let a creation ask again
   * the instant the resident said no, and keep asking. With focus parked here,
   * asking again takes a real new press inside the creation. A keyboard user
   * is one Tab from where they were.
   *
   * This runs after the dialog's own cleanup, which restores focus to whatever
   * opened it, so it has the last word.
   */
  useEffect(() => {
    if (leaving) {
      wasLeaving.current = true
      return
    }
    if (wasLeaving.current) {
      wasLeaving.current = false
      stackRef.current?.focus()
    }
  }, [leaving])

  const closeLeaving = useCallback((go: boolean) => {
    const pending = leavingRef.current
    if (!pending) return
    // Opened from this click, in the shell, which is what lets the browser
    // allow the new tab. The frame itself never could.
    if (go) openOutboundLink(pending.link)
    pending.answer()
    setLeaving(null)
  }, [])

  const { onStateChange } = props
  useEffect(() => {
    const el = mountRef.current
    if (!el) return

    // Minted per mount and held in a closure, never in state. A fresh frame
    // gets a fresh token, which is also what makes signing in or out mid-visit
    // take effect: the frame is rebuilt and the new token carries the new
    // subject.
    const act = createActTokenHolder(props.slug)

    const host = new CreationHost(el, {
      guestOrigin: props.guestOrigin,
      manifest: props.manifest,
      town: props.town,
      context: {
        user: props.user,
        town: townData,
        identity: act.identity,
        storage: act.storage,
      },
      onStateChange: (next) => {
        setState(next)
        onStateChange?.(next)
      },
      onTitleChange: props.onTitleChange,
      onIncident: props.onIncident,
      onOpenLink: (link) =>
        new Promise<void>((answer) => {
          setLeaving({ link, answer })
        }),
    })

    void host.mount()

    // Teardown removes the element. A frame is never reused across creations or
    // versions, which is the only reliable way to discard the previous guest's
    // execution context and its timers.
    return () => {
      host.destroy()
      act.dispose()
      // A dialog belongs to the frame that asked. Rebuilding or leaving the
      // creation withdraws the question rather than leaving it orphaned.
      leavingRef.current?.answer()
      setLeaving(null)
    }
    // `attempt` is in the deps so Try again rebuilds the whole host, and
    // `props.user` is in them so signing in re-mints under the new subject.
  }, [props.guestOrigin, props.manifest, props.slug, props.user, props.town, attempt])

  if (state.name === 'error') {
    return (
      <div className="cr-framewrap">
        <Failure
          manifest={props.manifest}
          reason={state.reason}
          onRetry={() => setAttempt((n) => n + 1)}
          onLeave={props.onLeave}
          onReport={props.onReport}
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
    <div className="cr-framewrap cr-frame-stack" ref={stackRef} tabIndex={-1}>
      <div ref={mountRef} />
      <LeavingDialog
        creationName={props.manifest.name}
        link={leaving?.link ?? null}
        onStay={() => closeLeaving(false)}
        onGo={() => closeLeaving(true)}
      />
      {state.name !== 'ready' && (
        <div className="cr-skeleton cr-skeleton-overlay" aria-busy="true">
          {/*
           * A skeleton's job is to hold the shape the real thing will take, so
           * these are a heading, a line and a block rather than three equal
           * bars. The widths are uneven for the same reason: a stack of
           * full-width rectangles teaches a layout that will not arrive.
           */}
          <div className="cr-sk-line" style={{ width: '52%' }} />
          <div className="cr-sk-line" style={{ width: '78%' }} />
          <div className="cr-sk-block" />
          <div className="cr-sk-line" style={{ width: '64%' }} />
          <div className="cr-sk-note">starting {props.manifest.name}…</div>
        </div>
      )}
    </div>
  )
}

interface FailureCopy {
  title: string
  body: string
  mark: IconName
  /**
   * `hold` is terracotta: something was stopped on purpose. The rest are the
   * neutral plate, because a creation that timed out is a bug and not a
   * betrayal. Brick appears nowhere on this screen; it is the one alarm
   * register and the river is not up.
   */
  tone?: 'hold'
  /**
   * A creation that tried to send a resident somewhere else does not get a Try
   * again. Retrying it is an invitation to keep pressing until it works, which
   * is precisely the wrong instinct in the one failure that was an attempt
   * rather than an accident.
   */
  retry: boolean
}

const REASONS: Record<ErrorReason, FailureCopy> = {
  handshake_timeout: {
    title: "This one didn't start",
    // The blame goes to the code, never to the resident, and never to a
    // "network error" they cannot act on.
    body: 'It never answered Town Square. Its builder has been told, and nothing you did caused it.',
    mark: 'plug',
    retry: true,
  },
  ready_timeout: {
    title: "This one didn't finish loading",
    body: 'It connected but never finished rendering. Its builder has been told, and nothing you did caused it.',
    mark: 'clock',
    retry: true,
  },
  navigated: {
    title: 'This one tried to send you somewhere else',
    body: 'It left Town Square instead of running here. We stopped it and flagged it for the committee. Nothing you did.',
    mark: 'shield',
    tone: 'hold',
    retry: false,
  },
  crashed: {
    title: 'This one stopped responding',
    body: 'It stopped answering Town Square partway through. Its builder has been told.',
    mark: 'alert-circle',
    retry: true,
  },
}

function Failure(props: {
  manifest: Manifest
  reason: ErrorReason
  onRetry(): void
  onLeave?(): void
  onReport?(): void
}) {
  const copy = REASONS[props.reason] ?? REASONS.crashed

  return (
    <div className="cr-failure">
      <span className="cr-failure-mark" data-tone={copy.tone}>
        <Icon name={copy.mark} size={24} />
      </span>
      <h2>{copy.title}</h2>
      <p>{copy.body}</p>

      {copy.retry ? (
        <Button variant="primary" icon="refresh" onClick={props.onRetry}>
          Try again
        </Button>
      ) : (
        <div className="cr-failure-acts">
          {props.onLeave && (
            <Button variant="primary" onClick={props.onLeave}>
              Back to the gallery
            </Button>
          )}
          {props.onReport && (
            <Button variant="secondary" onClick={props.onReport}>
              Report
            </Button>
          )}
        </div>
      )}

      <div className="cr-failure-meta">
        v{props.manifest.version} · {props.reason.replace(/_/g, ' ')}
      </div>
    </div>
  )
}
