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
import { Skeleton } from '../ui/index.js'
import { Byline, Mark, SectionHead } from './News.js'
import { fetchStory, type NewsStory, type ReaderPayload } from './newsData.js'
import './news.css'

export interface ReaderProps {
  storyId: string
  onBack: () => void
  onOpenStory: (id: string) => void
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
      <button className="nw-icon-btn nw-icon-btn-lead" onClick={props.onBack} aria-label="Back to the news">
        <Icon name="chevron-left" size={20} />
      </button>
      <span className="nw-bar-crumb">{crumb}</span>
    </header>
  )

  if (state.kind === 'loading') {
    return (
      <div className="nw-screen" aria-busy="true" aria-label="Loading the story">
        {bar('News')}
        <div className="nw-reader">
          <Skeleton width="94%" height={22} />
          <Skeleton width="72%" height={22} />
          <Skeleton width="180px" height={12} />
          <Skeleton shape="block" height={152} className="nw-skel-art" />
        </div>
      </div>
    )
  }

  if (state.kind === 'gone' || state.kind === 'failed') {
    return (
      <div className="nw-screen">
        {bar('News')}
        <div className="nw-quiet">
          <span className="nw-quiet-art" aria-hidden="true">
            <Icon name="newspaper" size={30} />
          </span>
          <p className="nw-quiet-line">
            {state.kind === 'gone' ? 'That story is no longer in the feed.' : 'The story could not be reached.'}
          </p>
          <p className="nw-quiet-sub">
            {state.kind === 'gone'
              ? 'We keep what the town’s sources are currently publishing, not an archive. The paper that wrote it will still have it.'
              : 'Nothing was lost. Try again in a moment.'}
          </p>
        </div>
      </div>
    )
  }

  const { story, source, alsoCovering, topics } = state.data

  return (
    <div className="nw-screen">
      {bar(topics[0]?.label ?? 'News')}

      <article className="nw-reader">
        <span className="nw-kind">
          <Icon name={story.medium === 'opinion' ? 'quote' : 'newspaper'} size={13} />
          {story.medium === 'opinion' ? 'Opinion' : 'Reported'}
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
            <span className="nw-reader-when" title={new Date(story.publishedAt).toLocaleString()}>
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
              Photo: {source.name}. Shown at thumbnail size and linked back, not reproduced.
            </p>
          </>
        )}

        {story.summary && (
          <div className="nw-summary">
            <div className="nw-summary-head">
              <span className="nw-rule" aria-hidden="true" />
              <span className="nw-label">{source.name}’s summary</span>
            </div>
            <p className="nw-summary-lede">{story.summary}</p>
            <p className="nw-summary-fine">
              This is the paragraph {source.name} publishes in its own feed, not a summary we wrote.
              We do not reprint the article and we have nothing they do not.
            </p>
          </div>
        )}

        {/*
          The exit. Named for the publisher, saying the domain out loud so
          nobody taps blind, and the only terracotta on the page.
        */}
        {story.url && (
          <a className="nw-exit" href={story.url} target="_blank" rel="noopener noreferrer">
            <span className="nw-exit-text">
              <span className="nw-exit-title">Read the full story at {source.name}</span>
              <span className="nw-exit-sub">
                {source.domain ? `${source.domain} · ` : ''}opens outside Town Square
              </span>
            </span>
            <Icon name="arrow-out" size={18} />
          </a>
        )}

        <div className="nw-src" data-inline="true">
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
              {source.storyCount} {source.storyCount === 1 ? 'story' : 'stories'} in the feed
            </div>
          </div>
        </div>

        {/*
          On every story, not buried in settings, because the honest answer is
          short and it is the answer people assume they will not get.
        */}
        <details className="nw-disclose">
          <summary>
            <Icon name="info" size={14} />
            Why am I seeing this
            <Icon name="chevron-down" size={14} className="nw-disclose-caret" />
          </summary>
          <div className="nw-disclose-body">
            <p>
              It is in the feed because {source.name} published it and because it is one of the
              newest things any of the town’s sources has put out.
            </p>
            <p>
              That is the whole ranking. Newest first, with one exception written down in the code:
              the top slot prefers a story with a photograph over a daily records listing. There is
              no score on you, nothing is learned from what you tap, and no source pays to sit
              higher.
            </p>
          </div>
        </details>

        {alsoCovering.length > 0 && (
          <div className="nw-sec nw-sec-flush">
            <SectionHead label="Also covering this" />
            <div className="nw-list">
              {alsoCovering.map((other: NewsStory) => (
                <button
                  key={other.id}
                  className="nw-row"
                  data-density="compact"
                  onClick={() => props.onOpenStory(other.id)}
                >
                  <span className="nw-row-text">
                    <span className="nw-row-title">{other.title}</span>
                    <Byline story={other} small />
                  </span>
                  <Icon name="chevron-right" size={16} className="nw-out" />
                </button>
              ))}
            </div>
          </div>
        )}
      </article>
    </div>
  )
}

/** `this morning` reads as a fragment at the top of a byline block. */
function capitalise(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1)
}
