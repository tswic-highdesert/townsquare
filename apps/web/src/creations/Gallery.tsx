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
 *     scoreboard behind it. That slot is also where the design's one dark card
 *     lives, so this screen has none; the build layer's dark surface is the
 *     builder door instead.
 *
 * What survives is the part that was doing the work anyway: every entry carries
 * what it does, who made it, and what it can touch, and the touch strip is on
 * the card rather than one tap past the decision.
 */

import { useMemo, useState } from 'react'
import { Icon } from '../Icon.js'
import { Button, Card, CardBody, CardMeta, CardTitle, EmptyState, Skeleton } from '../ui/index.js'
import { AppIcon, MADE_BY, TouchStrip } from './parts.js'
import { t } from '../i18n/index.js'
import type { CreationSummary } from '../townData.js'
import './creations.css'

export interface GalleryProps {
  /** Null while the catalogue is still in flight. */
  creations: CreationSummary[] | null
  townName: string
  onOpen: (creation: CreationSummary) => void
  /**
   * Optional, because this screen is a destination and not a sub-page.
   *
   * The gallery is reached from the nav, where the bar underneath already
   * highlights Creations and every other destination is one tap away. A "back
   * to Today" above that nav is one affordance too many: it offers a way out
   * of a place you did not travel into. It is still passed wherever the
   * gallery is genuinely arrived at from somewhere, and the control is drawn
   * only then.
   */
  onBack?: () => void
  /** The build layer's front door. Reached by asking, never sprung. */
  onHowItWorks: () => void
  onOpenPlan?: () => void
  onOpenMap?: () => void
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
    <main className="shell cr-screen" id="ts-main" tabIndex={-1}>
      {props.onBack && (
        <button className="cr-back" onClick={props.onBack}>
          <Icon name="arrow-left" size={16} /> {t('Today')}
        </button>
      )}

      <div className="cr-eyebrow">{t('{town} · made to be useful', { town: props.townName })}</div>
      <h1 className="cr-h1">{t('Small ideas. More connected.')}</h1>
      <p className="cr-lede">
        {t(
          'Useful tools for a day in the River Valley, and a starting point for something you could make. Starter examples are labeled. Community creations will appear here as they are reviewed.',
        )}
      </p>

      {(props.onOpenPlan || props.onOpenMap) && <section className="cr-local-tools" aria-label={t('Town Square tools')}>
        {props.onOpenPlan && <button className="cr-local-tool" onClick={props.onOpenPlan}><span className="cr-tool-art cr-tool-art-day"><Icon name="sun" size={52}/><span className="cr-tool-route" aria-hidden="true"><i/><i/><i/></span></span><span className="cr-tool-body"><small>{t('Town Square tool')}</small><strong>{t('Make a day of it')}</strong><span>{t('A coffee, a local event, somewhere to eat. Bring your favorite stops together.')}</span><b>{t('Plan your day')} <Icon name="arrow-right" size={18}/></b></span></button>}
        {props.onOpenMap && <button className="cr-local-tool" onClick={props.onOpenMap}><span className="cr-tool-art cr-tool-art-map"><Icon name="map" size={70}/><Icon name="map-pin" size={34}/></span><span className="cr-tool-body"><small>{t('Town Square tool')}</small><strong>{t('Around the corner')}</strong><span>{t('Explore places across town and find their address, phone and published details.')}</span><b>{t('Explore the map')} <Icon name="arrow-right" size={18}/></b></span></button>}
      </section>}
      <div className="cr-gallery-section"><h2>{t('Creation starters')}</h2><p>{t('Examples of what can be built here. These are not resident endorsements or community activity.')}</p></div>

      {creations === null ? (
        <div className="cr-loading" role="status" aria-busy="true" aria-label={t('Loading the gallery')}>
          <Skeleton width="60%" />
          <Skeleton shape="block" height={96} />
          <Skeleton shape="block" height={96} />
        </div>
      ) : creations.length === 0 ? (
        <EmptyState
          mark="sprout"
          tone="young"
          line={t('No creations published yet.')}
          sub={t('A useful local idea can start small. See how a creation connects to Town Square.')}
          action={{ label: t('How it works'), onAct: props.onHowItWorks }}
        />
      ) : (
        <>
          {/*
            Tags come off the manifest, so this is a shelf a builder chose to
            stand on rather than a taxonomy we imposed. It only appears once
            there is enough on the screen for filtering to be a kindness.
          */}
          {creations.length >= GRID_FROM && tags.length >= 2 && (
            <div className="cr-cats" role="group" aria-label={t('Filter by tag')}>
              <button
                className="cr-cat"
                data-state={tag === null ? 'on' : undefined}
                aria-pressed={tag === null}
                onClick={() => setTag(null)}
              >
                <Icon name="grid" size={14} /> {t('Everything')} <span>{creations.length}</span>
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
              line={t('Nothing is tagged {tag}.', { tag: String(tag) })}
              sub={t('That shelf is empty for now.')}
              action={{ label: t('Show everything'), onAct: () => setTag(null) }}
            />
          ) : creations.length < GRID_FROM ? (
            <Firsts creations={shown} onOpen={props.onOpen} />
          ) : (
            <div className="cr-cardgrid">
              {shown.map((creation) => (
                <CreationCard key={creation.slug} creation={creation} onOpen={props.onOpen} />
              ))}
            </div>
          )}

          <Invitation onHowItWorks={props.onHowItWorks} />
        </>
      )}

      <p className="cr-footnote">
        {t(
          'Each creation declares its permissions before it opens. Starter examples show the platform’s capabilities; they are not submissions from local residents.',
        )}
      </p>
    </main>
  )
}

/**
 * One card, and the whole card is the control.
 *
 * `Card` with `onClick` gives that for free: one tab stop, one hit area, one
 * announcement. A card with an Open button beside a tappable body gives a
 * resident two targets for one intention and a screen reader two names for the
 * same creation.
 */
function CreationCard({
  creation,
  onOpen,
}: {
  creation: CreationSummary
  onOpen: (creation: CreationSummary) => void
}) {
  return (
    <Card onClick={() => onOpen(creation)}>
      <CardBody>
        <AppIcon creation={creation} />
        <CardTitle>{creation.name}</CardTitle>
        <p className="cr-card-tagline">{creation.tagline}</p>
        <CardMeta>{t(MADE_BY)}</CardMeta>
        <TouchStrip creation={creation} />
      </CardBody>
    </Card>
  )
}

/**
 * The launch-week arrangement: numbered, with the builder's own sentence.
 *
 * Deliberately not `Card` and not `RowList`. A card here would be the
 * failed-store layout this treatment exists to avoid, and a row is a one-line
 * navigation item — these entries carry a name, a sentence, an attribution and
 * a touch strip, which is a short article rather than a row. The hairline
 * between them is the whole visual argument: a numbered list reads as a
 * beginning, and three cards read as empty shelves.
 */
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
            <span className="cr-firsts-name">{creation.name}</span>
            <span className="cr-firsts-why">{firstSentence(creation.description)}</span>
            <span className="cr-firsts-by">{t(MADE_BY)}</span>
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
 * on the first.
 *
 * Not a dark `Card` and not a civic one. The dashed terracotta edge is doing a
 * job neither fill can: this is the one card in the gallery that is not a
 * creation, and it should read as an empty slot waiting for somebody. Filling
 * it navy would make the loudest thing on the screen an advertisement for
 * building, which is exactly what this section is defined against.
 */
function Invitation({ onHowItWorks }: { onHowItWorks: () => void }) {
  return (
    <>
      <article className="cr-invite-card">
        <span className="cr-invite-icon" aria-hidden="true">
          <Icon name="wand" size={22} />
        </span>
        <div className="cr-invite-name">{t('Build one')}</div>
        <p className="cr-invite-copy">
          {t(
            'Start with something you wish existed in town. A useful list, a local guide, a small tool. Learn how to connect an app and submit it for review.',
          )}
        </p>
        <Button variant="secondary" trailingIcon="arrow-right" onClick={onHowItWorks}>
          {t('How it works')}
        </Button>
      </article>

      <p className="cr-invite-line">
        {t('The next useful idea could be yours.')}
        <button className="cr-invite-link" onClick={onHowItWorks}>
          {t('You could make one')} <Icon name="arrow-right" size={15} />
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
