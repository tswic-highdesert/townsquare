import { useEffect, useMemo, useState } from 'react'
import { Icon } from './Icon.js'
import { Button } from './ui/index.js'
import { fetchDay, type DayPayload, type EventRow } from './events/eventsData.js'
import { fetchDirectory, type DirectoryPlace } from './directory/directoryData.js'
import { saveThing, type SavedThing } from './savesData.js'
import type { AccountView } from './session.js'
import './styles/weekend.css'

function saturday(): string {
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Chicago', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())
  const date = new Date(`${today}T12:00:00Z`)
  date.setUTCDate(date.getUTCDate() + (6 - date.getUTCDay() + 7) % 7)
  return date.toISOString().slice(0, 10)
}

export function Weekend(props: {
  account: AccountView | null; saved: SavedThing[]; onSavedChange(saves: SavedThing[]): void
  onBack(): void; onAccount(): void; onEvent(id: string): void; onPlace(id: string): void
}) {
  const [draft] = useState(() => {
    try { return JSON.parse(sessionStorage.getItem('townsquare-day-out') ?? '{}') as Record<string, string> }
    catch { return {} as Record<string, string> }
  })
  const [day, setDay] = useState(() => draft['day'] || saturday())
  const [calendar, setCalendar] = useState<DayPayload | null>(null)
  const [places, setPlaces] = useState<DirectoryPlace[]>([])
  const [eventId, setEventId] = useState(draft['eventId'] ?? '')
  const [coffeeId, setCoffeeId] = useState(draft['coffeeId'] ?? '')
  const [foodId, setFoodId] = useState(draft['foodId'] ?? '')
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [saving, setSaving] = useState(false)
  useEffect(() => { try { sessionStorage.setItem('townsquare-day-out', JSON.stringify({ day, eventId, coffeeId, foodId })) } catch { /* Browser storage is optional. */ } }, [day, eventId, coffeeId, foodId])
  useEffect(() => { void fetchDirectory().then((data) => setPlaces(data.places), () => setError('Places could not be loaded. Please try again.')) }, [])
  useEffect(() => {
    let current = true
    setCalendar(null); setError(''); setMessage('')
    void fetchDay(day).then((data) => { if (current) setCalendar(data) }, () => { if (current) setError('The calendar could not be loaded. Please try another date.') })
    return () => { current = false }
  }, [day])
  const coffee = useMemo(() => places.filter((place) => /coffee|bakery|cafe/i.test(place.category + ' ' + place.name)).sort((a,b) => a.name.localeCompare(b.name)), [places])
  const food = useMemo(() => places.filter((place) => place.group === 'eat' && !/coffee|bakery/i.test(place.category)).sort((a,b) => a.name.localeCompare(b.name)), [places])
  const events: EventRow[] = calendar?.segments.flatMap((segment) => segment.kind === 'rows' ? segment.rows : []) ?? []
  const chosenEvent = events.find((event) => event.id === eventId)
  const chosenCoffee = coffee.find((place) => place.id === coffeeId)
  const chosenFood = food.find((place) => place.id === foodId)
  const count = [chosenEvent, chosenCoffee, chosenFood].filter(Boolean).length

  async function savePlan() {
    if (!props.account) { props.onAccount(); return }
    setSaving(true); setMessage(''); setError('')
    const next = [...props.saved]
    try {
      const stops = [
        ...(chosenCoffee ? [{ kind: 'business' as const, refId: chosenCoffee.id, title: chosenCoffee.name, detail: `Day out · ${day}`, url: chosenCoffee.url ?? undefined }] : []),
        ...(chosenEvent ? [{ kind: 'event' as const, refId: chosenEvent.id, title: chosenEvent.title, detail: `${day} · ${chosenEvent.timeLabel} ${chosenEvent.meridiem}`, url: chosenEvent.url ?? undefined }] : []),
        ...(chosenFood ? [{ kind: 'business' as const, refId: chosenFood.id, title: chosenFood.name, detail: `Day out · ${day}`, url: chosenFood.url ?? undefined }] : []),
      ]
      for (const stop of stops) {
        if (next.some((saved) => saved.kind === stop.kind && saved.refId === stop.refId)) continue
        const saved = await saveThing(stop)
        if (!saved) throw new Error('Some stops could not be saved. Saved stops remain in your list; try again for the rest.')
        next.unshift(saved)
      }
      setMessage('Your stops are saved. Find them in Saved whenever you are ready.')
    } catch (problem) { setError(problem instanceof Error ? problem.message : 'Saving failed. Please try again.') }
    finally { props.onSavedChange(next); setSaving(false) }
  }

  const dateLabel = new Date(`${day}T12:00:00Z`).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', timeZone: 'UTC' })
  return <main className="dayout">
    <Button variant="quiet" icon="arrow-left" onClick={props.onBack}>Back to Today</Button>
    <header className="dayout-hero">
      <span className="dayout-kicker"><Icon name="sun" size={22} /> A little closer to home</span>
      <h1>Make a day of it.</h1>
      <p>A coffee, something happening, a table worth gathering around. Put together your own River Valley day.</p>
      <label className="dayout-date">Your day <input type="date" value={day} onChange={(event) => { if (event.target.value) setDay(event.target.value) }} /></label>
    </header>
    <div className="dayout-layout">
      <div className="dayout-choices">
        <section><span className="dayout-step">01</span><h2>Ease into the day</h2><p>Pick a local coffee shop or bakery.</p>
          <label className="sr-only" htmlFor="coffee-stop">Coffee or bakery</label>
          <select id="coffee-stop" value={coffeeId} onChange={(event) => { setCoffeeId(event.target.value); setMessage('') }}><option value="">Choose your first stop</option>{coffee.map((place) => <option key={place.id} value={place.id}>{place.name}</option>)}</select>
          {chosenCoffee && <PlaceStop place={chosenCoffee} onOpen={props.onPlace} />}
        </section>
        <section><span className="dayout-step">02</span><h2>Be part of something</h2><p>Published events for {dateLabel}.</p>
          {!calendar && !error && <p role="status">Checking the local calendars…</p>}
          {calendar && !events.length && <p className="dayout-empty">No published events for this date yet. Choose another day, or make it a day to explore local places.</p>}
          <div className="dayout-events">{events.map((event) => <button key={event.id} className="dayout-event" aria-pressed={eventId === event.id} onClick={() => { setEventId(event.id); setMessage('') }}>
            <span>{event.allDay ? 'All day' : `${event.timeLabel} ${event.meridiem}`}</span><strong>{event.title}</strong><small>{event.location} · {event.sourceName}</small><Icon name={eventId === event.id ? 'check' : 'plus'} size={20} />
          </button>)}</div>
          {chosenEvent && <Button variant="quiet" icon="arrow-right" onClick={() => props.onEvent(chosenEvent.id)}>Read event details</Button>}
        </section>
        <section><span className="dayout-step">03</span><h2>Pull up a chair</h2><p>Finish with something local.</p>
          <label className="sr-only" htmlFor="food-stop">Restaurant</label>
          <select id="food-stop" value={foodId} onChange={(event) => { setFoodId(event.target.value); setMessage('') }}><option value="">Choose somewhere to eat</option>{food.map((place) => <option key={place.id} value={place.id}>{place.name}</option>)}</select>
          {chosenFood && <PlaceStop place={chosenFood} onOpen={props.onPlace} />}
        </section>
      </div>
      <aside className="dayout-summary"><Icon name="map" size={32} /><h2>Your {new Date(`${day}T12:00:00Z`).toLocaleDateString('en-US', {weekday:'long', timeZone:'UTC'})}</h2><p>{dateLabel}</p>
        {count ? <ol>{chosenCoffee && <li>{chosenCoffee.name}</li>}{chosenEvent && <li>{chosenEvent.title}<small>{chosenEvent.timeLabel} {chosenEvent.meridiem}</small></li>}{chosenFood && <li>{chosenFood.name}</li>}</ol> : <p>Start with a place or an event. There is no wrong order.</p>}
        <Button full variant="primary" icon="bookmark" disabled={!count} loading={saving} onClick={() => void savePlan()}>{props.account ? 'Save my stops' : 'Sign in to save stops'}</Button>
        {message && <p role="status" className="dayout-success">{message}</p>}
        <p className="dayout-note">A collection of ideas, not a booking. Check current hours and event details before heading out. Stops save individually.</p>
      </aside>
    </div>
    {error && <p role="alert" className="problem">{error}</p>}
  </main>
}

function PlaceStop({ place, onOpen }: { place: DirectoryPlace; onOpen(id: string): void }) {
  return <div className="dayout-place"><Icon name="storefront" size={24} /><div><strong>{place.name}</strong><p>{place.address ?? place.category}</p></div><Button variant="quiet" onClick={() => onOpen(place.id)}>Details</Button></div>
}
