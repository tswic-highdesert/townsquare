/**
 * A story we do not host, `design/hifi-v2` section 03, specimen 6.
 *
 * This page has to be useful to a reader and respectful of a publisher in the
 * same breath, and those pull in opposite directions: everything that makes it
 * a better read makes it a better substitute for the article. The resolution is
 * that we have nothing to substitute *with*. The only text we hold is the
 * summary the source itself put in its feed, so the panel below is labelled
 * with the paper's name rather than ours, and the one prominent control on the
 * screen is the one that leaves.
 *
 * The sheet's version of this panel is headed "Town Square summary" — three
 * sentences and three points written by us from the source's reporting. Every
 * story in this town's ingest has `body === description`, which is to say we
 * hold one paragraph the publisher wrote and no article at all. Putting our
 * name over the paper's own sentence would be taking credit for it.
 */

import { useEffect, useState } from 'react'
import { Icon } from '../Icon.js'
import { Card, RowItem, RowList, Skeleton } from '../ui/index.js'
import { saveThing, unsaveThing, type SavedThing } from '../savesData.js'
import type { AccountView } from '../session.js'
import { intlLocale, t, tn } from '../i18n/index.js'
import { Byline, Mark, SectionHead } from './News.js'
import { fetchStory, type NewsStory, type ReaderPayload } from './newsData.js'
import './news.css'

export interface ReaderProps {
  storyId: string
  onBack: () => void
  onOpenStory: (id: string) => void
  /** Null when nobody is signed in. The save control says so rather than failing. */
  account?: AccountView | null
  /** Saving needs an account, so the control offers the way to get one. */
  onSignIn?: () => void
  /**
   * The resident's saves, held by `App` so this screen and Yours cannot
   * disagree about what is saved. Optional: without it the button still works
   * and simply does not know about saves made before this screen opened.
   */
  saved?: SavedThing[]
  onSavedChange?: (next: SavedThing[]) => void
}

type State = { kind: 'loading' } | { kind: 'gone' } | { kind: 'failed' } | { kind: 'ready'; data: ReaderPayload }

export function Reader(props: ReaderProps) {
  const [state, setState] = useState<State>({ kind: 'loading' })

  useEffect(() => {
    let live = true
    setState({ kind: 'loading' })
    void fetchStory(props.storyId).then(
      (data) => live && setState(data ? { kind: 'ready', data } : { kind: 'gone' }),
      () => live && setState({ kind: 'failed' }),
    )
    return () => {
      live = false
    }
  }, [props.storyId])

  const bar = (crumb: string) => (
    <header className="nw-bar" data-mode="reader">
      <button className="nw-icon-btn nw-icon-btn-lead" onClick={props.onBack} aria-label={t('Back to the news')}>
        <Icon name="chevron-left" size={20} />
      </button>
      <span className="nw-bar-crumb">{crumb}</span>
    </header>
  )

  if (state.kind === 'loading') {
    return (
      <div className="nw-screen" aria-busy="true">
        {bar(t('News'))}
        <main id="ts-main" tabIndex={-1}>
          <p className="ts-sr-only" role="status">{t('Loading the story')}</p>
          <div className="nw-reader">
            <Skeleton width="94%" height={22} />
            <Skeleton width="72%" height={22} />
            <Skeleton width="180px" height={12} />
            <Skeleton shape="block" height={152} className="nw-skel-art" />
          </div>
        </main>
      </div>
    )
  }

  if (state.kind === 'gone' || state.kind === 'failed') {
    return (
      <div className="nw-screen">
        {bar(t('News'))}
        <main id="ts-main" tabIndex={-1}>
          <div className="nw-quiet">
            <span className="nw-quiet-art" aria-hidden="true">
              <Icon name="newspaper" size={30} />
            </span>
            <h1 className="nw-quiet-line">
              {state.kind === 'gone' ? t('That story is no longer in the feed.') : t('The story could not be reached.')}
            </h1>
            <p className="nw-quiet-sub">
              {state.kind === 'gone'
                ? t('We keep what the town’s sources are currently publishing, not an archive. The paper that wrote it will still have it.')
                : t('Nothing was lost. Try again in a moment.')}
            </p>
          </div>
        </main>
      </div>
    )
  }

  const { story, source, alsoCovering, topics } = state.data

  return (
    <div className="nw-screen">
      {bar(topics[0]?.label ?? t('News'))}
      <main id="ts-main" tabIndex={-1}>

        <article className="nw-reader">
          <span className="nw-kind">
            <Icon name={story.medium === 'opinion' ? 'quote' : 'newspaper'} size={13} />
            {story.medium === 'opinion' ? t('Opinion') : t('Reported')}
          </span>

          <h1 className="nw-reader-title">{story.title}</h1>

          <div className="nw-reader-byline">
            <Mark story={story} large />
            <span className="nw-reader-byline-text">
              {/*
                The reporter's name when the paper filed one, the paper's name
                alone when it did not. Never "Staff" invented to fill the line:
                about a fifth of this town's stories carry no byline at all, and
                a made-up one is an attribution to a person who does not exist.
              */}
              <span className="nw-reader-who">
                {story.byline ? `${story.byline}, ${story.sourceName}` : story.sourceName}
              </span>
              <span className="nw-reader-when" title={new Date(story.publishedAt).toLocaleString(intlLocale())}>
                {capitalise(story.timeLabel)}
              </span>
            </span>
          </div>

          {/*
            Thumbnail scale, credited, linked back. Running someone else's press
            photograph edge to edge is the point at which a summary page starts
            behaving like a copy of the article, and the credit under it is not
            decoration.
          */}
          {story.imageUrl && (
            <>
              <span className="nw-reader-art">
                <img
                  src={story.imageUrl}
                  alt=""
                  loading="lazy"
                  onError={(e) => {
                    const art = e.currentTarget.parentElement
                    art?.style.setProperty('display', 'none')
                    art?.nextElementSibling?.setAttribute('hidden', '')
                  }}
                />
              </span>
              <p className="nw-reader-credit">
                {t('Photo: {source}. Story preview; read the full article at the source.', { source: source.name })}
              </p>
            </>
          )}

          {story.summary && (
            <div className="nw-summary">
              <div className="nw-summary-head">
                <span className="nw-rule" aria-hidden="true" />
                <span className="nw-label">{t('{source}’s summary', { source: source.name })}</span>
              </div>
              <p className="nw-summary-lede">{story.summary}</p>
              <p className="nw-summary-fine">
                {t('This preview comes from {source}’s feed. The complete article is available from the publisher.', { source: source.name })}
              </p>
            </div>
          )}

          <SaveButton
            story={story}
            sourceName={source.name}
            account={props.account ?? null}
            onSignIn={props.onSignIn}
            saved={props.saved}
            onSavedChange={props.onSavedChange}
          />

          {/*
            The exit. Named for the publisher, saying the domain out loud so
            nobody taps blind, and the only terracotta on the page.
          */}
          {story.url && (
            <a className="nw-exit" href={story.url} target="_blank" rel="noopener noreferrer">
              <span className="nw-exit-text">
                <span className="nw-exit-title">{t('Read the full story at {source}', { source: source.name })}</span>
                <span className="nw-exit-sub">
                  {source.domain ? `${source.domain} · ` : ''}{t('opens outside Town Square')}
                </span>
              </span>
              <Icon name="arrow-out" size={18} />
            </a>
          )}

          {/*
            `Card` from the primitives, unmodified. A padded surface holding a
            mark and three lines is exactly what it is for, and the alternative
            was a `.nw-src` that reimplemented its border, radius, padding and
            shadow to land in the same place.
          */}
          <Card className="nw-src">
            <Mark story={story} large />
            <div className="nw-src-text">
              <div className="nw-src-name">{source.name}</div>
              {source.domain && <div className="nw-src-what">{source.domain}</div>}
              {/*
                What we can count, and only that. The sheet's cards carry a line
                of description for each source ("Russellville's daily since
                1892") and there is no field anywhere that holds one.
              */}
              <div className="nw-src-meta">
                {tn(source.storyCount, '{count} story in the feed', '{count} stories in the feed')}
              </div>
            </div>
          </Card>

          {/*
            On every story, not buried in settings, because the honest answer is
            short and it is the answer people assume they will not get.
          */}
          <details className="nw-disclose">
            <summary>
              <Icon name="info" size={14} />
              {t('Why am I seeing this')}
              <Icon name="chevron-down" size={14} className="nw-disclose-caret" />
            </summary>
            <div className="nw-disclose-body">
              <p>
                {t('It is in the feed because {source} published it and because it is one of the newest things any of the town’s sources has put out.', { source: source.name })}
              </p>
              <p>
                {t('That is the whole ranking. Newest first, with one exception written down in the code: the top slot prefers a story with a photograph over a daily records listing. There is no score on you, nothing is learned from what you tap, and no source pays to sit higher.')}
              </p>
            </div>
          </details>

          {alsoCovering.length > 0 && (
            <div className="nw-sec nw-sec-flush">
              <SectionHead label={t('Also covering this')} />
              {/*
                `RowList` from the primitives, at the compact density, which is a
                token override rather than a second component. This list is the
                one place in the section where the shape matches exactly: no
                thumbnail, a chevron because the row goes somewhere, and a title
                over a byline. The feed's rows do not — see the note on `Row` in
                `News.tsx`.

                Unframed, because it sits inline under a section rule rather than
                standing on its own as a card.
              */}
              <RowList density="compact" framed={false} className="nw-rows" label={t('Also covering this')}>
                {alsoCovering.map((other) => (
                  <RowItem
                    key={other.id}
                    title={other.title}
                    meta={<Byline story={other} small />}
                    onClick={() => props.onOpenStory(other.id)}
                  />
                ))}
              </RowList>
            </div>
          )}
        </article>
      </main>
    </div>
  )
}

/**
 * Save, in every state it has.
 *
 * One control, one position, four states. The interesting one is the failure,
 * because saving is optimistic and a phone losing signal halfway down a story
 * is normal rather than exceptional — so the failed state keeps the story, says
 * what happened in words a person can act on, and is itself the retry.
 *
 * It is terracotta, never `--ts-alarm`: a save that has not landed yet is not
 * an emergency, and spending the brick register here spends the one colour
 * still supposed to mean something at 6am when the river is up.
 *
 * The sheet describes the failure as keeping the story "in a local queue".
 * This keeps it for as long as the screen is open and no longer. A queue that
 * survives a reload needs somewhere to live, and the honest options are a
 * storage key with its own eviction rules or a promise we do not keep — so the
 * button says "tap to try again" and tapping genuinely tries again.
 */
function SaveButton({
  story,
  sourceName,
  account,
  onSignIn,
  saved,
  onSavedChange,
}: {
  story: NewsStory
  sourceName: string
  account: AccountView | null
  onSignIn?: (() => void) | undefined
  saved?: SavedThing[] | undefined
  onSavedChange?: ((next: SavedThing[]) => void) | undefined
}) {
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState(false)
  /**
   * What this screen saved, for the case where nobody handed us the list.
   *
   * When `saved` is passed it is the truth and this is ignored, so the two
   * screens cannot disagree. Without it the button is still correct about
   * anything done here, which is the part a person is watching.
   */
  const [local, setLocal] = useState<SavedThing | null>(null)

  const row = saved
    ? (saved.find((s) => s.kind === 'story' && s.refId === story.id) ?? null)
    : local

  // Reading the town never needs an account. This part does, and saying so
  // before the tap beats a 401 the button would have to explain afterwards.
  if (!account) {
    if (!onSignIn) return null
    return (
      <button className="nw-save" onClick={onSignIn}>
        <Icon name="bookmark" size={15} />
        {t('Sign in to save this')}
      </button>
    )
  }

  async function toggle() {
    setBusy(true)
    setFailed(false)
    try {
      await attempt()
    } finally {
      // Whatever happened, the button stops saying it is working. A control
      // stuck on "Saving" is the one state a person cannot get out of.
      setBusy(false)
    }
  }

  async function attempt() {
    if (row) {
      const ok = await unsaveThing('story', story.id)
      if (ok) {
        setLocal(null)
        onSavedChange?.((saved ?? []).filter((s) => s.id !== row.id))
      } else setFailed(true)
    } else {
      const next = await saveThing({
        kind: 'story',
        refId: story.id,
        title: story.title,
        /*
          The source, not the summary. A third of this town's stories carry an
          RSS summary over the 200-character `detail` limit, and the service
          refuses rather than truncates — so sending the summary would fail the
          button on a third of the feed. The saved list shows the source name
          anyway, which is also what a person searches their own bookmarks by.
        */
        detail: sourceName,
        ...(story.url ? { url: story.url } : {}),
      })
      if (next) {
        setLocal(next)
        onSavedChange?.([next, ...(saved ?? [])])
      } else setFailed(true)
    }
  }

  if (failed) {
    return (
      <button className="nw-save" data-state="failed" onClick={() => void toggle()}>
        <Icon name="alert-circle" size={15} />
        <span className="nw-save-fail">{t('Not saved yet. Tap to try again.')}</span>
      </button>
    )
  }

  return (
    <button
      className="nw-save"
      data-state={busy ? 'busy' : row ? 'saved' : undefined}
      aria-pressed={row ? true : false}
      disabled={busy}
      onClick={() => void toggle()}
    >
      <Icon name={busy ? 'loader' : row ? 'bookmark-filled' : 'bookmark'} size={15} className={busy ? 'nw-spin' : undefined} />
      {busy ? (row ? t('Removing') : t('Saving')) : row ? t('Saved') : t('Save this story')}
    </button>
  )
}

/** `this morning` reads as a fragment at the top of a byline block. */
function capitalise(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1)
}
