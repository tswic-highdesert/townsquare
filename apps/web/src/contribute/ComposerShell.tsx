/**
 * The frame every composer sits in.
 *
 * Five composers, one shell. A resident learns the publish bar once and it
 * never moves: the header names the thing being made, the autosave indicator
 * sits beside it, the body is the only part that changes per type, the
 * attribution line is shown and locked, and the primary action is bottom right
 * with a verb that names the type.
 *
 * Two things here are decisions rather than layout.
 *
 * **The header says what is being made.** "Adding an event", never "New item".
 * If a resident cannot say what they are making, the composer has already
 * failed.
 *
 * **Attribution is shown and it is not a control.** There is no author field in
 * any composer, and there is no dropdown here either. Somebody posting for two
 * organisations switches account at the top of the app, not at the bottom of a
 * form, so the choice is never made by accident in the last second before
 * publishing. The server writes it from the session regardless of anything this
 * screen sends.
 */

import { useState, type ReactNode } from 'react'
import { Button } from '../ui/index.js'
import { Icon } from '../Icon.js'
import type { Attribution } from './contributeData.js'

/** A saved badge appears only after the server confirms the current draft. */
export type SaveState = 'idle' | 'saving' | 'saved' | 'offline'

export interface ComposerShellProps {
  /** "Adding", "Correcting", "Sharing". The verb above the title. */
  kicker: string
  /** What is being made. "An event", or the listing being corrected. */
  title: string
  onBack: () => void
  save: SaveState
  /** Who it will go up as, from the server. Never editable, never a dropdown. */
  attribution: Attribution | null
  /** Write and Preview, when the type has a preview worth showing. */
  preview?: ReactNode
  /** The primary verb. "Post event", "Send correction", "Publish notice". */
  publishLabel: string
  onPublish: () => void
  publishDisabled?: boolean
  onSaveDraft?: (() => void) | undefined
  /** The quiet line at seven a day. Sits under the bar, stops nobody. */
  notice?: string | null
  children: ReactNode
}

export function ComposerShell(props: ComposerShellProps) {
  const [tab, setTab] = useTab(props.preview !== undefined)

  return (
    <div className="cn-comp">
      <div className="cn-comp-bar">
        <button className="cn-icon-btn" type="button" aria-label="Back" onClick={props.onBack}>
          <Icon name="chevron-left" />
        </button>
        <div className="cn-comp-heading">
          <span className="cn-comp-kicker">{props.kicker}</span>
          <span className="cn-comp-title">{props.title}</span>
        </div>
        <SaveIndicator state={props.save} />
      </div>

      {props.preview === undefined ? null : (
        <div className="cn-toggle" role="tablist" aria-label="Write or preview">
          <button
            className="cn-toggle-opt"
            role="tab"
            type="button"
            aria-selected={tab === 'write'}
            data-on={tab === 'write' || undefined}
            onClick={() => setTab('write')}
          >
            Write
          </button>
          <button
            className="cn-toggle-opt"
            role="tab"
            type="button"
            aria-selected={tab === 'preview'}
            data-on={tab === 'preview' || undefined}
            onClick={() => setTab('preview')}
          >
            Preview
          </button>
        </div>
      )}

      <div className="cn-body">{tab === 'preview' ? props.preview : props.children}</div>

      {props.attribution ? <AttributionRow attribution={props.attribution} /> : null}

      {props.notice ? (
        <p className="cn-quiet-line" role="status">
          <Icon name="info" size={16} />
          {props.notice}
        </p>
      ) : null}

      <footer className="cn-publish">
        {props.onSaveDraft ? (
          <Button variant="quiet" onClick={props.onSaveDraft} disabled={props.publishDisabled}>
            Save draft
          </Button>
        ) : (
          <span />
        )}
        <Button variant="primary" onClick={props.onPublish} disabled={props.publishDisabled}>
          {props.publishLabel}
        </Button>
      </footer>
    </div>
  )
}

/**
 * A status line, not a save button.
 *
 * `role="status"` with a stable node so it is announced once when the state
 * settles rather than on every keystroke, which is the difference between an
 * assistive technology saying "saved" and it saying "saving saving saving".
 */
function SaveIndicator({ state }: { state: SaveState }) {
  if (state === 'idle') return <span className="cn-save" role="status" />
  return (
    <span className="cn-save" data-state={state} role="status">
      {state === 'saving' ? (
        <>
          <Icon name="loader" size={16} className="cn-spin" />
          Saving
        </>
      ) : state === 'offline' ? (
        <>
          <Icon name="cloud-upload" size={16} />
          Not saved — keep this page open
        </>
      ) : (
        <>
          <Icon name="check" size={16} />
          Saved
        </>
      )}
    </span>
  )
}

/**
 * Who the town will say made this.
 *
 * Rendered from the server's own answer. The lock glyph is not decoration: it
 * is the affordance that says this is information rather than a control, which
 * is the entire reason the row exists on a form where every other line is
 * editable.
 */
export function AttributionRow({ attribution }: { attribution: Attribution }) {
  return (
    <div className="cn-asrow" data-org={attribution.kind === 'organisation' || undefined}>
      <Icon name={attribution.kind === 'organisation' ? 'badge-check' : 'lock'} size={16} />
      <span>{attributionSentence(attribution)}</span>
    </div>
  )
}

/**
 * The sentence, per attribution shape.
 *
 * The dual case reads "through", not "using" or "via": a creation writing on a
 * resident's behalf is the person speaking through a tool, and the person
 * answers for the content while the creation answers for the behaviour.
 */
export function attributionSentence(attribution: Attribution): ReactNode {
  switch (attribution.kind) {
    case 'resident':
      return (
        <>
          Contributing as <b>@{attribution.handle}</b>
        </>
      )
    case 'resident_via_creation':
      return (
        <>
          Posting as <b>@{attribution.handle}</b>, through {attribution.creationName}
        </>
      )
    case 'organisation':
      return (
        <>
          Posting as <b>{attribution.orgName}</b>, by @{attribution.handle}
        </>
      )
    case 'creation':
      // No acting user, so none is claimed. The phrasing changes from "added
      // by" to "kept up to date by" so nobody reads a person into it.
      return (
        <>
          Kept up to date by <b>{attribution.creationName}</b>, owned by @{attribution.ownerHandle}
        </>
      )
    case 'source':
      return <>From {attribution.label}</>
  }
}

/* Local, tiny, and not worth a hook file. */
function useTab(hasPreview: boolean): ['write' | 'preview', (t: 'write' | 'preview') => void] {
  const [tab, setTab] = useState<'write' | 'preview'>('write')
  return [hasPreview ? tab : 'write', setTab]
}
