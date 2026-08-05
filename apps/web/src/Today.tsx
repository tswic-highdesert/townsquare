/**
 * Today — the resident home. `design/hifi` section 4a.
 *
 * One screen a neighbour opens once a morning, so it is a read, not an app: it
 * answers "what is happening in town" and gets out of the way. Every section
 * comes from `GET /api/today` and every one of them disappears when there is
 * nothing real behind it. A town screen that pads itself out on a quiet
 * Tuesday teaches people it is padded on a loud one.
 *
 * Two things in the hi-fi are not here, on purpose, and both are noted in
 * DEVELOPING.md: the weather chip and the neighbour stream. Neither has a
 * source yet, and drawing them from invented data is the one thing a town
 * information service cannot come back from.
 */

import { AppBar } from './AppBar.js'
import { Icon, Mark, type IconName } from './Icon.js'
import { RowIcon, RowItem, RowList } from './ui/index.js'
import { TabBar, type TabName } from './TabBar.js'
import type {
  EventCategory,
  TodayCreation,
  TodayEvent,
  TodayPayload,
  TodayStory,
} from './todayData.js'
import type { AccountView } from './session.js'

export interface TodayProps {
  today: TodayPayload
  account: AccountView | null
  canReview: boolean
  onOpenCreation: (slug: string) => void
  onBrowseCreations: () => void
  /** The news screen, reached from the head of "More from town". */
  onOpenNews: () => void
  /** The calendar, reached from the head of "Happening today". */
  onOpenEvents: () => void
  onTab: (tab: TabName) => void
  onAccount: () => void
  onReview: () => void
}

export function Today(props: TodayProps) {
  const { today } = props

  return (
    <div className="today">
      <AppBar
        label="Town Square"
        place={today.town.name}
        account={props.account}
        canReview={props.canReview}
        onAccount={props.onAccount}
        onReview={props.onReview}
      />

      {/*
        Where the skip link lands. `tabIndex={-1}` makes a non-interactive
        block focusable by that link and by nothing else, so a keyboard
        resident arrives at the top of the town rather than at the third
        control in the bar.
      */}
      <div className="today-greeting" id="ts-main" tabIndex={-1}>
        <div className="today-date">
          <Icon name="calendar" size={13} />
          {today.dateLabel}
        </div>
        <h1 className="today-hello">
          {today.greeting},<br />
          {today.town.name}.
        </h1>
      </div>

      {today.lead && <LeadStory story={today.lead} />}

      {today.more.length > 0 && (
        <section className="today-section">
          {/*
            The door to the news screen, and the only one. News is not a tab:
            four destinations is the resident path, and a fifth for a thing
            already summarised here would be a nav that describes our filing
            system. A resident who wants more of what they are reading asks
            for it from the section they are reading.
          */}
          <SectionHead label="More from town" action="All news" onAction={props.onOpenNews} />
          {/*
            The headline leads and the thumbnail trails, which is the shape
            `Row`'s trailing slot exists for. No chevron: the photo already
            says there is something to open, and two affordances in one corner
            is one too many.

            Roughly half the town's stories come with a photo and the rest do
            not, so the thumbnail stays an enhancement rather than the layout —
            the row reads the same without one, and the `onError` still hides a
            thumb whose source 404s rather than leaving a broken frame.
          */}
          <RowList framed={false} label="More from town">
            {today.more.map((story) => (
              <RowItem
                key={story.id}
                title={story.title}
                meta={`${story.source} · ${story.timeLabel}`}
                href={story.url ?? undefined}
                external
                chevron={false}
                trailing={
                  story.imageUrl ? (
                    <img
                      className="ts-row-thumb"
                      src={story.imageUrl}
                      alt=""
                      loading="lazy"
                      onError={(e) => {
                        e.currentTarget.style.setProperty('display', 'none')
                      }}
                    />
                  ) : undefined
                }
              />
            ))}
          </RowList>
        </section>
      )}

      {today.events.items.length > 0 && (
        <section className="today-section">
          <SectionHead
            label="Happening today"
            // The count is of everything today, not of the three shown. A
            // resident deciding whether to go looking needs to know there are
            // nine, and the honest place to say so is the affordance itself.
            action={today.events.total > today.events.items.length ? `All ${today.events.total}` : null}
            // Now a real control rather than a static count. The head of the
            // section is the door to the rest of it, the same as "All news".
            onAction={props.onOpenEvents}
          />
          <ul className="event-list">
            {today.events.items.map((event) => (
              <EventRow key={event.id} event={event} />
            ))}
          </ul>
        </section>
      )}

      {today.neighbors.featured && (
        <section className="today-section">
          {/*
            Unconditional, even when everything already fits on this screen.
            The gallery is the only route to the full list and to what a
            creation is allowed to touch; gating the link on a count of two
            made it unreachable in a town with one app, which is every town on
            its first day.
          */}
          <SectionHead
            label="From your neighbors"
            action="Browse"
            onAction={props.onBrowseCreations}
          />
          <FeaturedCreation
            creation={today.neighbors.featured}
            onOpen={() => props.onOpenCreation(today.neighbors.featured!.slug)}
          />
          <RowList framed={false} label="More from your neighbours">
            {today.neighbors.rest.map((creation) => (
              <RowItem
                key={creation.slug}
                lead={<CreationIcon creation={creation} size={42} />}
                title={creation.name}
                meta={creation.tagline}
                onClick={() => props.onOpenCreation(creation.slug)}
              />
            ))}
          </RowList>
        </section>
      )}

      {/*
        City hall, wrapped so the desktop shell can put it in a third column.
        `nav/nav.css` moves this whole element at 1040px and leaves it exactly
        where it was below that: an `<aside>` with no styles of its own is a
        block, so the phone screen is unchanged to the pixel.

        A wrapper rather than a duplicate. Rendering the notice a second time
        from the same payload would put it on one screen twice, and the copy
        that drifts is always the one nobody is looking at.

        The directory deliberately did not come with it. It is a horizontally
        scrolling strip of fixed-width cards, and in a 300px column that is two
        cramped cards with the business names wrapping mid-word — a component
        put somewhere it was never drawn for. It stays in the reading column,
        where it has the width it was designed against.
      */}
      <aside className="today-aside" aria-label="From city hall">
      {(today.cityHall.notice || today.cityHall.items.length > 0) && (
        <section className="today-section">
          <SectionHead label="From city hall" />
          {today.cityHall.notice && (
            <Outside
              href={today.cityHall.notice.url}
              className="notice"
              data-severity={today.cityHall.notice.severity}
            >
              <span className="notice-icon">
                <Icon name="warning" size={18} />
              </span>
              <span>
                <span className="notice-title">{today.cityHall.notice.title}</span>
                {today.cityHall.notice.detail && (
                  <span className="notice-detail">{today.cityHall.notice.detail}</span>
                )}
              </span>
            </Outside>
          )}
          <RowList framed={false} label="From city hall">
            {today.cityHall.items.map((item) => (
              <RowItem
                key={item.id}
                lead={<RowIcon name="document" />}
                title={item.title}
                meta={item.detail}
                href={item.url ?? undefined}
                external
              />
            ))}
          </RowList>
        </section>
      )}
      </aside>

      {today.directory.length > 0 && (
        <section className="today-section">
          <SectionHead label="In the directory" />
          <div className="directory-strip">
            {today.directory.map((business) => (
              <div key={business.id} className="directory-card">
                <Outside href={business.url} className="directory-head">
                  <span className="directory-icon">
                    <Icon name="storefront" size={22} />
                  </span>
                  <span className="directory-name">{business.name}</span>
                  {/*
                    Open right now, not a printed range the reader has to compare
                    against their own watch. `openNow` is null when the hours
                    could not be parsed honestly, and then this is just the text.
                  */}
                  <span className="directory-detail" data-open={business.openNow ?? undefined}>
                    {business.openNow === null ? (
                      <Icon name="clock" size={13} />
                    ) : (
                      <span className="open-dot" />
                    )}
                    {business.detail}
                  </span>
                </Outside>
                <div className="directory-actions">
                  {business.phone && (
                    <a className="directory-action" href={`tel:${business.phone.replace(/[^\d+]/g, '')}`}>
                      Call
                    </a>
                  )}
                  {business.mapUrl && (
                    <a
                      className="directory-action"
                      href={business.mapUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      Directions
                    </a>
                  )}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      <footer className="today-footer">
        <div>
          <div className="today-signoff">That&rsquo;s {today.dayName}.</div>
          <div className="today-updated">
            Updated {today.footer.updatedLabel} · {today.footer.sourceCount}{' '}
            {plural(today.footer.sourceCount, 'source')} ·{' '}
            {today.footer.creationCount} neighbor{' '}
            {plural(today.footer.creationCount, 'app')}
          </div>
        </div>
        <Mark size={26} />
      </footer>

      <TabBar current="today" onChange={props.onTab} />
    </div>
  )
}

function SectionHead({
  label,
  action,
  onAction,
}: {
  label: string
  action?: string | null
  onAction?: () => void
}) {
  return (
    <div className="section-head">
      <span className="section-rule" />
      <span className="section-label">{label}</span>
      {action &&
        (onAction ? (
          <button className="section-action" onClick={onAction}>
            {action}
            <Icon name="chevron-right" size={14} />
          </button>
        ) : (
          <span className="section-action" data-static="true">
            {action}
            <Icon name="chevron-right" size={14} />
          </span>
        ))}
    </div>
  )
}

/*
 * No reading time on the byline.
 *
 * Every story this town publishes arrives with `body` identical to
 * `description` — the sources syndicate a summary, not an article — so the
 * estimate is one minute for all 81 of them. A number that is always the same
 * is not an estimate, it is decoration that looks like information. The
 * calculation stays in `today.ts` for the day a source gives us real bodies.
 */
function LeadStory({ story }: { story: TodayStory }) {
  return (
    <section className="today-section">
      <SectionHead label="Top of town" />
      {/*
        Two heroes, not one with a hole in it. Most mornings the API finds a
        story with art and this is a photo hero. When the whole town has
        published nothing with a picture, `data-art="none"` gives a deliberate
        typographic hero instead — a headline in a big font on a bare page reads
        as a screen that could not fill itself, which is the opposite of what
        the top of Today should say.
      */}
      <Outside href={story.url} className="lead" data-art={story.imageUrl ? 'photo' : 'none'}>
        {story.imageUrl ? (
          <span className="lead-image">
            <img src={story.imageUrl} alt="" loading="lazy" />
            <span className="lead-kind">
              <Icon name="newspaper" size={12} />
              NEWS
            </span>
          </span>
        ) : (
          <span className="lead-kind">
            <Icon name="newspaper" size={12} />
            NEWS
          </span>
        )}
        <span className="lead-body">
          <span className="lead-title">{story.title}</span>
          {!story.imageUrl && story.summary && (
            // The summary earns its place only on the typographic hero, where
            // it is doing the work the photo would have done.
            <span className="lead-summary">{story.summary}</span>
          )}
          <span className="lead-byline">
            <span className="lead-source-mark">{story.sourceInitial}</span>
            <span className="lead-source">{story.source}</span>
            <span className="lead-dot" />
            <span className="lead-meta">
              {story.timeLabel}
            </span>
          </span>
        </span>
      </Outside>
    </section>
  )
}

const EVENT_ICON: Record<EventCategory, IconName> = {
  civic: 'gavel',
  music: 'music',
  sport: 'sport',
  community: 'group',
}

function EventRow({ event }: { event: TodayEvent }) {
  return (
    <li>
      <Outside href={event.url} className="event-row">
        <span className="event-time">
          <span className="event-clock">{event.timeLabel}</span>
          <span className="event-meridiem">{event.meridiem}</span>
        </span>
        <span className="event-icon" data-category={event.category}>
          <Icon name={EVENT_ICON[event.category]} size={18} />
        </span>
        <span className="event-text">
          <span className="event-title">{event.title}</span>
          {event.detail && <span className="event-detail">{event.detail}</span>}
        </span>
      </Outside>
    </li>
  )
}

function FeaturedCreation({ creation, onOpen }: { creation: TodayCreation; onOpen: () => void }) {
  return (
    <div className="featured">
      <div className="featured-head">
        <CreationIcon creation={creation} size={28} onNavy />
        {/*
          With a name it is "made by your neighbor / Dana Whitfield", as the
          hi-fi has it. Without one it collapses to a single line rather than
          "made by your neighbor / a neighbor", which says the word twice and
          reads like a bug. Attribution arrives when a creation goes through the
          review queue; the examples never did.
        */}
        <div className="featured-by">
          {creation.author ? (
            <>
              made by your neighbor
              <span>{creation.author}</span>
            </>
          ) : (
            'made by a neighbor'
          )}
        </div>
        <span className="featured-kind">APP</span>
      </div>
      <div className="featured-name">{creation.name}</div>
      <div className="featured-tagline">{creation.tagline}</div>
      <button className="featured-open" onClick={onOpen}>
        Open
        <Icon name="arrow-out" size={14} />
      </button>
    </div>
  )
}

/**
 * A creation's own icon, which it supplied, or its initials if it has none.
 *
 * The icon is served from the creation's bundle origin, so a broken or missing
 * one is a normal state rather than an error — and a broken image on the home
 * screen looks like the town is broken. `onError` swaps in the fallback rather
 * than leaving the browser's placeholder.
 */
function CreationIcon({
  creation,
  size,
  onNavy,
}: {
  creation: TodayCreation
  size: number
  onNavy?: boolean
}) {
  return (
    <span className="creation-icon" data-on-navy={onNavy || undefined} style={{ width: size, height: size }}>
      {creation.icon ? (
        <img
          src={creation.icon}
          alt=""
          loading="lazy"
          onError={(e) => {
            e.currentTarget.style.display = 'none'
          }}
        />
      ) : null}
      <span className="creation-icon-fallback">{initials(creation.name)}</span>
    </span>
  )
}

/**
 * A link that leaves town, or a plain box when there is nowhere to go.
 *
 * Every outbound link is `noopener noreferrer`: the shell holds the session
 * cookie, and a source's page getting a handle on this window is not a risk
 * worth taking to save an attribute.
 */
function Outside({
  href,
  className,
  children,
  ...rest
}: {
  href: string | null
  className: string
  children: React.ReactNode
} & Record<string, unknown>) {
  if (!href) {
    return (
      <div className={className} {...rest}>
        {children}
      </div>
    )
  }
  return (
    <a className={className} href={href} target="_blank" rel="noopener noreferrer" {...rest}>
      {children}
    </a>
  )
}

function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean)
  const first = words[0]?.[0] ?? '·'
  const second = words.length > 1 ? (words[words.length - 1]?.[0] ?? '') : (words[0]?.[1] ?? '')
  return (first + second).toUpperCase()
}

function plural(n: number, word: string): string {
  return n === 1 ? word : `${word}s`
}
