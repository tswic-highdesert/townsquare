/**
 * The gallery. `design/hifi-v2/sections/06-creations`, specimens 1, 2, 10 and 12.
 *
 * A gallery of resident-built apps has one job an app store does not have: it
 * has to make the person scrolling it think *I could build one of these*. So it
 * is not arranged by popularity, it does not lead with a grid of icons, and
 * there is no install button, no star rating and no ranked chart. Nothing here
 * is bought, so nothing here is merchandised.
 *
 * Two things the design shows are deliberately not on this screen, because
 * nothing in Town Square counts them yet and a plausible number is the one
 * failure a town information service cannot come back from:
 *
 *   - **"Used by 214 neighbors this month."** There is no usage telemetry
 *     anywhere in this system. It is also the single most attractive number on
 *     the design, which is exactly why it is the one to refuse.
 *   - **The featured slot, and "new this week".** Both are rankings, and the
 *     catalogue carries neither a usage count nor a published date to rank on.
 *     A "featured" card picked off array order is a leaderboard with no
 *     scoreboard behind it.
 *
 * What survives is the part that was doing the work anyway: every entry carries
 * what it does, who made it, and what it can touch, and the touch strip is on
 * the card rather than one tap past the decision.
 */

import { useMemo, useState } from 'react'
import { Icon } from '../Icon.js'
import { EmptyState, Skeleton } from '../ui/index.js'
import { AppIcon, MadeBy, TouchStrip } from './parts.js'
import type { CreationSummary } from '../townData.js'
import './creations.css'

export interface GalleryProps {
  /** Null while the catalogue is still in flight. */
  creations: CreationSummary[] | null
  townName: string
  onOpen: (creation: CreationSummary) => void
  onBack: () => void
  /** The build layer's front door. Reached by asking, never sprung. */
  onHowItWorks: () => void
}

/**
 * Below this, a grid reads as a failed store.
 *
 * Three cards in a two-column layout is a shop with empty shelves. The same
 * three rows of data, numbered, each with the builder's own sentence about what
 * it is, reads as the beginning of something. At n=40 this treatment would be a
 * list nobody could scan, which is why it is a threshold and not a preference.
 */
const GRID_FROM = 4

export function Gallery(props: GalleryProps) {
  const { creations } = props
  const [tag, setTag] = useState<string | null>(null)

  const tags = useMemo(() => tagCounts(creations ?? []), [creations])
  const shown = useMemo(
    () => (tag ? (creations ?? []).filter((c) => c.manifest.tags.includes(tag)) : (creations ?? [])),
    [creations, tag],
  )

  return (
    <div className="shell cr-screen">
      <button className="cr-back" onClick={props.onBack}>
        <Icon name="arrow-left" size={16} /> Today
      </button>

      <div className="cr-eyebrow">{props.townName} · the build layer</div>
      <h1 className="cr-h1">Built by neighbors</h1>
      <p className="cr-lede">
        Everything here was made by someone who lives in town. Each one runs sandboxed on Town
        Square and can only reach what it says it can.
      </p>

      {creations === null ? (
        <div className="cr-loading" aria-busy="true" aria-label="Loading the gallery">
          <Skeleton width="60%" />
          <Skeleton shape="block" height={96} />
          <Skeleton shape="block" height={96} />
        </div>
      ) : creations.length === 0 ? (
        <EmptyState
          mark="sprout"
          tone="young"
          line="Nobody has built anything yet."
          sub="The build layer is open. The first thing in this gallery will be something a neighbour wanted to exist."
          action={{ label: 'How it works', onAct: props.onHowItWorks }}
        />
      ) : (
        <>
          {/*
            Tags come off the manifest, so this is a shelf a builder chose to
            stand on rather than a taxonomy we imposed. It only appears once
            there is enough on the screen for filtering to be a kindness.
          */}
          {creations.length >= GRID_FROM && tags.length >= 2 && (
            <div className="cr-cats" role="group" aria-label="Filter by tag">
              <button
                className="cr-cat"
                data-state={tag === null ? 'on' : undefined}
                aria-pressed={tag === null}
                onClick={() => setTag(null)}
              >
                <Icon name="grid" size={14} /> Everything <span>{creations.length}</span>
              </button>
              {tags.map(([name, n]) => (
                <button
                  key={name}
                  className="cr-cat"
                  data-state={tag === name ? 'on' : undefined}
                  aria-pressed={tag === name}
                  onClick={() => setTag(tag === name ? null : name)}
                >
                  {name} <span>{n}</span>
                </button>
              ))}
            </div>
          )}

          {shown.length === 0 ? (
            <EmptyState
              align="start"
              line={`Nothing is tagged ${tag}.`}
              sub="That shelf is empty for now."
              action={{ label: 'Show everything', onAct: () => setTag(null) }}
            />
          ) : creations.length < GRID_FROM ? (
            <Firsts creations={shown} onOpen={props.onOpen} />
          ) : (
            <div className="cr-cardgrid">
              {shown.map((creation) => (
                <Card key={creation.slug} creation={creation} onOpen={props.onOpen} />
              ))}
            </div>
          )}

          <Invitation onHowItWorks={props.onHowItWorks} />
        </>
      )}

      <p className="cr-footnote">
        Nobody is paid for anything on this page. Every creation declares what it can reach before
        you open it, and a neighbour on the review committee read it first.
      </p>
    </div>
  )
}

/**
 * One card, and the whole card is the control.
 *
 * A card with an Open button beside a tappable body gives a resident two
 * targets for one intention and a screen reader two announcements of the same
 * creation. One button, whose accessible name is everything printed on it.
 */
function Card({
  creation,
  onOpen,
}: {
  creation: CreationSummary
  onOpen: (creation: CreationSummary) => void
}) {
  return (
    <button className="cr-card" onClick={() => onOpen(creation)}>
      <AppIcon creation={creation} />
      <span className="cr-card-name">{creation.name}</span>
      <span className="cr-card-tagline">{creation.tagline}</span>
      <MadeBy className="cr-card-by" />
      <TouchStrip creation={creation} />
    </button>
  )
}

/** The launch-week arrangement: numbered, with the builder's own sentence. */
function Firsts({
  creations,
  onOpen,
}: {
  creations: CreationSummary[]
  onOpen: (creation: CreationSummary) => void
}) {
  return (
    <ol className="cr-firsts">
      {creations.map((creation, i) => (
        <li key={creation.slug}>
          <span className="cr-firsts-n" aria-hidden="true">
            {String(i + 1).padStart(2, '0')}
          </span>
          <button className="cr-firsts-body" onClick={() => onOpen(creation)}>
            <span className="cr-card-name">{creation.name}</span>
            <span className="cr-firsts-why">{firstSentence(creation.description)}</span>
            <MadeBy className="cr-card-by" />
            <TouchStrip creation={creation} />
          </button>
        </li>
      ))}
    </ol>
  )
}

/**
 * The invitation, at gallery-card intensity.
 *
 * A quiet permanent fixture rather than a banner that appears once: present
 * enough to be noticed on the fourth visit, quiet enough to never be in the way
 * on the first. The dashed edge is doing a job — it is the one card here that
 * is not a creation, and it should read as an empty slot waiting for somebody
 * rather than as an advertisement.
 */
function Invitation({ onHowItWorks }: { onHowItWorks: () => void }) {
  return (
    <>
      <article className="cr-invite-card">
        <span className="cr-invite-icon" aria-hidden="true">
          <Icon name="wand" size={22} />
        </span>
        <div className="cr-invite-name">Build one</div>
        <p className="cr-invite-copy">
          Describe what you want to the AI tool you already use, connect it to Town Square, and a
          neighbour on the review committee reads it before it goes up.
        </p>
        <button className="cr-secondary" onClick={onHowItWorks}>
          How it works <Icon name="arrow-right" size={16} />
        </button>
      </article>

      <p className="cr-invite-line">
        Every one of these was made by somebody who lives here.
        <button className="cr-invite-link" onClick={onHowItWorks}>
          You could make one <Icon name="arrow-right" size={15} />
        </button>
      </p>
    </>
  )
}

/** Tags across the whole gallery, commonest first, then alphabetically. */
function tagCounts(creations: CreationSummary[]): Array<[string, number]> {
  const counts = new Map<string, number>()
  for (const creation of creations) {
    for (const tag of creation.manifest.tags) counts.set(tag, (counts.get(tag) ?? 0) + 1)
  }
  return [...counts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
}

/**
 * The first sentence of a builder's own description.
 *
 * Not a summary we wrote. A description runs to 2000 characters and the first
 * sentence is almost always the one that says what the thing is; taking more
 * would turn a numbered list into three paragraphs.
 */
export function firstSentence(text: string): string {
  const match = /^.*?[.!?](\s|$)/s.exec(text.trim())
  return (match ? match[0] : text.trim()).trim()
}
