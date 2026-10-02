/**
 * Contribute: the screen a resident adds something from.
 *
 * The whole surface is one state machine — a list of what you have proposed, a
 * chooser, one composer at a time, and the outcome — because a composer that
 * lives in a modal over another screen is a composer that loses work when
 * somebody taps behind it.
 *
 * Three things are worth knowing before reading the code.
 *
 * **Nothing here decides whether something may be posted.** The gate matrix,
 * the standing checks, the pause and the attribution all come back from the
 * service as data. The composer renders the answer. A client that predicted the
 * gate would be a second implementation of the policy, and the two would
 * disagree on the day it mattered.
 *
 * **Autosave is real, and it is why the drafts list exists.** Saving is worth
 * nothing if a resident cannot find the thing it saved, so the drafts list is
 * one tap from the plus and the composer resumes exactly where it was.
 *
 * **A draft is never publishable without passing the same validation the queue
 * runs.** Publishing from a draft sends the draft id and the server loads,
 * validates and submits it through the identical path. The client cannot skip a
 * check by having saved something first.
 */

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import './contribute.css'
import { Button, ErrorState, Modal, Skeleton } from '../ui/index.js'
import { Icon } from '../Icon.js'
import {
  discardDraft,
  fetchMine,
  fetchOptions,
  isError,
  saveDraft,
  submit,
  withdraw,
  type ContributeOptions,
  type ContributeError,
  type Contribution,
  type ContributionType,
  type Draft,
  type MinePayload,
  type SubmitResult,
} from './contributeData.js'
import { Chooser } from './Chooser.js'
import { ComposerShell, type SaveState } from './ComposerShell.js'
import {
  emptyEvent,
  eventContent,
  eventMissing,
  EventComposer,
  EventPreview,
  type EventDraft,
} from './EventComposer.js'
import {
  correctionContent,
  correctionMissing,
  CorrectionComposer,
  emptyCorrection,
  type CorrectionDraft,
} from './CorrectionComposer.js'
import {
  emptyNotice,
  noticeContent,
  noticeMissing,
  NoticeComposer,
  NoticeGate,
  type NoticeDraft,
} from './NoticeGate.js'
import {
  collectionContent,
  collectionMissing,
  CollectionComposer,
  emptyCollection,
  type CollectionDraft,
} from './CollectionComposer.js'
import { ContributionRow, MineEmpty, OutcomePanel, PausePanel } from './Outcome.js'
import { PhotoUnavailable } from './PhotoUnavailable.js'
import { DraftsList } from './Drafts.js'
import { HistoryPanel } from './History.js'

type View =
  | { at: 'mine' }
  | { at: 'composing'; type: ContributionType }
  | { at: 'outcome'; result: SubmitResult }
  | { at: 'drafts' }
  | { at: 'history'; recordId: string }

/** One bag holding whichever composer is open. Only one is ever live. */
interface Drafts {
  event: EventDraft
  correction: CorrectionDraft
  notice: NoticeDraft
  collection: CollectionDraft
}

const EMPTY_DRAFTS: Drafts = {
  event: emptyEvent,
  correction: emptyCorrection,
  notice: emptyNotice,
  collection: emptyCollection,
}

export interface ContributeScreenProps {
  onBack: () => void
  /** Opens straight into the chooser, for the plus in the tab bar. */
  startOpen?: boolean
}

export function ContributeScreen(props: ContributeScreenProps) {
  const [options, setOptions] = useState<ContributeOptions | null>(null)
  const [mine, setMine] = useState<MinePayload | null>(null)
  const [failed, setFailed] = useState(false)
  const [signedOut, setSignedOut] = useState(false)
  const [view, setView] = useState<View>({ at: 'mine' })
  const [chooser, setChooser] = useState(props.startOpen ?? false)
  const [drafts, setDrafts] = useState<Drafts>(EMPTY_DRAFTS)
  const draftId = useRef<string | null>(null)
  const composerGeneration = useRef(0)
  const pendingSave = useRef<Promise<Draft | ContributeError | null> | null>(null)
  const publishingRef = useRef(false)
  const [publishing, setPublishing] = useState(false)
  const [actionProblem, setActionProblem] = useState<string | null>(null)
  const [save, setSave] = useState<SaveState>('idle')
  const [saveAttempt, setSaveAttempt] = useState(0)
  const [problem, setProblem] = useState<string | null>(null)
  const [paused, setPaused] = useState<string | null>(null)
  const [discarding, setDiscarding] = useState<Draft | null>(null)

  const reload = useCallback(async (initial = false) => {
    try {
      const [opts, list] = await Promise.all([fetchOptions(), fetchMine()])
      if (opts === null || list === null) {
        setSignedOut(true)
        return
      }
      setOptions(opts)
      setMine(list)
    } catch {
      if (initial) setFailed(true)
      else setActionProblem('The latest status could not be loaded. Your confirmed submission is unchanged. Try again in a moment.')
    }
  }, [])

  useEffect(() => {
    void reload(true)
  }, [reload])

  const type = view.at === 'composing' ? view.type : null
  const content = useMemo(() => contentFor(type, drafts), [type, drafts])

  /**
   * Autosave.
   *
   * Debounced rather than per keystroke, and it never blocks the composer: the
   * offline state exists because signal on the river road is bad enough that a
   * composer which pretends to have saved is a composer that loses work.
   */
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => {
    if (type === null || content === null || publishing) return
    let active = true
    const generation = composerGeneration.current
    setSave('idle')
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => {
      setSave('saving')
      const previous = pendingSave.current
      // Serialize writes so a slower, older save cannot overwrite newer text.
      const request = (async () => {
        const previousResult = await previous?.catch(() => null)
        if (!active || generation !== composerGeneration.current || publishingRef.current) return previousResult ?? null
        const result = await saveDraft({ id: draftId.current, type, content })
        // Keep an assigned ID even when newer typing superseded this response.
        if (!isError(result) && generation === composerGeneration.current) draftId.current = result.id
        return result
      })()
      pendingSave.current = request
      void request.then((result) => {
        if (!active || result === null) return
        setSave(isError(result) ? 'offline' : 'saved')
      }, () => { if (active) setSave('offline') })
    }, 1200)
    return () => {
      active = false
      if (saveTimer.current) clearTimeout(saveTimer.current)
    }
  }, [type, content, publishing, saveAttempt])

  if (signedOut) {
    return (
      <Shell onBack={props.onBack}>
        <ErrorState
          line="Sign in to add something."
          sub="Everything you add carries your handle, so we need to know who you are first."
        />
      </Shell>
    )
  }

  if (failed) {
    return (
      <Shell onBack={props.onBack}>
        <ErrorState line="We could not load this." sub="Try again in a moment." />
      </Shell>
    )
  }

  if (!options || !mine) {
    return (
      <Shell onBack={props.onBack}>
        <Skeleton shape="line" width="60%" />
        <Skeleton shape="block" height={120} />
      </Shell>
    )
  }

  function openComposer(next: ContributionType) {
    setChooser(false)
    setActionProblem(null)
    setProblem(null)
    setPaused(null)
    composerGeneration.current += 1
    draftId.current = null
    setSave('idle')
    setDrafts(EMPTY_DRAFTS)
    setView({ at: 'composing', type: next })
  }

  async function publish() {
    if (type === null || content === null || publishingRef.current) return
    const missing = missingFor(type, drafts)
    if (missing) {
      setProblem(missing)
      return
    }
    setProblem(null)
    setActionProblem(null)
    publishingRef.current = true
    setPublishing(true)
    if (saveTimer.current) clearTimeout(saveTimer.current)

    /**
     * Publish what is on screen, never the last autosave.
     *
     * Sending `draftId` makes the server load, validate and publish the stored
     * draft, which is right when somebody publishes from the drafts list and
     * wrong here: autosave is debounced, so a resident who confirms a date and
     * presses Post inside that window would publish a copy of their work from
     * a second and a half ago. That is exactly the class of gap the queue's
     * "approve one exact version" rule exists to close, and it showed up here
     * as an event refusing to post with its start time visibly confirmed on
     * the screen.
     *
     * The draft is scratch space; the composer is the truth. So the content
     * goes up as it stands and the draft is thrown away afterwards.
     */
    const generation = composerGeneration.current
    const savingDraft = pendingSave.current
    const existingDraftId = draftId.current
    const result = await submit({ type, content })
    if (isError(result)) {
      // The pause is its own screen rather than an error line, because it is
      // not a refusal and should not read as one.
      if (result.error === 'paused') setPaused(result.message)
      else setProblem(result.message)
      publishingRef.current = false
      setPublishing(false)
      return
    }
    // Submission is already confirmed. Cleanup cannot turn it into a failure.
    setView({ at: 'outcome', result })
    const savedResult = await savingDraft?.catch(() => null)
    const savedDraft = (generation === composerGeneration.current ? draftId.current : null)
      ?? (savedResult && !isError(savedResult) ? savedResult.id : existingDraftId)
    if (generation === composerGeneration.current) draftId.current = null
    if (savedDraft && !await discardDraft(savedDraft)) {
      setActionProblem('Your submission was sent, but its draft could not be removed. Check Drafts before sending it again.')
    }
    publishingRef.current = false
    setPublishing(false)
    void reload()
  }

  async function withdrawContribution(id: string) {
    setActionProblem(null)
    const result = await withdraw(id)
    if (isError(result)) setActionProblem(result.message)
    else await reload()
  }

  async function discardSavedDraft(target: Draft) {
    setActionProblem(null)
    if (await discardDraft(target.id)) {
      setDiscarding(null)
      await reload()
    } else {
      setDiscarding(null)
      setActionProblem('We could not confirm that the draft was removed. It is still shown here; try again.')
    }
  }

  async function resume(draft: Draft) {
    composerGeneration.current += 1
    draftId.current = draft.id
    setDrafts(resumeInto(draft, EMPTY_DRAFTS))
    setSave('saved')
    setView({ at: 'composing', type: draft.type })
  }

  const attribution = mine.contributions[0]?.attribution ?? null
  const handle = handleOf(attribution)

  return (
    <Shell onBack={view.at === 'mine' ? props.onBack : () => setView({ at: 'mine' })}>
      {actionProblem && <p className="cn-problem" role="alert">{actionProblem}</p>}
      {view.at === 'mine' ? (
        <>
          <div className="cn-mine-head-row">
            <h1 className="cn-h1">What you have added</h1>
            <Button variant="primary" icon="plus" onClick={() => setChooser(true)}>
              Add something
            </Button>
          </div>

          {mine.notice ? (
            <p className="cn-quiet-line" role="status">
              <Icon name="info" size={16} />
              {mine.notice}
            </p>
          ) : null}

          {mine.drafts.length > 0 ? (
            <button type="button" className="cn-drafts-link" onClick={() => setView({ at: 'drafts' })}>
              <Icon name="archive" size={16} />
              {mine.drafts.length === 1 ? '1 draft' : `${mine.drafts.length} drafts`}, not posted yet
            </button>
          ) : null}

          {mine.contributions.length === 0 ? (
            <MineEmpty onAdd={() => setChooser(true)} />
          ) : (
            <ul className="cn-mine">
              {mine.contributions.map((c: Contribution) => (
                <ContributionRow
                  key={c.id}
                  contribution={c}
                  onWithdraw={(id) => void withdrawContribution(id)}
                  onHistory={(recordId) => setView({ at: 'history', recordId })}
                />
              ))}
            </ul>
          )}
        </>
      ) : null}

      {view.at === 'drafts' ? (
        <DraftsList
          drafts={mine.drafts}
          onResume={(d) => void resume(d)}
          onDiscard={(d) => setDiscarding(d)}
        />
      ) : null}

      {view.at === 'history' ? <HistoryPanel recordId={view.recordId} /> : null}

      {view.at === 'outcome' ? (
        <OutcomePanel
          result={view.result}
          onDone={() => setView({ at: 'mine' })}
          onHistory={(recordId) => setView({ at: 'history', recordId })}
        />
      ) : null}

      {view.at === 'composing' && paused ? (
        <PausePanel
          pause={mine.pause}
          message={paused}
          onDraft={() => {
            setPaused(null)
            setView({ at: 'mine' })
          }}
        />
      ) : null}

      {view.at === 'composing' && !paused ? (
        <Composer
          type={view.type}
          drafts={drafts}
          setDrafts={setDrafts}
          options={options}
          attribution={attribution}
          handle={handle}
          save={save}
          publishing={publishing}
          notice={mine.notice}
          problem={problem}
          onBack={() => setView({ at: 'mine' })}
          onPublish={() => void publish()}
          onSaveDraft={() => setSaveAttempt(value => value + 1)}
          onPick={openComposer}
        />
      ) : null}

      <Chooser
        open={chooser}
        onClose={() => setChooser(false)}
        types={options.types}
        onPick={openComposer}
        onDrafts={() => {
          setChooser(false)
          setView({ at: 'drafts' })
        }}
        draftCount={mine.drafts.length}
      />

      <Modal
        open={discarding !== null}
        onClose={() => setDiscarding(null)}
        kind="confirm"
        title="Throw this draft away?"
        description={
          discarding
            ? `"${discarding.title}", with everything you already put in. This one is a real delete, not a version, because a draft was never published and there is nothing to keep a history of.`
            : ''
        }
        actions={
          <>
            {/* Keep it reads first and is the button a thumb finds. The
                destructive variant is bordered rather than filled, which the
                primitives already get right: a filled destructive button is a
                button people press by accident. */}
            <Button variant="secondary" onClick={() => setDiscarding(null)}>
              Keep it
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                const target = discarding
                if (target) void discardSavedDraft(target)
              }}
            >
              Throw it away
            </Button>
          </>
        }
      />
    </Shell>
  )
}

function Shell(props: { onBack: () => void; children: ReactNode }) {
  return (
    <div className="cn-screen">
      <Button variant="quiet" size="sm" icon="arrow-left" className="cn-back" onClick={props.onBack}>
        Back
      </Button>
      {props.children}
    </div>
  )
}

function Composer(props: {
  type: ContributionType
  drafts: Drafts
  setDrafts: (d: Drafts) => void
  options: ContributeOptions
  attribution: ReturnType<typeof handleOf> extends never ? never : Contribution['attribution'] | null
  handle: string | null
  save: SaveState
  publishing: boolean
  notice: string | null
  problem: string | null
  onBack: () => void
  onPublish: () => void
  onSaveDraft: () => void
  onPick: (type: ContributionType) => void
}) {
  const gate = props.options.types.find((t) => t.type === props.type)

  if (props.type === 'photo') {
    return <PhotoUnavailable reason={gate?.reason ?? null} onBack={props.onBack} />
  }

  if (props.type === 'notice' && gate && !gate.allowed) {
    return (
      <NoticeGate
        reason={gate.reason}
        onPickEvent={() => props.onPick('event')}
        onPickCorrection={() => props.onPick('correction')}
      />
    )
  }

  const meta = COMPOSERS[props.type as Exclude<ContributionType, 'photo'>]

  return (
    <ComposerShell
      kicker={meta.kicker}
      title={meta.title}
      onBack={props.onBack}
      save={props.save}
      attribution={props.attribution}
      publishLabel={props.publishing ? 'Sending…' : meta.publish}
      publishDisabled={props.publishing}
      onPublish={props.onPublish}
      onSaveDraft={props.onSaveDraft}
      notice={props.notice}
      preview={
        props.type === 'event' ? (
          <EventPreview draft={props.drafts.event} handle={props.handle} />
        ) : undefined
      }
    >
      {props.problem ? (
        <p className="cn-problem" role="alert">
          <Icon name="alert-circle" size={16} />
          {props.problem}
        </p>
      ) : null}

      {props.type === 'event' ? (
        <EventComposer
          draft={props.drafts.event}
          onChange={(event) => props.setDrafts({ ...props.drafts, event })}
        />
      ) : null}
      {props.type === 'correction' ? (
        <CorrectionComposer
          draft={props.drafts.correction}
          onChange={(correction) => props.setDrafts({ ...props.drafts, correction })}
        />
      ) : null}
      {props.type === 'notice' ? (
        <NoticeComposer
          draft={props.drafts.notice}
          onChange={(notice) => props.setDrafts({ ...props.drafts, notice })}
        />
      ) : null}
      {props.type === 'collection' ? (
        <CollectionComposer
          draft={props.drafts.collection}
          onChange={(collection) => props.setDrafts({ ...props.drafts, collection })}
        />
      ) : null}
    </ComposerShell>
  )
}

const COMPOSERS = {
  event: { kicker: 'Adding', title: 'An event', publish: 'Post event' },
  correction: { kicker: 'Correcting', title: 'A listing', publish: 'Send correction' },
  notice: { kicker: 'Posting', title: 'A notice', publish: 'Publish notice' },
  collection: { kicker: 'Making', title: 'A collection', publish: 'Publish collection' },
} as const

function contentFor(type: ContributionType | null, drafts: Drafts): unknown {
  switch (type) {
    case 'event':
      return eventContent(drafts.event)
    case 'correction':
      return correctionContent(drafts.correction)
    case 'notice':
      return noticeContent(drafts.notice)
    case 'collection':
      return collectionContent(drafts.collection)
    default:
      return null
  }
}

function missingFor(type: ContributionType, drafts: Drafts): string | null {
  switch (type) {
    case 'event':
      return eventMissing(drafts.event)
    case 'correction':
      return correctionMissing(drafts.correction)
    case 'notice':
      return noticeMissing(drafts.notice)
    case 'collection':
      return collectionMissing(drafts.collection)
    default:
      return null
  }
}

/**
 * Put a saved draft back in the composer.
 *
 * Tolerant on purpose: a draft holds whatever the composer had, including
 * half-finished nonsense, and a resume that threw on a missing field would
 * make autosave useless exactly when it is most needed.
 */
function resumeInto(draft: Draft, base: Drafts): Drafts {
  const c = draft.content as Record<string, unknown>
  const str = (key: string, fallback = '') =>
    typeof c[key] === 'string' ? (c[key] as string) : fallback

  switch (draft.type) {
    case 'event':
      return {
        ...base,
        event: {
          ...base.event,
          title: str('title'),
          description: str('description'),
          startsAt: typeof c['startsAt'] === 'number' ? (c['startsAt'] as number) : null,
        },
      }
    case 'correction':
      return {
        ...base,
        correction: {
          ...base.correction,
          newValue: str('newValue'),
          reason: str('reason'),
          beforeValue: str('beforeValue'),
        },
      }
    case 'notice':
      return { ...base, notice: { ...base.notice, title: str('title'), body: str('body') } }
    case 'collection':
      return {
        ...base,
        collection: {
          ...base.collection,
          name: str('name'),
          description: str('description'),
        },
      }
    default:
      return base
  }
}

function handleOf(attribution: Contribution['attribution'] | null): string | null {
  if (!attribution) return null
  if (attribution.kind === 'resident' || attribution.kind === 'resident_via_creation') {
    return attribution.handle
  }
  if (attribution.kind === 'organisation') return attribution.handle
  return null
}
