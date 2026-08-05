/**
 * Add an event: the fullest composer, and the one with a preview worth having.
 *
 * The interesting field is `when`, which lives in `WhenField` and reads back
 * what it heard rather than silently correcting anybody. Everything else here
 * is ordinary, which is the point: the shell is learned once and the body is
 * the only part that changes per type.
 *
 * **The place is a listing, never an address somebody typed.** It searches the
 * seven hundred businesses already in the directory, so an event links to a
 * real place with real hours and moves if that business's address does. The
 * escape hatch takes a name and never a street address, because Town Square
 * stores no address for anybody and the promise is only as good as its least
 * careful text field.
 */

import { Textarea, TextInput } from '../ui/index.js'
import { Icon } from '../Icon.js'
import { EVENT_CATEGORIES } from './contributeData.js'
import { PlacePicker } from './PlacePicker.js'
import { WhenField } from './WhenField.js'

export interface EventDraft {
  title: string
  whenText: string
  startsAt: number | null
  place: { listingId: string | null; name: string } | null
  category: (typeof EVENT_CATEGORIES)[number]
  description: string
  cost: 'free' | 'paid' | 'donation'
}

export const emptyEvent: EventDraft = {
  title: '',
  whenText: '',
  startsAt: null,
  place: null,
  category: 'civic',
  // Free is the default because most of what happens here is.
  cost: 'free',
  description: '',
}

/** What the composer collected, in the shape the service validates. */
export function eventContent(draft: EventDraft) {
  return {
    title: draft.title,
    startsAt: draft.startsAt,
    place: draft.place,
    category: draft.category,
    description: draft.description,
    cost: draft.cost,
  }
}

/** What is still missing, said plainly and never as an alarm. */
export function eventMissing(draft: EventDraft): string | null {
  if (!draft.title.trim()) return 'It needs a name.'
  if (draft.startsAt === null) return 'It needs a start time you have confirmed.'
  return null
}

export function EventComposer(props: {
  draft: EventDraft
  onChange: (draft: EventDraft) => void
}) {
  const { draft, onChange } = props
  const set = <K extends keyof EventDraft>(key: K, value: EventDraft[K]) =>
    onChange({ ...draft, [key]: value })

  return (
    <>
      <TextInput
        label="What is it called"
        value={draft.title}
        maxLength={140}
        help="How a neighbour would say it, not how a flyer would print it."
        onChange={(e) => set('title', e.target.value)}
      />

      <WhenField
        text={draft.whenText}
        onText={(whenText) => set('whenText', whenText)}
        startsAt={draft.startsAt}
        onConfirm={(startsAt) => set('startsAt', startsAt)}
      />

      <PlacePicker
        label="Where"
        place={draft.place}
        onPick={(place) => set('place', place)}
        help="Linked to the listing, so the event moves if their address does."
      />

      <div className="cn-field">
        <span className="cn-label" id="cn-cat">
          Category
        </span>
        <div className="cn-chips" role="group" aria-labelledby="cn-cat">
          {EVENT_CATEGORIES.map((category) => {
            const on = draft.category === category
            return (
              <button
                key={category}
                type="button"
                className="cn-chip"
                data-on={on || undefined}
                aria-pressed={on}
                onClick={() => set('category', category)}
              >
                {on ? <Icon name="check" size={16} /> : null}
                <span className="cn-cap">{category}</span>
              </button>
            )
          })}
        </div>
      </div>

      <Textarea
        label="What should people know"
        value={draft.description}
        rows={4}
        maxLength={600}
        help="Plain sentences. No all caps."
        onChange={(e) => set('description', e.target.value)}
      />

      <div className="cn-field">
        <span className="cn-label" id="cn-cost">
          Cost
        </span>
        <div className="cn-cost" role="group" aria-labelledby="cn-cost">
          {(['free', 'paid', 'donation'] as const).map((cost) => (
            <button
              key={cost}
              type="button"
              className="cn-seg"
              data-on={draft.cost === cost || undefined}
              aria-pressed={draft.cost === cost}
              onClick={() => set('cost', cost)}
            >
              {cost === 'free' ? 'Free' : cost === 'paid' ? 'Costs money' : 'Donation'}
            </button>
          ))}
        </div>
        <p className="cn-hint">Free is the default because most of what happens here is.</p>
      </div>
    </>
  )
}

/**
 * Exactly how the town will see it.
 *
 * Including the attribution line, because a resident should find out their name
 * is on it here rather than after pressing publish.
 */
export function EventPreview({ draft, handle }: { draft: EventDraft; handle: string | null }) {
  const when = draft.startsAt === null ? null : new Date(draft.startsAt)
  return (
    <div className="cn-prev">
      <p className="cn-prev-note">This is exactly how it will appear in the week ahead.</p>
      <article className="cn-evcard">
        <div className="cn-evcard-date">
          <span className="cn-evcard-mon">{when ? month(when) : '--'}</span>
          <span className="cn-evcard-day">{when ? when.getDate() : '--'}</span>
        </div>
        <div className="cn-evcard-main">
          <span className="cn-evcard-eyebrow">
            {when ? `${weekday(when)}, ${clock(when)}` : 'No time set'} ·{' '}
            <span className="cn-cap">{draft.category}</span>
          </span>
          <h4 className="cn-evcard-title">{draft.title || 'Untitled'}</h4>
          {draft.place ? (
            <p className="cn-evcard-where">
              <Icon name="map-pin" size={16} /> {draft.place.name}
            </p>
          ) : null}
          {draft.description ? <p className="cn-evcard-body">{draft.description}</p> : null}
          <div className="cn-evcard-foot">
            {draft.cost === 'free' ? <span className="cn-badge">Free</span> : null}
            {handle ? (
              <span className="cn-attrib">
                <Icon name="user" size={16} /> Added by @{handle}
              </span>
            ) : null}
          </div>
        </div>
      </article>
      <p className="cn-prev-caveat">
        <Icon name="info" size={16} />
        Your name is on it. That is not a warning, it is how anyone reading knows a person in town
        put it there.
      </p>
    </div>
  )
}

/* Formatting in the town's own terms. `Intl` rather than a table, and the
 * timezone is the browser's because the instant was resolved server-side in
 * Russellville's zone and a resident reading it is standing in it. */
const month = (d: Date) => new Intl.DateTimeFormat('en-GB', { month: 'short' }).format(d)
const weekday = (d: Date) => new Intl.DateTimeFormat('en-GB', { weekday: 'long' }).format(d)
const clock = (d: Date) =>
  new Intl.DateTimeFormat('en-GB', { hour: 'numeric', minute: '2-digit', hour12: true })
    .format(d)
    .replace(':00', '')
    .replace(' ', '')
