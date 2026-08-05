/**
 * News — the feed, `design/hifi-v2` section 03.
 *
 * One lead, then whoever is covering the same thing, then rows. The screen a
 * resident actually scrolls, and the one screen in Town Square where almost
 * every tap leaves the building.
 *
 * The design sheet has fourteen specimens and this has the ones with a source
 * behind them. What is missing and why is in DEVELOPING.md; the short version
 * is that nothing in the ingest marks a story as developing, no editor picks a
 * pull-quote, `SAVE_KINDS` has no `story` in it, and nothing anywhere records
 * that you read something. Each of those is a specimen not drawn rather than a
 * specimen drawn from nothing.
 */

import { useEffect, useState } from 'react'
import { AppBar } from '../AppBar.js'
import { Icon } from '../Icon.js'
import { Card, Skeleton } from '../ui/index.js'
import type { AccountView } from '../session.js'
import {
  fetchNews,
  isStale,
  type NewsCluster,
  type NewsPayload,
  type NewsStory,
} from './newsData.js'
import './news.css'

export interface NewsProps {
  account: AccountView | null
  canReview: boolean
  onBack: () => void
  onOpenStory: (id: string) => void
  onAccount: () => void
  onReview: () => void
}

export function News(props: NewsProps) {
  const [topic, setTopic] = useState<string | null>(null)
  const [payload, setPayload] = useState<NewsPayload | null>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let live = true
    setFailed(false)
    void fetchNews(topic).then(
      (next) => live && setPayload(next),
      () => live && setFailed(true),
    )
    return () => {
      live = false
    }
  }, [topic])

  /**
   * Staleness has to be able to arrive without a refetch.
   *
   * It is a fact about elapsed time rather than about the payload, so checking
   * it once while rendering means the resident who most needs the warning —
   * the one who left the tab open through an outage — is the only one who
   * never sees it. That inverts the entire point of the banner.
   *
   * A minute of granularity against a ten-minute threshold is invisible, and
   * it is also roughly what a browser throttles a background tab's timers to
   * anyway, so this costs nothing in the case it exists for. The interval
   * stops itself the moment the answer can no longer change: stale never
   * becomes fresh again without a new payload, and a new payload re-runs this.
   */
  const assembledAt = payload?.assembledAt
  const [stale, setStale] = useState(false)

  useEffect(() => {
    if (!assembledAt) return
    if (isStale(assembledAt)) {
      setStale(true)
      return
    }
    setStale(false)
    const id = setInterval(() => {
      if (!isStale(assembledAt)) return
      setStale(true)
      clearInterval(id)
    }, 60_000)
    return () => clearInterval(id)
  }, [assembledAt])

  const bar = (
    <AppBar
      label="News"
      place={payload?.town.name ?? 'Russellville'}
      account={props.account}
      canReview={props.canReview}
      onAccount={props.onAccount}
      onReview={props.onReview}
    />
  )

  if (failed && !payload) {
    return (
      <div className="nw-screen">
        {bar}
        <div className="nw-quiet">
          <span className="nw-quiet-art" aria-hidden="true">
            <Icon name="newspaper" size={30} />
          </span>
          <p className="nw-quiet-line">The news could not be reached.</p>
          <p className="nw-quiet-sub">
            Nothing was lost. The sources are still where they were, and this page will fill in as
            soon as one of them answers.
          </p>
          <button className="nw-retry" onClick={() => setTopic((t) => t)}>
            <Icon name="refresh" size={15} />
            Try again
          </button>
        </div>
      </div>
    )
  }

  if (!payload) return <NewsSkeleton bar={bar} />

  const empty = !payload.lead && payload.clusters.length === 0 && payload.rows.length === 0

  return (
    <div className="nw-screen">
      {bar}

      <button className="nw-back" onClick={props.onBack}>
        <Icon name="chevron-left" size={16} />
        Today
      </button>

      {/*
        The rail scrolls, it never wraps. Counts come from all of town rather
        than from the slice on screen, so a chip can tell you whether it is
        worth leaving the list you are on.
      */}
      {payload.topics.length > 0 && (
        <div className="nw-rail" role="group" aria-label="Topics">
          <button
            className="nw-chip"
            data-on={topic === null || undefined}
            aria-pressed={topic === null}
            onClick={() => setTopic(null)}
          >
            All
          </button>
          {payload.topics.map((t) => (
            <button
              key={t.id}
              className="nw-chip"
              data-on={topic === t.id || undefined}
              aria-pressed={topic === t.id}
              onClick={() => setTopic(topic === t.id ? null : t.id)}
            >
              {t.label}
              <span className="nw-chip-count">{t.count}</span>
            </button>
          ))}
        </div>
      )}

      {/*
        The API serves the last good build when a scrape fails. That is the
        right trade and it is also the only way a resident can be shown old
        news believing it is current, so the admission is at the top of the
        screen rather than in the footer.
      */}
      {stale && (
        <div className="nw-banner" role="status">
          <Icon name="clock" size={15} />
          <span className="nw-banner-text">
            <b>This is the news as of {payload.signoff.assembledLabel}.</b>
            Nothing has answered since then. We are still trying.
          </span>
        </div>
      )}

      {empty ? (
        /*
          A town with nothing to report is the normal case, not the error case,
          and the difference between those two framings is the tone of the whole
          product. No apology, no padding, no invented section.
        */
        <div className="nw-quiet">
          <span className="nw-quiet-art" aria-hidden="true">
            <Icon name="sun" size={30} />
          </span>
          <p className="nw-quiet-line">Quiet day in town.</p>
          <p className="nw-quiet-sub">
            {topic
              ? 'Nobody has filed anything under this topic lately. The rest of town is on All.'
              : 'None of the town’s sources has published anything we can see. That is most of August, and it is usually good news.'}
          </p>
        </div>
      ) : (
        <>
          {payload.lead && (
            <section className="nw-sec">
              <SectionHead label="Top of town" />
              <Lead story={payload.lead} onOpen={() => props.onOpenStory(payload.lead!.id)} />
            </section>
          )}

          {/*
            One heading over every cluster, not one per card. Repeating
            "Everyone is covering" down the screen makes two events read as two
            sections of the same thing, which is the duplication this card
            exists to undo.
          */}
          {payload.clusters.length > 0 && (
            <section className="nw-sec">
              <SectionHead label="Everyone is covering" />
              {payload.clusters.map((cluster) => (
                <Cluster key={cluster.id} cluster={cluster} onOpen={props.onOpenStory} />
              ))}
            </section>
          )}

          {payload.rows.length > 0 && (
            <section className="nw-sec">
              <SectionHead label="More from town" />
              <div className="nw-list">
                {payload.rows.map((story) => (
                  <Row key={story.id} story={story} onOpen={() => props.onOpenStory(story.id)} />
                ))}
              </div>
            </section>
          )}
        </>
      )}

      <footer className="nw-signoff">
        <div className="nw-signoff-line">
          {empty
            ? 'We will put something here the moment anyone publishes.'
            : `That is the town, as of ${payload.signoff.assembledLabel}.`}
        </div>
        {/*
          On an empty screen the counts come off entirely. "0 sources" is not a
          fact worth printing, and the design sheet's version of this line
          ("checked all 6 sources") is a number we do not have: the registry
          holds twenty entries and two of them publish stories, so counting the
          registry would say we checked eighteen things we did not.
        */}
        <div className="nw-signoff-meta">
          {empty ? (
            <>Checked at {payload.signoff.assembledLabel}</>
          ) : (
            <>
              {payload.signoff.sourceCount} {plural(payload.signoff.sourceCount, 'source')} ·{' '}
              {payload.signoff.storyCount} {plural(payload.signoff.storyCount, 'story', 'stories')}
              {payload.signoff.oldestLabel && <> · nothing older than {payload.signoff.oldestLabel}</>}
            </>
          )}
        </div>
      </footer>
    </div>
  )
}

/* ── pieces ─────────────────────────────────────────────────────────────── */

export function SectionHead({ label }: { label: string }) {
  return (
    <div className="nw-head">
      <span className="nw-rule" aria-hidden="true" />
      <span className="nw-label">{label}</span>
    </div>
  )
}

/**
 * The source's tile of initials.
 *
 * `aria-hidden` on purpose, and this is the reason: the tile is a recognition
 * aid at a glance, and the name beside it is what identifies. A screen reader
 * announcing "TC The Courier" is reading the same thing twice.
 */
export function Mark({ story, large }: { story: { sourceInitial: string; sourceTint: string }; large?: boolean }) {
  return (
    <span className="nw-mark" data-tint={story.sourceTint} data-size={large ? 'lg' : undefined} aria-hidden="true">
      {story.sourceInitial}
    </span>
  )
}

/**
 * The source and when it ran.
 *
 * No outbound arrow, and that is a deliberate difference from the design
 * sheet. On the sheet every headline goes straight to the publisher, so the
 * arrow on the byline is the honest warning. Here a tap opens our own reader
 * page, which is where the leaving happens and where the arrow lives. An arrow
 * on a control that stays inside the app is a promise we would be breaking
 * twice a screen.
 *
 * Serif throughout, per the type contract: a byline is saying something, not
 * labelling the page, and an attribution in mono reads as terminal output.
 */
export function Byline({ story, small }: { story: NewsStory; small?: boolean }) {
  return (
    <span className={small ? 'nw-byline nw-byline-sm' : 'nw-byline'}>
      <Mark story={story} />
      <span className="nw-source">{story.sourceName}</span>
      <span className="nw-dot" aria-hidden="true" />
      {/*
        The full timestamp lives on `title` for anyone who needs the real
        number. The visible label is the one a neighbour would say out loud.
      */}
      <span
        className={story.fresh ? 'nw-meta nw-fresh' : 'nw-meta'}
        title={new Date(story.publishedAt).toLocaleString()}
      >
        {story.timeLabel}
      </span>
    </span>
  )
}

/**
 * A photograph the source published, or nothing at all.
 *
 * Never a grey rectangle waiting for one. Roughly half the town's stories
 * carry art and none of the university's do, so a layout that reserves a box
 * and fills it with grey is a layout that looks broken four days a week. If
 * the image fails to load the element removes itself and the surrounding
 * layout is the no-art one, which it was already designed to be.
 */
function Art({ src, className }: { src: string; className: string }) {
  return (
    <span className={className}>
      <img
        src={src}
        alt=""
        loading="lazy"
        onError={(e) => {
          e.currentTarget.parentElement?.style.setProperty('display', 'none')
        }}
      />
    </span>
  )
}

function Kind({ medium }: { medium: NewsStory['medium'] }) {
  return (
    <span className="nw-kind">
      <Icon name={medium === 'opinion' ? 'quote' : 'newspaper'} size={13} />
      {medium === 'opinion' ? 'Opinion' : 'News'}
    </span>
  )
}

/**
 * Two heroes, not one with a hole in it.
 *
 * With art it is a photograph and the headline under it. Without, the body
 * becomes a panel with a rule in the brand colour and the summary does the
 * work the photograph would have done. A headline in a large font on a bare
 * page reads as a screen that could not fill itself, which is the opposite of
 * what the top of the town's news should say.
 */
function Lead({ story, onOpen }: { story: NewsStory; onOpen: () => void }) {
  return (
    <article className="nw-lead" data-art={story.imageUrl ? 'photo' : 'none'}>
      {story.imageUrl && (
        <button className="nw-lead-art-btn" onClick={onOpen} aria-label={story.title}>
          <Art src={story.imageUrl} className="nw-lead-art" />
          <span className="nw-kind" data-over="true">
            <Icon name={story.medium === 'opinion' ? 'quote' : 'newspaper'} size={13} />
            {story.medium === 'opinion' ? 'Opinion' : 'News'}
          </span>
        </button>
      )}
      <div className="nw-lead-body">
        {!story.imageUrl && <Kind medium={story.medium} />}
        <h3 className="nw-lead-title">
          <button onClick={onOpen}>{story.title}</button>
        </h3>
        {!story.imageUrl && story.summary && <p className="nw-lead-summary">{story.summary}</p>}
        <Byline story={story} />
      </div>
    </article>
  )
}

/**
 * A row, where the thumbnail is an enhancement and never the layout.
 *
 * Pull the picture and the row reads the same, just narrower. No placeholder
 * square, no reserved gap. Ordering upstream is by recency and not by which
 * stories have art, for the same reason.
 */
function Row({ story, onOpen }: { story: NewsStory; onOpen: () => void }) {
  return (
    <button className="nw-row" onClick={onOpen}>
      <span className="nw-row-text">
        <span className="nw-row-title">{story.title}</span>
        <Byline story={story} small />
      </span>
      {story.imageUrl && <Art src={story.imageUrl} className="nw-photo nw-row-thumb" />}
    </button>
  )
}

/**
 * One event, more than one newsroom.
 *
 * This is the pattern local aggregation gets wrong most often, and the failure
 * is always the same: two rows, two headlines, one event, and a reader who
 * concludes the feed repeats itself. Collapsing to one row and picking a winner
 * is worse — it quietly ranks one newsroom above another, which is a judgement
 * an aggregator has no standing to make. So every source is kept, at the same
 * size, ordered by time and nothing else.
 *
 * The sheet puts a sentence at the top of this card describing the event,
 * labelled as ours. It is the best idea in the section and it is not here:
 * writing it means synthesising a third headline from two real ones, and a
 * made-up sentence sitting above two newsrooms' own words is precisely what
 * the sheet's note says would cost us the sources.
 */
function Cluster({ cluster, onOpen }: { cluster: NewsCluster; onOpen: (id: string) => void }) {
  return (
    /*
      `Card` supplies the surface, border, radius and raised shadow; the only
      thing `.nw-cluster` adds is `padding: 0`, because this card's body is a
      full-bleed list with its own dividers rather than padded copy. `Card` has
      no unpadded variant, which is the one gap worth naming: a card whose
      content is a `RowList` is a shape more than one section wants.
    */
    <Card elevation="raised" className="nw-cluster">
      <div className="nw-cluster-head">
        <span className="nw-cluster-eyebrow">
          <Icon name="layers" size={13} />
          {cluster.sourceCount} sources covering
        </span>
      </div>
      <ul className="nw-cluster-list">
        {cluster.stories.map((story) => (
          <li key={story.id}>
            <button className="nw-cluster-row" onClick={() => onOpen(story.id)}>
              <Mark story={story} />
              <span className="nw-cluster-text">
                <span className="nw-cluster-source">{story.sourceName}</span>
                <span className="nw-cluster-headline">{story.title}</span>
                {/*
                  Medium is the one editorial call available here without
                  standing on a newsroom's toes, and it lets a reader pick what
                  they want in about a second.
                */}
                <span className="nw-cluster-meta">
                  {story.medium === 'opinion' ? 'Opinion' : 'Reported'} · {story.timeLabel}
                </span>
              </span>
              <Icon name="chevron-right" size={16} className="nw-out" />
            </button>
          </li>
        ))}
      </ul>
    </Card>
  )
}

/**
 * The first load, drawn from the same rules as the feed.
 *
 * The lead art is 200px because the lead art is 200px, the third row has no
 * thumbnail because roughly half of stories have none, and the section labels
 * are real text immediately, because we always know what the sections are
 * before we know what is in them. A skeleton that does not match its own
 * screen produces a jolt on every load, and the jolt is what teaches people
 * the app is slow.
 */
function NewsSkeleton({ bar }: { bar: React.ReactNode }) {
  return (
    <div className="nw-screen" aria-busy="true" aria-label="Loading the news">
      {bar}
      <div className="nw-rail">
        {[58, 96, 84, 110].map((w, i) => (
          <Skeleton key={i} shape="block" width={`${w}px`} height={32} className="nw-skel-chip" />
        ))}
      </div>
      <div className="nw-sec">
        <SectionHead label="Top of town" />
        <Skeleton shape="block" height={200} className="nw-skel-art" />
        <Skeleton width="96%" height={13} />
        <Skeleton width="64%" height={13} />
        <Skeleton width="138px" height={10} />
      </div>
      <div className="nw-sec">
        <SectionHead label="More from town" />
        <div className="nw-list">
          {[true, false, true, false].map((withThumb, i) => (
            <div className="nw-skel-row" key={i}>
              <span className="nw-skel-col">
                <Skeleton width={i % 2 === 0 ? '100%' : '92%'} height={13} />
                <Skeleton width={i % 2 === 0 ? '58%' : '44%'} height={13} />
                <Skeleton width="138px" height={10} />
              </span>
              {withThumb && <Skeleton shape="block" height={68} className="nw-skel-thumb" />}
            </div>
          ))}
        </div>
      </div>
      {/* The only words on this screen, because the wait has a nameable cause. */}
      <p className="nw-skel-note">Reading the town’s sources</p>
    </div>
  )
}

function plural(n: number, word: string, many?: string): string {
  return n === 1 ? word : (many ?? `${word}s`)
}
