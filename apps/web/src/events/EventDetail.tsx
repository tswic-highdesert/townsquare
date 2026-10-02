/**
 * One event. `design/hifi-v2` section 04, specimen 9.
 *
 * Plain words first, exact times second. "Saturday morning" is the answer to
 * the question actually being asked; the stamp underneath is for the person
 * putting it in a calendar, and neither has to be hunted for.
 *
 * ## Two things this screen refuses to draw
 *
 * **A map.** Every coordinate on an event in this feed is a lie: `library.ts`
 * and `state-parks.ts` stamp one hardcoded pair in the middle of Russellville
 * on everything they produce, including events fifteen miles out in Dover and
 * Hector, and a third source emits `(0, 0)`. A map centred on a place we do not
 * know is worse than an address, because a resident acts on a map. The address
 * string is what the scrape actually has, so the address string is what is
 * shown, and the directions link only appears when that string is a street
 * address rather than "Location TBA".
 *
 * **An RSVP.** Every event here is somebody else's event. Drawing a Going
 * button on the library's book sale, collecting taps and sending them nowhere
 * is a fake capability, and it costs exactly one disappointed resident at a
 * door to burn the trust the whole product runs on. So this screen has the
 * link-out state and only the link-out state, plus the one thing Town Square
 * can honestly do, which is remember it for you.
 */

import { useEffect, useState } from 'react'
import { Icon } from '../Icon.js'
import {
  Button,
  Card,
  CardBody,
  EmptyState,
  RowIcon,
  RowItem,
  RowList,
  Skeleton,
} from '../ui/index.js'
import { saveThing, unsaveThing, type SavedThing } from '../savesData.js'
import type { AccountView } from '../session.js'
import { CATEGORY_ICON, CATEGORY_WORD } from './categories.js'
import { fetchEvent, type EventDetailPayload, type EventRow } from './eventsData.js'
import { relativeLabel, rowState, townClock } from './relative.js'
import './events.css'

export interface EventDetailScreenProps {
  id: string
  account: AccountView | null
  saved: SavedThing[]
  onSavedChange: (saved: SavedThing[]) => void
  onBack: () => void
  onOpenEvent: (id: string) => void
  onOpenDay: (day: string) => void
  onSignIn?: () => void
}

export function EventDetailScreen(props: EventDetailScreenProps) {
  const [event, setEvent] = useState<EventDetailPayload | null | 'missing' | 'failed'>(null)

  useEffect(() => {
    setEvent(null)
    void fetchEvent(props.id).then(
      (next) => setEvent(next ?? 'missing'),
      () => setEvent('failed'),
    )
  }, [props.id])

  if (event === 'failed') return <div className="ev-detailscreen"><Back onBack={props.onBack} /><EmptyState mark="calendar" line="This event could not be loaded" sub="Please try again in a moment." action={{label: 'Try again', onAct: () => window.location.reload()}} /></div>

  if (event === 'missing') {
    return (
      <div className="ev-detailscreen">
        <Back onBack={props.onBack} />
        {/*
          A scraped calendar drops things, and when it does the listing is
          genuinely gone rather than broken. Saying so plainly beats a shell of
          a screen with empty fields in it.
        */}
        <EmptyState
          mark="calendar"
          line="This listing is no longer on the calendar"
          sub="It was taken down at the source, or it has already happened and rolled off. Nothing on your end went wrong."
          action={{ label: 'Back to the calendar', onAct: props.onBack }}
        />
      </div>
    )
  }

  if (!event) {
    return (
      <div className="ev-detailscreen" aria-busy="true">
        <Back onBack={props.onBack} />
        <Skeleton width="60%" height={28} />
        <Skeleton width="40%" />
        <Skeleton shape="block" height={140} />
      </div>
    )
  }

  return <Loaded event={event} {...props} />
}

function Back(props: { onBack: () => void }) {
  return (
    <button className="ev-back" onClick={props.onBack}>
      <Icon name="chevron-left" size={16} /> The calendar
    </button>
  )
}

function Loaded(props: EventDetailScreenProps & { event: EventDetailPayload }) {
  const { event } = props
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30_000)
    return () => clearInterval(id)
  }, [])

  const state = rowState(event, now)
  const soon = relativeLabel(event, now)

  const isSaved = props.saved.some((s) => s.kind === 'event' && s.refId === event.id)

  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState(false)
  const toggleSave = async () => {
    if (saving) return
    setSaving(true)
    setSaveError(false)
    try {
    if (isSaved) {
      // Optimistic, then rolled back if it is refused. Same shape as the
      // bookmark on a Nearby row: a person pressing it twice is checking
      // whether it worked, and the friendly answer is also the true one.
      const before = props.saved
      props.onSavedChange(before.filter((s) => !(s.kind === 'event' && s.refId === event.id)))
      if (!(await unsaveThing('event', event.id))) { props.onSavedChange(before); setSaveError(true) }
      return
    }
    const save = await saveThing({
      kind: 'event',
      refId: event.id,
      title: event.title,
      // A save is a snapshot, not a pointer: it reads as it read when the
      // button was pressed. See the note in DEVELOPING.md under Yours.
      detail: `${event.whenExact} · ${event.location}`,
      ...(event.url ? { url: event.url } : {}),
    })
    if (save) props.onSavedChange([save, ...props.saved])
    else setSaveError(true)
    } catch { setSaveError(true) } finally { setSaving(false) }
  }

  return (
    <article className="ev-detailscreen">
      <Back onBack={props.onBack} />

      <div className="ev-detailscreen-top">
        <span className="ev-cat" data-category={event.category}>
          <Icon name={CATEGORY_ICON[event.category]} size={14} />
          {CATEGORY_WORD[event.category]}
        </span>
        {state === 'now' && <span className="ev-chip ev-chip--now">on now</span>}
        {soon && state === 'soon' && <span className="ev-chip ev-chip--soon">{soon}</span>}
      </div>

      <h1 className="ev-detailscreen-title">{event.title}</h1>

      <Card className="ev-when">
        <CardBody>
          <p className="ev-when-plain">{event.whenPlain}</p>
          <p className="ev-when-exact">
            <Icon name="clock" size={14} />
            {event.whenExact}
          </p>
          {!event.allDay && !event.endsAt && (
            /* Said out loud rather than left as a blank. "Until when" is the
               second question anybody asks, and "the source did not say" is a
               better answer than an end time we made up. */
            <p className="ev-when-note">No end time published.</p>
          )}
        </CardBody>
      </Card>

      {saveError && <p className="problem" role="alert">Could not update your saves. Please try again.</p>}
      <div className="ev-actions">
        {!props.account && props.onSignIn && <Button icon="bookmark" onClick={props.onSignIn}>Sign in to save this</Button>}
        {props.account && (
          <Button
            variant={isSaved ? 'secondary' : 'primary'}
            icon={isSaved ? 'bookmark-filled' : 'bookmark'}
            disabled={saving}
            onClick={() => void toggleSave()}
          >
            {saving ? 'Saving…' : isSaved ? 'Saved' : 'Save this'}
          </Button>
        )}
        {event.url && (
          <Button
            variant="secondary"
            trailingIcon="arrow-out"
            onClick={() => window.open(event.url ?? '', '_blank', 'noopener,noreferrer')}
          >
            Open the original
          </Button>
        )}
      </div>

      <section className="ev-block">
        <h2 className="ev-blocklabel">Where</h2>
        {/*
          A plain card, not a card-level target. Directions is its own action
          and nesting a link inside a link is the thing `Card` warns about;
          Nearby's Call and Directions buttons are the pattern.
        */}
        <Card className="ev-where">
          <CardBody>
            <p>{event.location}</p>
            {event.directionsUrl && (
              <a
                className="ev-directions"
                href={event.directionsUrl}
                target="_blank"
                rel="noopener noreferrer"
              >
                <Icon name="directions" size={14} />
                Directions
              </a>
            )}
          </CardBody>
        </Card>
      </section>

      {event.description && (
        <section className="ev-block">
          <h2 className="ev-blocklabel">About</h2>
          <p className="ev-prose">{event.description}</p>
        </section>
      )}

      {event.alsoThatDay.length > 0 && (
        <section className="ev-block">
          <h2 className="ev-blocklabel">Also that day</h2>
          <RowList className="ev-agenda" density="compact">
            {event.alsoThatDay.map((row) => (
              <AlsoRow key={row.id} row={row} onOpen={props.onOpenEvent} />
            ))}
          </RowList>
          <button className="ev-link" onClick={() => props.onOpenDay(event.day)}>
            See the whole day
            <Icon name="chevron-right" size={14} />
          </button>
        </section>
      )}

      {/*
        The source line is not a footnote. Everything on this screen came off
        somebody else's website, and saying so, with when we last looked, is the
        whole basis for trusting the rest of it.

        "Last checked" is the assembly time and not a per-item fetch stamp,
        because no scraper records one: `updatedAt` on an event is set to the
        event's own start date. The scrape behind it is at most fifteen minutes
        older than the assembly, which is why the sentence says roughly rather
        than exactly.
      */}
      <footer className="ev-source">
        <div>
          <b>From {event.source.name}</b>
          <span>Last checked around {townClock(Date.parse(event.generatedAt), event.town.timezone)}</span>
        </div>
        {event.url && (
          <a href={event.url} target="_blank" rel="noopener noreferrer">
            <Icon name="arrow-out" size={14} />
            Open the original
          </a>
        )}
      </footer>
    </article>
  )
}

function AlsoRow(props: { row: EventRow; onOpen: (id: string) => void }) {
  const { row } = props
  return (
    <RowItem
      className="ev-agenda-row"
      onClick={() => props.onOpen(row.id)}
      /* Section 04's agenda draws no chevron, and the trailing corner already
         belongs to the status chip. Still a button, still one target. */
      chevron={false}
      lead={
        <>
          <span className="ev-time" data-allday={row.allDay || undefined}>
            {row.allDay ? (
              <span className="ev-allday">
                all
                <br />
                day
              </span>
            ) : (
              <>
                <span className="ev-clock">{row.timeLabel}</span>
                <span className="ev-meridiem">{row.meridiem}</span>
              </>
            )}
          </span>
          <RowIcon name={CATEGORY_ICON[row.category]} className={`ev-tile ev-tile--${row.category}`} />
        </>
      }
      title={row.title}
      meta={row.detail}
    />
  )
}
