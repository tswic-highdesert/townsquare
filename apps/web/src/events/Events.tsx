/**
 * The calendar. `design/hifi-v2` section 04.
 *
 * Two views of one question. The day agenda answers "what is on", and it is the
 * default because that is the question a phone is holding; the month grid
 * answers "when is the thing", and it is a desktop shape because a cell with
 * three readable titles in it needs the width.
 *
 * Everything relative to this minute is computed here on a ticking clock and
 * nothing about it comes from the server. See `relative.ts` for the argument:
 * the payload is cached for a minute and a screen stays open for an hour.
 *
 * ## What section 04 draws that this does not
 *
 * Listed rather than mocked, which is the rule the whole codebase runs on.
 *
 * - **Cancelled, and the moved notice.** No scraper produces a cancellation or
 *   a venue change; zero of 343 events carry either. The designer's argument
 *   for withdrawal over alarm is the right one and there is nothing to apply it
 *   to, so drawing it would mean inventing a cancelled market.
 * - **Cost, recurrence, the organiser, RSVP counts and reminders.** `cost`,
 *   `recurrence`, `contactEmail` and `contactPhone` are on `EventItem` and set
 *   by nothing. RSVP and reminders have no store and no delivery.
 * - **Photographs on event cards.** `EventItem` has no image field at all, so
 *   the "no photograph" variant is not the fallback here, it is the only card.
 * - **The written weekend lede.** It is the one element on the hi-fi a person
 *   writes, and nobody writes it yet.
 * - **The fifth, uncategorised state.** `categorize` in `today.ts` returns four
 *   buckets with `community` as the honest default and never returns "none", so
 *   there is nothing to draw the ring for. Changing that means changing Today.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AppBar } from '../AppBar.js'
import { Icon } from '../Icon.js'
import { Button, EmptyState, ErrorState, IconButton, SegmentedControl, Skeleton } from '../ui/index.js'
import type { AccountView } from '../session.js'
import {
  fetchDay,
  fetchMonth,
  type DayPayload,
  type EventRow,
  type MonthCell,
  type MonthPayload,
} from './eventsData.js'
import {
  nowLineIndex,
  relativeLabel,
  rowState,
  splitEarlier,
  startedLabel,
  townClock,
} from './relative.js'
import { CATEGORY_ICON } from './categories.js'
import './events.css'

const WORDS = [
  'Nothing', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight',
  'Nine', 'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen',
] as const

/** Small counts read as words; the rest as digits. A sentence, not a metric. */
function countWord(n: number): string {
  return WORDS[n] ?? String(n)
}

/**
 * The current minute, re-read on a timer.
 *
 * Thirty seconds, because the smallest thing this drives is a countdown in
 * whole minutes and the largest is the now line moving down one row. Slower
 * than that and "in 1 min" sits on the screen after the thing has started.
 */
function useNow(): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30_000)
    return () => clearInterval(id)
  }, [])
  return now
}

export interface EventsScreenProps {
  account: AccountView | null
  canReview: boolean
  /** The day to open on, `YYYY-MM-DD`. Defaults to the town's today. */
  day?: string
  view?: 'day' | 'month'
  onOpenEvent: (id: string) => void
  onBack: () => void
  onAccount: () => void
  onReview: () => void
}

export function EventsScreen(props: EventsScreenProps) {
  const [view, setView] = useState<'day' | 'month'>(props.view ?? 'day')
  const [day, setDay] = useState<string | undefined>(props.day)
  const [payload, setPayload] = useState<DayPayload | null>(null)
  const [failed, setFailed] = useState(false)

  const load = useCallback((which: string | undefined) => {
    setFailed(false)
    void fetchDay(which).then(
      (next) => {
        setPayload(next)
        setDay(next.day)
      },
      () => setFailed(true),
    )
  }, [])

  useEffect(() => {
    load(props.day)
  }, [load, props.day])

  const town = payload?.town.name ?? 'Town Square'

  return (
    <div className="ev">
      <AppBar
        label="Town Square"
        place={town}
        account={props.account}
        canReview={props.canReview}
        onAccount={props.onAccount}
        onReview={props.onReview}
      />

      <div className="ev-top">
        <button className="ev-back" onClick={props.onBack}>
          <Icon name="chevron-left" size={16} /> Today
        </button>
        <SegmentedControl
          label="How to see the calendar"
          value={view}
          onChange={setView}
          options={[
            { value: 'day', label: 'Day' },
            { value: 'month', label: 'Month' },
          ]}
        />
      </div>

      {/*
        Each view owns its own failure. A day that could not load must not blank
        the month, because the month is a working answer to the same question
        and taking it away turns one broken request into a broken screen.
      */}
      {view === 'day' && failed ? (
        <ErrorState
          scope="screen"
          line="The calendar could not be loaded."
          sub="Nothing is wrong with your connection as far as we can tell, so this is probably us."
          onRetry={() => load(day)}
        />
      ) : view === 'month' ? (
        <MonthView
          month={day?.slice(0, 7)}
          selected={day}
          onPickDay={(picked) => {
            setDay(picked)
            load(picked)
            setView('day')
          }}
          onOpenEvent={props.onOpenEvent}
        />
      ) : payload ? (
        <DayView
          payload={payload}
          onPickDay={(picked) => load(picked)}
          onOpenEvent={props.onOpenEvent}
          onSeeMonth={() => setView('month')}
        />
      ) : (
        <DaySkeleton />
      )}
    </div>
  )
}

/* ──────────────────────────────────────────────────────────── the day ──── */

function DayView(props: {
  payload: DayPayload
  onPickDay: (day: string) => void
  onOpenEvent: (id: string) => void
  onSeeMonth: () => void
}) {
  const { payload } = props
  const now = useNow()
  const [showEarlier, setShowEarlier] = useState(false)

  // Only today has an "earlier". On any other day nothing has happened yet or
  // all of it has, and collapsing a whole past Tuesday behind a button would
  // hide the entire screen.
  const rows = payload.segments.flatMap((s) => (s.kind === 'rows' ? s.rows : []))
  const { earlier } = payload.isToday ? splitEarlier(rows, now) : { earlier: [] }

  return (
    <div className="ev-screen">
      <header className="ev-head">
        <div className="ev-eyebrow">{payload.eyebrow}</div>
        <h1 className="ev-h1">{payload.headline}</h1>
        <p className="ev-sub">
          {payload.total === 0
            ? 'Nothing on the calendar.'
            : `${countWord(payload.total)} ${payload.total === 1 ? 'thing' : 'things'} on.`}
          {earlier.length > 0 && ` ${countWord(earlier.length)} ${earlier.length === 1 ? 'has' : 'have'} already finished.`}
        </p>
      </header>

      <WeekStrip payload={payload} onPick={props.onPickDay} />

      {earlier.length > 0 && (
        <button
          className="ev-earlier"
          aria-expanded={showEarlier}
          onClick={() => setShowEarlier((open) => !open)}
        >
          <Icon name={showEarlier ? 'chevron-up' : 'chevron-down'} size={16} />
          {showEarlier ? 'Hide' : 'Show'} {earlier.length} earlier today
        </button>
      )}

      {payload.total === 0 ? (
        <QuietDay payload={payload} onSeeMonth={props.onSeeMonth} />
      ) : (
        <Segments
          payload={payload}
          now={now}
          hideEarlier={!showEarlier && payload.isToday}
          onOpenEvent={props.onOpenEvent}
        />
      )}

      {payload.next && (
        <>
          <div className="ev-dayline">
            <button onClick={() => props.onPickDay(payload.next?.day ?? '')}>
              {payload.next.label}
              <Icon name="chevron-right" size={14} />
            </button>
          </div>
          <ul className="ev-list ev-list--next">
            {payload.next.rows.map((row) => (
              <li key={row.id}>
                <Row row={row} now={now} onOpen={props.onOpenEvent} />
              </li>
            ))}
          </ul>
        </>
      )}

      <p className="ev-tail">
        <button onClick={props.onSeeMonth}>See the whole month</button>
      </p>
    </div>
  )
}

/**
 * The rows, the written gaps, and the now line between them.
 *
 * The now line is a list item in document order rather than an overlay, so it
 * is announced in reading order and can never land on top of a title. It
 * carries a real clock time, because "now" on a screen someone left open for an
 * hour is a lie.
 */
function Segments(props: {
  payload: DayPayload
  now: number
  hideEarlier: boolean
  onOpenEvent: (id: string) => void
}) {
  const { payload, now } = props
  const tz = payload.town.timezone

  return (
    <>
      {payload.segments.map((segment, i) =>
        segment.kind === 'gap' ? (
          <div className="ev-gap" key={`gap-${i}`}>
            <p>{segment.line}</p>
            <span className="ev-gap-len">{segment.lengthLabel}</span>
          </div>
        ) : (
          <SegmentRows
            key={`rows-${i}`}
            rows={segment.rows}
            now={now}
            timezone={tz}
            showNowLine={payload.isToday}
            hideEarlier={props.hideEarlier}
            onOpen={props.onOpenEvent}
          />
        ),
      )}
    </>
  )
}

function SegmentRows(props: {
  rows: EventRow[]
  now: number
  timezone: string
  showNowLine: boolean
  hideEarlier: boolean
  onOpen: (id: string) => void
}) {
  const { rows, now } = props
  const line = props.showNowLine ? nowLineIndex(rows, now) : null
  const { earlier } = props.showNowLine ? splitEarlier(rows, now) : { earlier: [] }
  const from = props.hideEarlier ? earlier.length : 0
  const visible = rows.slice(from)

  if (visible.length === 0) return null

  return (
    <ul className="ev-list">
      {visible.map((row, i) => (
        <li key={row.id}>
          {line !== null && line === i + from && (
            <div className="ev-nowline" role="separator">
              <span className="ev-nowline-label">now, {townClock(now, props.timezone)}</span>
            </div>
          )}
          <Row row={row} now={now} onOpen={props.onOpen} />
        </li>
      ))}
    </ul>
  )
}

/**
 * One agenda row, in every shape a scraped event actually arrives in.
 *
 * The time column is fixed width so titles start on the same vertical line
 * whatever the source published: a clock with a meridiem, a clock with an end,
 * a clock with nothing after it, and an all-day marker that is not a time at
 * all. That last one is the whole reason the column is a column: rendering a
 * midnight start as "12:00 AM" claims something happens at midnight.
 */
function Row(props: { row: EventRow; now: number; onOpen: (id: string) => void }) {
  const { row, now } = props
  const state = rowState(row, now)
  const chip = relativeLabel(row, now)
  const started = startedLabel(row, now)

  return (
    <button
      className="ev-row"
      data-state={state}
      onClick={() => props.onOpen(row.id)}
      aria-label={`${row.title}, ${row.allDay ? 'all day' : `${row.timeLabel} ${row.meridiem}`}`}
    >
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
            {row.endLabel ? (
              <span className="ev-end">{row.endLabel}</span>
            ) : (
              /* No end time published, which is 40% of the feed. A short rule
                 running off the bottom of the clock says "this keeps going"
                 without inventing an hour. */
              <span className="ev-open" title="No end time published" aria-hidden="true" />
            )}
          </>
        )}
      </span>

      <span className="ev-icon" data-category={row.category}>
        <Icon name={CATEGORY_ICON[row.category]} size={16} />
      </span>

      <span className="ev-text">
        <span className="ev-title">
          {row.title}
          {chip && <span className={`ev-chip ev-chip--${state}`}>{chip}</span>}
        </span>
        <span className="ev-detail">
          {started ? `${row.detail}, ${started}` : row.detail}
        </span>
      </span>
    </button>
  )
}

/**
 * The week strip: density as dots, because a number in a 44px cell is a number
 * nobody reads.
 *
 * Every cell carries an `aria-label` with the real count, because dots are a
 * glance affordance and not an accessible one. A day with nothing on gets an en
 * dash rather than an empty space: empty space reads as "not loaded yet".
 */
function WeekStrip(props: { payload: DayPayload; onPick: (day: string) => void }) {
  const cells = props.payload.week
  const refs = useRef<Array<HTMLButtonElement | null>>([])

  const move = (from: number, delta: number) => {
    const to = Math.min(cells.length - 1, Math.max(0, from + delta))
    refs.current[to]?.focus()
  }

  return (
    <div className="ev-week" role="tablist" aria-label="Pick a day">
      {cells.map((cell, i) => (
        <button
          key={cell.day}
          ref={(el) => {
            refs.current[i] = el
          }}
          className="ev-day"
          role="tab"
          aria-selected={cell.isSelected}
          aria-label={cell.label}
          // A roving tabindex: one stop for the whole strip, then arrow keys.
          // Seven tab stops to cross a week is seven too many.
          tabIndex={cell.isSelected ? 0 : -1}
          data-today={cell.isToday || undefined}
          data-past={cell.isPast || undefined}
          data-empty={cell.count === 0 || undefined}
          onClick={() => props.onPick(cell.day)}
          onKeyDown={(e) => {
            if (e.key === 'ArrowRight') move(i, 1)
            else if (e.key === 'ArrowLeft') move(i, -1)
            else if (e.key === 'Home') move(i, -i)
            else if (e.key === 'End') move(i, cells.length - 1 - i)
            else return
            e.preventDefault()
          }}
        >
          <span className="ev-day-name">{cell.name}</span>
          <span className="ev-day-num">{cell.num}</span>
          <span className="ev-dots" aria-hidden="true">
            {cell.count === 0 ? (
              <em>–</em>
            ) : (
              <>
                {Array.from({ length: Math.min(3, cell.count) }, (_, d) => (
                  <i key={d} />
                ))}
                {/* The bar means four or more. Past three, the exact number
                    stops changing what a resident does about it. */}
                {cell.count > 3 && <b />}
              </>
            )}
          </span>
        </button>
      ))}
    </div>
  )
}

/**
 * A quiet day, said out loud.
 *
 * A quiet day and a broken feed must never look the same, which is the entire
 * reason this has words in it. It names something else that is on, so the
 * screen still answers the question that was asked.
 */
function QuietDay(props: { payload: DayPayload; onSeeMonth: () => void }) {
  const busiest = [...props.payload.week].sort((a, b) => b.count - a.count)[0]
  return (
    <EmptyState
      mark="calendar"
      line={`Nothing on for ${props.payload.dayName}`}
      sub={
        busiest && busiest.count > 0
          ? `Nobody scheduled anything and nothing is broken. There are ${busiest.count} things on ${busiest.name === 'Sat' ? 'Saturday' : busiest.day === props.payload.day ? 'today' : busiest.name}.`
          : 'Nobody scheduled anything and nothing is broken.'
      }
      action={{ label: 'See the whole month', onAct: props.onSeeMonth }}
    />
  )
}

/**
 * The skeleton is the agenda row's own geometry: the same time gutter, the same
 * 34px tile, the same two lines. Nothing reflows when the data lands.
 */
function DaySkeleton() {
  return (
    <div className="ev-screen" aria-busy="true">
      <div className="ev-head">
        <Skeleton width="40%" />
        <Skeleton width="70%" height={28} />
      </div>
      <ul className="ev-list" aria-hidden="true">
        {['76%', '62%', '84%'].map((width) => (
          <li key={width}>
            <div className="ev-row">
              <span className="ev-time">
                <Skeleton width="34px" height={14} />
              </span>
              <Skeleton shape="block" width="34px" height={34} />
              <span className="ev-text">
                <Skeleton width={width} />
                <Skeleton width="48%" height={11} />
              </span>
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}

/* ────────────────────────────────────────────────────────── the month ──── */

const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const

/**
 * The month grid.
 *
 * Density is the whole problem here and both of the usual answers fail: showing
 * everything turns August into a wall of 4pt text, and showing a bare count
 * turns it into a spreadsheet. So a cell shows up to three real titles, which
 * is enough to recognise the thing you half remember, and hands the rest to a
 * load bar scaled against the busiest day in the month. The bar is ink and not
 * a category colour, because it measures volume and not kind.
 *
 * Keyboard navigation is a real grid, not a list of buttons: arrows move by a
 * day and a week, Home and End take the week, PageUp and PageDown take the
 * month. A month you can only reach with 35 presses of Tab is a month a
 * keyboard user does not reach.
 */
function MonthView(props: {
  month?: string
  selected?: string
  onPickDay: (day: string) => void
  onOpenEvent: (id: string) => void
}) {
  const [month, setMonth] = useState(props.month)
  const [payload, setPayload] = useState<MonthPayload | null>(null)
  const [failed, setFailed] = useState(false)
  const [focused, setFocused] = useState<string | null>(props.selected ?? null)
  const [panelDay, setPanelDay] = useState<string | null>(props.selected ?? null)
  const gridRef = useRef<HTMLDivElement | null>(null)
  // A key press moves focus to a cell that has not rendered yet when it crosses
  // a month, so the move is recorded and applied after the grid comes back.
  const pending = useRef<string | null>(null)

  useEffect(() => {
    setFailed(false)
    void fetchMonth(month).then(
      (next) => {
        setPayload(next)
        setMonth(next.month)
        if (!panelDay) setPanelDay(next.today.startsWith(next.month) ? next.today : `${next.month}-01`)
      },
      () => setFailed(true),
    )
  }, [month])

  useEffect(() => {
    if (!pending.current || !payload) return
    const target = gridRef.current?.querySelector<HTMLElement>(`[data-day="${pending.current}"]`)
    target?.focus()
    pending.current = null
  }, [payload])

  const cells = useMemo(() => payload?.weeks.flat() ?? [], [payload])

  if (failed) {
    return (
      <ErrorState
        scope="screen"
        line="The month could not be loaded."
        onRetry={() => setMonth((m) => m)}
      />
    )
  }
  if (!payload) return <div className="ev-month-loading" aria-busy="true"><Skeleton shape="block" height={420} /></div>

  const shift = (from: string, delta: number) => {
    const next = new Date(Date.parse(`${from}T00:00:00Z`) + delta * 86_400_000)
      .toISOString()
      .slice(0, 10)
    setFocused(next)
    const onScreen = cells.some((c) => c.day === next)
    if (onScreen) {
      gridRef.current?.querySelector<HTMLElement>(`[data-day="${next}"]`)?.focus()
    } else {
      // Off the end of the grid: load the neighbouring month and land there.
      pending.current = next
      setMonth(next.slice(0, 7))
    }
  }

  return (
    <div className="ev-month-layout">
      <div className="ev-month">
        <div className="ev-month-head">
          <IconButton
            variant="quiet"
            name="chevron-left"
            label="Previous month"
            disabled={!payload.prevMonth}
            onClick={() => payload.prevMonth && setMonth(payload.prevMonth)}
          />
          <h2>{payload.label}</h2>
          <IconButton
            variant="quiet"
            name="chevron-right"
            label="Next month"
            disabled={!payload.nextMonth}
            onClick={() => payload.nextMonth && setMonth(payload.nextMonth)}
          />
          <span className="ev-month-count">
            {payload.total} {payload.total === 1 ? 'event' : 'events'}
          </span>
        </div>

        <div className="ev-month-dow" aria-hidden="true">
          {DOW.map((d) => (
            <span key={d}>{d}</span>
          ))}
        </div>

        <div
          className="ev-month-grid"
          role="grid"
          aria-label={payload.label}
          ref={gridRef}
          onKeyDown={(e) => {
            const day = focused ?? panelDay
            if (!day) return
            const by: Record<string, number> = {
              ArrowRight: 1, ArrowLeft: -1, ArrowDown: 7, ArrowUp: -7,
            }
            const delta = by[e.key]
            if (delta !== undefined) {
              shift(day, delta)
            } else if (e.key === 'Home') {
              shift(day, -new Date(`${day}T00:00:00Z`).getUTCDay())
            } else if (e.key === 'End') {
              shift(day, 6 - new Date(`${day}T00:00:00Z`).getUTCDay())
            } else if (e.key === 'PageDown' && payload.nextMonth) {
              setMonth(payload.nextMonth)
            } else if (e.key === 'PageUp' && payload.prevMonth) {
              setMonth(payload.prevMonth)
            } else {
              return
            }
            e.preventDefault()
          }}
        >
          {payload.weeks.map((week, w) => (
            <div className="ev-month-week" role="row" key={week[0]?.day ?? w}>
              {week.map((cell) => (
                <MonthDay
                  key={cell.day}
                  cell={cell}
                  selected={cell.day === panelDay}
                  // One tab stop for the whole grid, then the arrows.
                  tabIndex={cell.day === (focused ?? panelDay) ? 0 : -1}
                  onFocus={() => setFocused(cell.day)}
                  onPick={() => {
                    setPanelDay(cell.day)
                    setFocused(cell.day)
                  }}
                />
              ))}
            </div>
          ))}
        </div>
      </div>

      {panelDay && (
        <DayPanel day={panelDay} onOpenEvent={props.onOpenEvent} onSeeDay={props.onPickDay} />
      )}
    </div>
  )
}

function MonthDay(props: {
  cell: MonthCell
  selected: boolean
  tabIndex: number
  onFocus: () => void
  onPick: () => void
}) {
  const { cell } = props
  return (
    <button
      className="ev-mday"
      role="gridcell"
      data-day={cell.day}
      data-out={!cell.inMonth || undefined}
      data-today={cell.isToday || undefined}
      data-quiet={cell.count === 0 || undefined}
      aria-selected={props.selected}
      aria-label={cell.label}
      tabIndex={props.tabIndex}
      onFocus={props.onFocus}
      onClick={props.onPick}
    >
      <span className="ev-mday-num">{cell.num}</span>
      {/*
        A day outside the month shows its number and nothing else. It is there
        to keep the grid rectangular and to be somewhere to arrow into, not to
        compete with the month being read.
      */}
      {!cell.inMonth ? null : cell.count === 0 ? (
        <span className="ev-mnone">nothing on</span>
      ) : (
        <>
          {cell.chips.map((chip) => (
            <span className="ev-mchip" data-category={chip.category} key={chip.id}>
              {chip.title}
            </span>
          ))}
          {cell.more > 0 && <span className="ev-mmore">+{cell.more} more</span>}
          <span className="ev-mload" aria-hidden="true">
            <i style={{ width: `${Math.round(cell.load * 100)}%` }} />
          </span>
        </>
      )}
    </button>
  )
}

/** The day beside the grid. One fetch per day picked, cached by the API. */
function DayPanel(props: {
  day: string
  onOpenEvent: (id: string) => void
  onSeeDay: (day: string) => void
}) {
  const [payload, setPayload] = useState<DayPayload | null>(null)
  const now = useNow()

  useEffect(() => {
    setPayload(null)
    void fetchDay(props.day).then(setPayload, () => setPayload(null))
  }, [props.day])

  const rows = payload?.segments.flatMap((s) => (s.kind === 'rows' ? s.rows : [])) ?? []

  return (
    <aside className="ev-daypanel" aria-label={payload?.eyebrow ?? 'The day'}>
      {payload ? (
        <>
          <div className="ev-eyebrow">{payload.dayName}</div>
          <h3 className="ev-daypanel-date">{payload.eyebrow.replace(`${payload.dayName} `, '')}</h3>
          <p className="ev-daypanel-sub">
            {payload.total === 0
              ? 'Nothing on.'
              : `${countWord(payload.total)} ${payload.total === 1 ? 'thing' : 'things'} on.`}
          </p>
          <ul className="ev-list">
            {rows.slice(0, 4).map((row) => (
              <li key={row.id}>
                <Row row={row} now={now} onOpen={props.onOpenEvent} />
              </li>
            ))}
          </ul>
          {payload.total > 4 && (
            <Button variant="quiet" onClick={() => props.onSeeDay(props.day)}>
              See all {payload.total}
            </Button>
          )}
        </>
      ) : (
        <Skeleton shape="block" height={200} />
      )}
    </aside>
  )
}
