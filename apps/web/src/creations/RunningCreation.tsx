/**
 * A creation, running, with Town Square's chrome around it.
 *
 * The whole screen is the seam: our strip, then a different registrable domain,
 * then somebody's bundle, then our strip again. The parts on our side of it are
 * drawn here; nothing in this file can be reached from inside the frame.
 *
 * One state in the design is not here, and it is worth saying why rather than
 * leaving it looking like an oversight. The **permission-in-use row** — the
 * pills that appear while a creation is actually talking to a host or reading
 * records, and fade two seconds after the traffic stops — needs a signal the
 * bridge does not emit. `CreationHost` reports state changes, titles and
 * incidents; it has no per-call activity callback, and inventing the row from
 * the declared permissions would turn "a list that appears when something
 * happens" back into the permanent wallpaper the design was defined against.
 * The bridge would need to say when a call crosses it.
 *
 * The **write-back consent sheet** is absent for the same class of reason:
 * `records.*` throws `NotYetError` in `packages/host/src/bridge.ts`, so no
 * creation can ask to write anything yet, and a consent sheet with no possible
 * trigger is a screen nobody could ever reach.
 */

import { useState } from 'react'
import type { HostState } from '@townsquare/host'
import { CreationFrame } from '../CreationFrame.js'
import { ReportPanel } from '../ReportPanel.js'
import { FooterChrome, HostChrome } from './HostChrome.js'
import type { CreationSummary } from '../townData.js'
import './creations.css'

export interface RunningCreationProps {
  creation: CreationSummary
  town: { id: string; name: string; timezone: string }
  /** Null when signed out. Only ever the handle and the verification. */
  user: { handle: string; verified: boolean } | null
  /** Back to the trust page this resident came through. */
  onBack: () => void
  /** Out of the creation entirely, offered when it misbehaved. */
  onLeave: () => void
}

export function RunningCreation(props: RunningCreationProps) {
  const { creation } = props
  const [liveTitle, setLiveTitle] = useState<string | null>(null)
  const [reporting, setReporting] = useState(false)
  const [state, setState] = useState<HostState>({ name: 'mounting' })

  /*
   * The chrome goes into its alert treatment for exactly one failure: the
   * creation navigated itself away. That is the residual hole CSP cannot close
   * — `navigate-to` was dropped from the spec and never shipped — so the host
   * notices a second load and fails closed, and the strip says so in our voice.
   *
   * Terracotta, not brick. A creation trying to leave is a nuisance the
   * platform already caught, not the river coming up, and spending the alarm
   * register here is how it stops meaning anything at 6am.
   */
  const misbehaved = state.name === 'error' && state.reason === 'navigated'

  return (
    <main className="shell cr-screen">
      <HostChrome
        creation={creation}
        liveTitle={liveTitle}
        alert={misbehaved}
        onBack={() => {
          setLiveTitle(null)
          setReporting(false)
          props.onBack()
        }}
      />

      <CreationFrame
        guestOrigin={creation.origin}
        manifest={creation.manifest}
        slug={creation.slug}
        user={props.user}
        town={props.town}
        onTitleChange={setLiveTitle}
        onStateChange={setState}
        onLeave={props.onLeave}
        onReport={() => setReporting(true)}
        onIncident={(kind, detail) => console.warn('creation incident', kind, detail)}
      />

      <FooterChrome
        version={creation.manifest.version}
        reporting={reporting}
        onToggleReport={() => setReporting((open) => !open)}
      />

      {/*
        Rendered under the chrome, outside the frame. A creation cannot draw
        here, so a resident reporting one is always talking to Town Square and
        never to the thing they are reporting.
      */}
      {reporting && (
        <ReportPanel
          slug={creation.slug}
          name={creation.name}
          version={creation.manifest.version}
          account={props.user}
          onClose={() => setReporting(false)}
        />
      )}
    </main>
  )
}
