import { useState, type ReactNode } from 'react'
import { AppBar } from './AppBar.js'
import { Icon, Mark, type IconName } from './Icon.js'
import { TabBar, type TabName } from './TabBar.js'
import type { TodayPayload, TodayStory } from './todayData.js'
import type { AccountView } from './session.js'
import { t, tn } from './i18n/index.js'

export interface TodayProps {
  today: TodayPayload
  account: AccountView | null
  canReview: boolean
  onOpenCreation: (slug: string) => void
  onBrowseCreations: () => void
  onOpenNews: () => void
  onOpenEvents: () => void
  onOpenStory?: (id: string) => void
  onOpenEvent?: (id: string) => void
  onOpenPlace?: (id: string) => void
  onOpenMap?: () => void
  onOpenPlan?: () => void
  onContribute?: () => void
  onTab: (tab: TabName) => void
  onAccount: () => void
  onReview: () => void
}

/** An illustration represents a category, never a photograph of a specific place. */
function LocalArt({ kind = 'community' }: { kind?: string }) {
  const music = kind === 'music'
  const outdoors = /park|outdoor|sport|nature/i.test(kind)
  return <svg className="daily-art" viewBox="0 0 320 200" aria-hidden="true" data-kind={music ? 'music' : outdoors ? 'outdoors' : 'community'}>
    <rect width="320" height="200" fill="var(--art-wash)" />
    {music ? <><circle cx="152" cy="109" r="78" fill="var(--art-ink)" /><circle cx="152" cy="109" r="57" fill="none" stroke="var(--art-soft)" strokeWidth="3" /><circle cx="152" cy="109" r="37" fill="var(--art-soft)" /><circle cx="152" cy="109" r="9" fill="var(--art-wash)" /><path d="M246 36v104c0 18-35 22-35 3 0-14 22-21 35-13M246 36l34 12v58" fill="none" stroke="var(--art-ink)" strokeWidth="8" strokeLinecap="round" /></>
      : outdoors ? <><circle cx="248" cy="52" r="24" fill="var(--ts-gold)" /><path d="M0 125Q75 44 153 118T320 91V200H0Z" fill="var(--art-soft)" /><path d="M0 162Q86 110 180 153T320 123V200H0Z" fill="var(--art-ink)" /><path d="M26 179h104m40 9h86" stroke="var(--art-wash)" strokeWidth="4" strokeLinecap="round" /></>
      : <><path d="M65 185V91h190v94" fill="var(--art-soft)" /><path d="M50 88l110-56 110 56Z" fill="var(--art-ink)" /><path d="M89 112v72m47-72v72m47-72v72m47-72v72" stroke="var(--art-wash)" strokeWidth="13" /><path d="M53 187h216" stroke="var(--art-ink)" strokeWidth="9" /><circle cx="271" cy="42" r="14" fill="var(--ts-gold)" /></>}
  </svg>
}

function StoryImage({ story, lead = false }: { story: TodayStory; lead?: boolean }) {
  const [failed, setFailed] = useState(false)
  const [portrait, setPortrait] = useState(false)
  const show = story.imageUrl && !failed
  return <span className={`daily-media${lead ? ' daily-media-lead' : ''}`} data-portrait={portrait || undefined}>
    {show ? <><img src={story.imageUrl!} srcSet={`${story.imageUrl}?w=640 640w, ${story.imageUrl}?w=1000 1000w`} sizes={lead ? "(max-width: 700px) 100vw, 800px" : "(max-width: 700px) 100vw, 350px"} fetchPriority={lead ? "high" : "auto"} decoding="async" alt="" loading={lead ? 'eager' : 'lazy'} onLoad={e => setPortrait(e.currentTarget.naturalWidth / e.currentTarget.naturalHeight < .9)} onError={() => setFailed(true)} /><span className="daily-credit">{t('Photo: {source}', { source: story.source })}</span></>
      : <span className="daily-source-art"><Icon name="newspaper" size={30} /><span>{story.source}</span><small>{t('From our local sources')}</small></span>}
  </span>
}
function Destination({ onOpen, url, className, children }: { onOpen?: (() => void) | undefined; url?: string | null | undefined; className: string; children: ReactNode }) {
  if (onOpen) return <button className={className} onClick={onOpen}>{children}</button>
  if (url) return <a className={className} href={url} target="_blank" rel="noopener noreferrer">{children}</a>
  return <div className={className}>{children}</div>
}
function Heading({ title, action, onAction }: { title: string; action?: string; onAction?: () => void }) {
  return <div className="daily-heading"><h2>{title}</h2>{action && onAction && <button onClick={onAction}>{action}<Icon name="chevron-right" size={18} /></button>}</div>
}

export function Today(props: TodayProps) {
  const { today } = props
  return <div className="today daily-today">
    <AppBar label="Town Square" place={today.town.name} account={props.account} canReview={props.canReview} onAccount={props.onAccount} onReview={props.onReview} />
    <main className="daily-content" id="ts-main" tabIndex={-1}>
      <header className="daily-greeting"><p>{today.dateLabel}</p><h1>{today.greeting}, {today.town.name}</h1><span>{t('Your corner of the River Valley.')}</span></header>
      <div className="daily-opening">
        {today.lead ? <article className="daily-lead"><Destination className="daily-story-link" onOpen={props.onOpenStory ? () => props.onOpenStory!(today.lead!.id) : undefined} url={today.lead.url}>
          <StoryImage story={today.lead} lead /><span className="daily-kicker">{today.lead.source} · {today.lead.timeLabel}</span><h2>{today.lead.title}</h2><p>{today.lead.summary}</p><span className="daily-read">{t('Read the story')} <Icon name="arrow-right" size={18} /></span>
        </Destination></article> : <section className="daily-empty"><LocalArt kind="outdoors"/><h2>{t('A little room to catch your breath.')}</h2><p>{t('Local stories will appear here as our sources publish. In the meantime, find somewhere worth a visit.')}</p><button className="daily-button" onClick={() => props.onTab('nearby')}>{t('Explore the directory')}</button></section>}
        <section className="daily-events"><Heading title={t('Happening today')} action={t('All events')} onAction={props.onOpenEvents}/>
          {today.events.items.length ? <ul>{today.events.items.map(event => <li key={event.id}><Destination className="daily-event" onOpen={props.onOpenEvent ? () => props.onOpenEvent!(event.id) : undefined} url={event.url}><span className="daily-event-art"><LocalArt kind={event.category}/></span><span className="daily-event-copy"><span className="daily-event-time">{event.timeLabel} {event.meridiem}</span><strong>{event.title}</strong><span>{event.location || event.detail}</span></span></Destination></li>)}</ul> : <div className="daily-empty-events"><Icon name="calendar" size={32}/><h3>{t('A quiet day on the calendar.')}</h3><p>{t('See what is coming up around the River Valley.')}</p><button className="daily-text-button" onClick={props.onOpenEvents}>{t('Browse upcoming events')} <Icon name="arrow-right" size={18}/></button></div>}
          <div className="daily-calendar-note"><Icon name="clock" size={17}/><span>{t('Times shown in {town}’s local time. Check the event source before heading out.', { town: today.town.name })}</span></div>
          {today.events.items.length < 3 && props.onOpenPlan && <div className="daily-plan-teaser"><Icon name="map" size={46}/><span className="daily-kicker">{t('Your next little adventure')}</span><h3>{t('Make a day of it.')}</h3><p>{t('Start with coffee. Find something happening. Keep a few places to try.')}</p><button className="daily-button" onClick={props.onOpenPlan}>{t('Plan a River Valley day')} <Icon name="arrow-right" size={18}/></button>{props.onOpenMap && <button className="daily-text-button" onClick={props.onOpenMap}>{t('Explore the map')} <Icon name="compass" size={18}/></button>}</div>}
        </section>
      </div>
      {today.more.length > 0 && <section className="daily-section"><Heading title={t('More from town')} action={t('All news')} onAction={props.onOpenNews}/><p className="daily-section-dek">{t('Fresh perspectives from local sources.')}</p><div className="daily-stories">{today.more.slice(0,4).map(story => <article key={story.id}><Destination className="daily-story-link" onOpen={props.onOpenStory ? () => props.onOpenStory!(story.id) : undefined} url={story.url}><StoryImage story={story}/><span className="daily-story-copy"><span className="daily-kicker">{story.source}</span><h3>{story.title}</h3><span className="daily-story-date">{story.timeLabel}</span></span></Destination></article>)}</div></section>}
      <section className="daily-section daily-discover"><div><span className="daily-kicker">{t('A good day starts close to home')}</span><h2>{t('Take the long way around town.')}</h2><p>{t('A favorite place. A new trail. Somewhere you have passed a hundred times and never stepped inside.')}</p><button className="daily-button" onClick={props.onOpenMap ?? (() => props.onTab('nearby'))}>{t('Explore the town')} <Icon name="compass" size={20}/></button>{props.onOpenPlan && <button className="daily-text-button" onClick={props.onOpenPlan}>{t('Plan a River Valley day')} <Icon name="arrow-right" size={18}/></button>}</div><div className="daily-landscape"><LocalArt kind="outdoors"/><span>{t('Explore Russellville & the River Valley')}</span></div></section>
      {today.directory.length > 0 && <section className="daily-section"><Heading title={t('Around the corner')} action={t('Browse directory')} onAction={() => props.onTab('nearby')}/><div className="daily-places">{today.directory.map(place => <article key={place.id}><Destination className="daily-place-link" onOpen={props.onOpenPlace ? () => props.onOpenPlace!(place.id) : undefined} url={place.url}><span className="daily-place-art"><Icon name={placeIcon(place.category)} size={44}/><span>{place.category}</span></span><h3>{place.name}</h3><p>{place.detail}</p></Destination><div className="daily-place-actions">{place.phone && <a href={`tel:${place.phone.replace(/[^\d+]/g,'')}`}><Icon name="phone" size={17}/>{t('Call')}</a>}{place.mapUrl && <a href={place.mapUrl} target="_blank" rel="noopener noreferrer"><Icon name="directions" size={17}/>{t('Directions')}</a>}</div></article>)}</div></section>}
      {(today.cityHall.notice || today.cityHall.items.length > 0) && <section className="daily-section daily-civic"><Heading title={t('From city hall')}/><div className="daily-civic-items">{[...(today.cityHall.notice ? [today.cityHall.notice] : []), ...today.cityHall.items].map(item => <Destination key={item.id} className="daily-civic-link" url={item.url}><Icon name="building" size={26}/><span><strong>{item.title}</strong><small>{item.detail}</small></span><Icon name="arrow-out" size={20}/></Destination>)}</div></section>}
      <section className="daily-section daily-invitation"><span className="daily-invitation-icon"><Icon name="puzzle" size={35}/></span><div><span className="daily-kicker">{t('There is room for your idea')}</span><h2>{t('What would you make for your neighbors?')}</h2><p>{t('Small, useful apps can make a town feel more connected. Explore what a Town Square creation can do.')}</p></div><button className="daily-button" onClick={props.onBrowseCreations}>{t('Explore creations')} <Icon name="arrow-right" size={18}/></button></section>
      <footer className="daily-footer"><Mark size={32}/><div><strong>Town Square, River Valley</strong><p>{t('Local sources. A little more connected.')}</p><small>{today.footer.sourceCheckedLabel ? t('Feeds checked {when}', { when: today.footer.sourceCheckedLabel }) : t('Today’s edition · {when}', { when: today.footer.updatedLabel })} · {tn(today.footer.sourceCount, '{count} sources', '{count} sources')}</small>{today.footer.sourceNote && <small>{today.footer.sourceNote}</small>}</div></footer>
    </main>
    <TabBar current="today" onChange={props.onTab}/>
  </div>
}
function placeIcon(category: string): IconName { return /food|restaurant|cafe/i.test(category) ? 'utensils' : /park|outdoor/i.test(category) ? 'tree' : /university|school/i.test(category) ? 'book' : 'storefront' }
