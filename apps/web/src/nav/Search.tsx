/**
 * Search the town. `design/hifi-v2` section 02, specimens 10 and 11.
 *
 * One field over four kinds of thing, because a resident looking for Riverfest
 * does not know whether the town filed it as a story, an event or a place. The
 * ranking is in `searchIndex.ts` and tested there; this file is the surface,
 * the focus behaviour, and the three thin states.
 *
 * ## The whole thing is local
 *
 * No request is made when a resident types. The index is built from payloads
 * the shell already holds — Today, the creation list, and Nearby's 741
 * listings fetched once on first open — so a query never leaves the browser.
 * That is not an optimisation, it is the same call the map made: a search box
 * that phones home is a log of what everybody in town was worried about,
 * joined to a session cookie, and nothing on this screen is worth holding that.
 *
 * ## Why it is a full screen and not a dropdown
 *
 * On a phone a dropdown under the bar is a list you read through a keyboard.
 * The overlay takes the screen, traps focus, and Escape closes it — the same
 * contract `ui/Overlay.tsx` gives a sheet. It is not built on `BottomSheet`
 * because this is not an interruption to answer, it is a place you go: it
 * fills the screen, it scrolls, and it has its own field at the top.
 */

import { useEffect, useMemo, useRef, useState } from 'react'
import { Icon } from '../Icon.js'
import { FOCUSABLE, wrapFocus } from '../ui/index.js'
import { msg, t, tn } from '../i18n/index.js'
import {
  PER_GROUP,
  clearRecent,
  pushRecent,
  readRecent,
  searchTown,
  suggestions,
  type SearchDoc,
  type SearchKind,
} from './searchIndex.js'

/** The leading glyph is a type marker, never decoration: it is what lets a
 *  resident skip three groups without reading them. */
const GLYPH: Record<SearchKind, 'newspaper' | 'ticket' | 'storefront' | 'puzzle'> = {
  story: 'newspaper',
  event: 'ticket',
  place: 'storefront',
  creation: 'puzzle',
}

/** One sentence per kind, so Spanish can agree the article with the noun. */
const SHOW_ALL: Record<SearchKind, string> = {
  story: msg('Show all {count} stories'),
  event: msg('Show all {count} events'),
  place: msg('Show all {count} places'),
  creation: msg('Show all {count} creations'),
}

export interface SearchOverlayProps {
  open: boolean
  onClose: () => void
  /** Everything searchable, already merged and deduped. */
  docs: readonly SearchDoc[]
  /** True while Nearby's listings are still on the way in. */
  loading: boolean
  /** The one kind of hit the shell can navigate to itself. */
  onOpenCreation: (slug: string) => void
  onOpenItem?: (doc: SearchDoc) => void
  /** The way out of a dead end: add the thing the town is missing. */
  onAddSomething: () => void
  townName: string
}

export function SearchOverlay(props: SearchOverlayProps) {
  const [query, setQuery] = useState('')
  const [expanded, setExpanded] = useState<SearchKind | null>(null)
  const [recent, setRecent] = useState<string[]>([])
  const field = useRef<HTMLInputElement | null>(null)
  const panel = useRef<HTMLDivElement | null>(null)
  const opener = useRef<Element | null>(null)

  const groups = useMemo(() => searchTown(props.docs, query, expanded), [props.docs, query, expanded])
  const offers = useMemo(() => suggestions(props.docs), [props.docs])

  useEffect(() => {
    if (!props.open) return
    opener.current = document.activeElement
    setRecent(readRecent())
    field.current?.focus()

    // The page behind stops scrolling. Background scroll under a full-screen
    // layer is the most common way this pattern breaks on a phone.
    const { overflow } = document.body.style
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = overflow
      // Back to the button that opened it, every time. A layer that dumps
      // focus on <body> sends a keyboard resident to the top of the page to
      // find their place again.
      const back = opener.current
      if (back instanceof HTMLElement) back.focus()
    }
  }, [props.open])

  // Fresh field every time it opens. A query left over from this morning is a
  // screen of results for something the resident is no longer looking for.
  useEffect(() => {
    if (!props.open) {
      setQuery('')
      setExpanded(null)
    }
  }, [props.open])

  if (!props.open) return null

  const remember = (text: string) => setRecent(pushRecent(text, recent))

  /** Leaving town, or opening a neighbour's app. Either way the layer closes. */
  const follow = (doc: SearchDoc) => {
    remember(query || doc.title)
    if (doc.slug) {
      props.onClose()
      props.onOpenCreation(doc.slug)
      return
    }
    if (props.onOpenItem) props.onOpenItem(doc)
    else if (doc.href) window.open(doc.href, '_blank', 'noopener,noreferrer')
    props.onClose()
  }

  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Escape') {
      e.stopPropagation()
      props.onClose()
      return
    }
    if (e.key !== 'Tab') return
    const node = panel.current
    if (!node) return
    const items = Array.from(node.querySelectorAll<HTMLElement>(FOCUSABLE))
    const target = wrapFocus({
      count: items.length,
      current: items.indexOf(document.activeElement as HTMLElement),
      shiftKey: e.shiftKey,
    })
    if (target === null) return
    e.preventDefault()
    items[target]?.focus()
  }

  const typed = query.trim().length > 0
  const nothing = typed && groups.length === 0

  return (
    <div
      className="ts-omni"
      role="dialog"
      aria-modal="true"
      aria-label={t('Search {place}', { place: props.townName })}
      ref={panel}
      onKeyDown={onKeyDown}
    >
      <div className="ts-omni-head">
        <div className="ts-omni-field">
          <Icon name="search" size={20} />
          <input
            ref={field}
            type="search"
            value={query}
            placeholder={t('Search {place}', { place: props.townName })}
            aria-label={t('Search {place}', { place: props.townName })}
            autoComplete="off"
            // The browser's own suggestion list would draw over the results
            // and offer things this town has never heard of.
            spellCheck={false}
            onChange={(e) => {
              setQuery(e.target.value)
              setExpanded(null)
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') remember(query)
            }}
          />
        </div>
        <button className="ts-omni-cancel" type="button" onClick={props.onClose}>
          {t('Cancel')}
        </button>
      </div>

      <div className="ts-omni-body">
        {!typed && (
          <>
            <p className="ts-omni-lede">{t('Stories, events, places and creations, all at once.')}</p>

            {recent.length > 0 && (
              <div className="ts-omni-group">
                <div className="ts-omni-glabel">
                  {t('Recent')}
                  <button
                    className="ts-omni-clear"
                    type="button"
                    onClick={() => {
                      clearRecent()
                      setRecent([])
                    }}
                  >
                    {t('Clear')}
                  </button>
                </div>
                {recent.map((entry) => (
                  <button
                    key={entry}
                    className="ts-omni-row"
                    type="button"
                    onClick={() => {
                      setQuery(entry)
                      field.current?.focus()
                    }}
                  >
                    <Icon name="history" size={20} className="ts-omni-ico" />
                    <span className="ts-omni-txt">
                      <span className="ts-omni-t">{entry}</span>
                    </span>
                    {/* Points up and back into the field: press to fill, not to open. */}
                    <Icon name="arrow-up" size={16} className="ts-omni-fill" />
                  </button>
                ))}
              </div>
            )}

            {offers.length > 0 && (
              <div className="ts-omni-group">
                <div className="ts-omni-glabel">{t('Try')}</div>
                {offers.map((doc) => (
                  <button
                    key={`${doc.kind}:${doc.id}`}
                    className="ts-omni-row"
                    type="button"
                    onClick={() => {
                      setQuery(doc.title)
                      field.current?.focus()
                    }}
                  >
                    <Icon name={GLYPH[doc.kind]} size={20} className="ts-omni-ico" />
                    <span className="ts-omni-txt">
                      <span className="ts-omni-t">{doc.title}</span>
                    </span>
                    <Icon name="arrow-up" size={16} className="ts-omni-fill" />
                  </button>
                ))}
              </div>
            )}

            <p className="ts-omni-foot">
              <Icon name="lock" size={16} />
              {t(
                'Searching happens on this device. Nothing you type is sent anywhere, and your recent searches are never used to rank anything.',
              )}
            </p>
          </>
        )}

        {typed && (
          <div aria-live="polite" className="ts-omni-count">
            {nothing
              ? t('Nothing in {place} is filed under {query}.', { place: props.townName, query: query.trim() })
              : tn(groups.length, '{hits} in {count} group.', '{hits} in {count} groups.', { hits: countHits(groups) })}
          </div>
        )}

        {groups.map((group) => (
          <div className="ts-omni-group" key={group.kind}>
            <div className="ts-omni-glabel">{t(group.label)}</div>
            {group.hits.map((doc) => (
              <button
                key={`${doc.kind}:${doc.id}`}
                className="ts-omni-row"
                type="button"
                onClick={() => follow(doc)}
                /* A row with nowhere to go still reads and still says why,
                   rather than being a control that silently does nothing. */
                disabled={!props.onOpenItem && !doc.href && !doc.slug}
              >
                <Icon name={GLYPH[doc.kind]} size={20} className="ts-omni-ico" />
                <span className="ts-omni-txt">
                  <span className="ts-omni-t">{doc.title}</span>
                  {doc.detail && <span className="ts-omni-s">{doc.detail}</span>}
                </span>
                {!props.onOpenItem && doc.href && !doc.slug && <Icon name="external" size={16} className="ts-omni-out" />}
              </button>
            ))}
            {group.total > PER_GROUP && group.hits.length === PER_GROUP && (
              <button
                className="ts-omni-more"
                type="button"
                onClick={() => setExpanded(group.kind)}
              >
                {t(SHOW_ALL[group.kind], { count: group.total })}
                <Icon name="chevron-down" size={16} />
              </button>
            )}
          </div>
        ))}

        {/*
          The dead end, and the screen that decides whether the directory
          grows. "No results found" is a full stop; saying what the index
          actually covers and then handing over the way to fill the gap is an
          invitation. The 700 businesses we start with came from a scrape; the
          ones that make it worth opening in year two come from here.
        */}
        {nothing && (
          <>
            <p className="ts-omni-lede">
              {t(
                "This searches today's stories, what is on today, every business in the directory, and everything neighbours have built. It does not reach back through the archive.",
              )}
            </p>
            <div className="ts-omni-offer">
              <div className="ts-offer-t">{t('Know something we are missing?')}</div>
              <div className="ts-offer-s">
                {t('Add it and it is in {place} for everyone, tonight.', { place: props.townName })}
              </div>
              <button className="ts-offer-btn" type="button" onClick={props.onAddSomething}>
                <Icon name="plus" size={16} />
                {t('Add to the town')}
              </button>
            </div>
          </>
        )}

        {props.loading && (
          <p className="ts-omni-foot">
            <Icon name="loader" size={16} />
            {t('Still loading the rest of the directory.')}
          </p>
        )}
      </div>
    </div>
  )
}

function countHits(groups: ReturnType<typeof searchTown>): string {
  const total = groups.reduce((sum, group) => sum + group.total, 0)
  return tn(total, '{count} result', '{count} results')
}
