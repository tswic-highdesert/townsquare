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

import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AppBar } from '../AppBar.js'
import { Icon } from '../Icon.js'
import {
  Button,
  EmptyState,
  ErrorState,
  IconButton,
  RowIcon,
  RowItem,
  RowList,
  SegmentedControl,
  Skeleton,
} from '../ui/index.js'
import type { AccountView } from '../session.js'
import { getLocale, msg, t, tn } from '../i18n/index.js'
import {
  fetchDay,
  fetchMonth,
  type DayGap,
  type DayPayload,
  type DaySegment,
  type EventRow,
  type MonthCell,
  type MonthPayload,
  type WeekCell,
} from './eventsData.js'
import {
  capitalize,
  dayCount,
  dayText,
  longDay,
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
  msg('Nothing'), msg('One'), msg('Two'), msg('Three'), msg('Four'), msg('Five'), msg('Six'),
  msg('Seven'), msg('Eight'), msg('Nine'), msg('Ten'), msg('Eleven'), msg('Twelve'),
  msg('Thirteen'), msg('Fourteen'), msg('Fifteen'),
] as const

/** Small counts read as words; the rest as digits. A sentence, not a metric. */
function countWord(n: number): string {
  const word = WORDS[n]
  return word ? t(word) : String(n)
}

/**
 * The day payload's date labels in the reader's language. The API writes them
 * in English, so English shows them as sent and Spanish builds the same labels
 * from the same day.
 */
function dayLabels(payload: DayPayload) {
  if (getLocale() === 'en') {
    return {
      eyebrow: payload.eyebrow,
      headline: payload.headline,
      dayName: payload.dayName,
      date: payload.eyebrow.replace(`${payload.dayName} `, ''),
      next: payload.next?.label ?? '',
    }
  }
  const town = payload.town.name
  const weekday = dayText(payload.day, { weekday: 'long' })
  const next = payload.next ? longDay(payload.next.day) : ''
  return {
    eyebrow: capitalize(longDay(payload.day)),
    headline: payload.isToday
      ? t('Today in {town}', { town })
      : t('{weekday} in {town}', { weekday: capitalize(weekday), town }),
    dayName: weekday,
    date: dayText(payload.day, { day: 'numeric', month: 'long' }),
    next: payload.isToday ? t('Tomorrow, {date}', { date: next }) : capitalize(next),
  }
}

/** A week strip cell's short name and spoken label, as `dayLabels` does for the day. */
function weekCellText(cell: WeekCell): { name: string; label: string } {
  if (getLocale() === 'en') return { name: cell.name, label: cell.label }
  return {
    name: dayText(cell.day, { weekday: 'short' }),
    label: [capitalize(longDay(cell.day)), cell.isToday ? t('today') : null, dayCount(cell.count)]
      .filter(Boolean)
      .join(', '),
  }
}

/** The sentence under a quiet stretch, naming the clock time things resume. */
function gapLine(gap: DayGap, after: DaySegment | undefined, timezone: string): string {
  const resumes = after?.kind === 'rows' ? after.rows[0] : undefined
  if (getLocale() === 'en' || !resumes) return gap.line
  return t('A quiet stretch, then it picks back up at {time}.', {
    time: townClock(Date.parse(resumes.startsAt), timezone),
  })
}

/** `1 hr 30 min`, `45 min`, `2 hr`. */
function gapLength(gap: DayGap): string {
  if (getLocale() === 'en') return gap.lengthLabel
  const hours = Math.floor(gap.minutes / 60)
  const minutes = gap.minutes % 60
  if (hours === 0) return t('{minutes} min', { minutes })
  if (minutes === 0) return t('{hours} hr', { hours })
  return t('{hours} hr {minutes} min', { hours, minutes })
}

/** `to 5:30`. The clock digits read the same in both languages. */
function endText(label: string): string {
  return getLocale() === 'en' ? label : t('to {time}', { time: label.replace(/^to /, '') })
}

/** The busiest day this week, said for a quiet day. */
function busiestLine(busiest: WeekCell, selected: string): string {
  if (busiest.name !== 'Sat' && busiest.day === selected) {
    return tn(busiest.count, 'There are {count} things on today.', 'There are {count} things on today.')
  }
  const day =
    getLocale() !== 'en'
      ? dayText(busiest.day, { weekday: 'long' })
      : busiest.name === 'Sat'
        ? 'Saturday'
        : busiest.name
  return tn(busiest.count, 'There are {count} things on {day}.', 'There are {count} things on {day}.', { day })
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
  onDayChange?: (day: string) => void
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
      <main id="ts-main" tabIndex={-1}>
        <div className="ev-top">
          <button className="ev-back" onClick={props.onBack}>
            <Icon name="chevron-left" size={16} /> {t('Today')}
          </button>
          <SegmentedControl
            label={t('How to see the calendar')}
            value={view}
            onChange={setView}
            options={[
              { value: 'day', label: t('Day') },
              { value: 'month', label: t('Month') },
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
            heading
            line={t('The calendar could not be loaded.')}
            sub={t('Nothing is wrong with your connection as far as we can tell, so this is probably us.')}
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
              props.onDayChange?.(picked)
            }}
            onOpenEvent={props.onOpenEvent}
          />
        ) : payload ? (
          <DayView
            payload={payload}
            onPickDay={(picked) => { load(picked); props.onDayChange?.(picked) }}
            onOpenEvent={props.onOpenEvent}
            onSeeMonth={() => setView('month')}
          />
        ) : (
          <DaySkeleton />
        )}
      </main>
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
  const labels = dayLabels(payload)

  return (
    <div className="ev-screen">
      <header className="ev-head">
        <div className="ev-eyebrow">{labels.eyebrow}</div>
        <h1 className="ev-h1">{labels.headline}</h1>
        <p className="ev-sub">
          {payload.total === 0
            ? t('Nothing on the calendar.')
            : tn(payload.total, '{word} thing on.', '{word} things on.', { word: countWord(payload.total) })}
          {earlier.length > 0 &&
            ` ${tn(earlier.length, '{word} has already finished.', '{word} have already finished.', { word: countWord(earlier.length) })}`}
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
          {showEarlier
            ? tn(earlier.length, 'Hide {count} earlier today', 'Hide {count} earlier today')
            : tn(earlier.length, 'Show {count} earlier today', 'Show {count} earlier today')}
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
              {labels.next}
              <Icon name="chevron-right" size={14} />
            </button>
          </div>
          <RowList className="ev-agenda ev-agenda--next">
            {payload.next.rows.map((row) => (
              <AgendaRow key={row.id} row={row} now={now} onOpen={props.onOpenEvent} />
            ))}
          </RowList>
        </>
      )}

      <p className="ev-tail">
        <button onClick={props.onSeeMonth}>{t('See the whole month')}</button>
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
            <p>{gapLine(segment, payload.segments[i + 1], tz)}</p>
            <span className="ev-gap-len">{gapLength(segment)}</span>
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
    <RowList className="ev-agenda">
      {visible.map((row, i) => (
        <Fragment key={row.id}>
          {/*
            The now line is a list item in document order, never an overlay, so
            it is announced in reading order and can never land on top of a
            title. It sits between two `RowItem`s rather than inside one.
          */}
          {line !== null && line === i + from && (
            <li className="ev-nowline">
              <span className="ev-nowline-label">{t('now, {time}', { time: townClock(now, props.timezone) })}</span>
            </li>
          )}
          <AgendaRow row={row} now={now} onOpen={props.onOpen} />
        </Fragment>
      ))}
    </RowList>
  )
}

/**
 * One agenda row, in every shape a scraped event actually arrives in.
 *
 * Built on `RowItem` rather than on its own markup: the 44px floor, the inset
 * divider, the hover, the focus ring and the density variables all come from
 * the primitive, and six people each rolling their own row is the specific way
 * a design system stops being one.
 *
 * Two blocks share the leading slot, the clock and the category tile, which is
 * one more than `Row` draws by default. `--ts-row-lead` is a documented
 * container override and the divider inset reads it, so widening it here is
 * the mechanism working rather than a way around it. See `events.css`.
 *
 * The clock stays on the left and stays a clock. The time column being fixed
 * width is the whole argument for this row: titles start on the same vertical
 * line whatever the source published — a clock with a meridiem, a clock with
 * an end, a clock with nothing after it, and an all-day marker that is not a
 * time at all. That last one is why the column has to be a column, because
 * rendering a midnight start as "12:00 AM" claims something happens at
 * midnight. `RowDate` is the date-flavoured sibling of this block and inverts
 * the emphasis (small label over large number), which is right for `Mon 10`
 * and wrong for `5:30 pm`.
 */
function AgendaRow(props: { row: EventRow; now: number; onOpen: (id: string) => void }) {
  const { row, now } = props
  const state = rowState(row, now)
  const chip = relativeLabel(row, now)
  const started = startedLabel(row, now)

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
                {t('all')}
                <br />
                {t('day')}
              </span>
            ) : (
              <>
                <span className="ev-clock">{row.timeLabel}</span>
                <span className="ev-meridiem">{row.meridiem}</span>
                {row.endLabel ? (
                  <span className="ev-end">{endText(row.endLabel)}</span>
                ) : (
                  /* No end time published, which is 40% of the feed. A short
                     rule running off the bottom of the clock says "this keeps
                     going" without inventing an hour. */
                  <span className="ev-open" title={t('No end time published')} aria-hidden="true" />
                )}
              </>
            )}
          </span>
          <RowIcon name={CATEGORY_ICON[row.category]} className={`ev-tile ev-tile--${row.category}`} />
        </>
      }
      title={row.title}
      meta={started ? `${row.detail}, ${started}` : row.detail}
      /* The chip is a status, which is what `trailing` is for. Inline after the
         title it reflowed the headline every time the countdown ticked. */
      trailing={chip ? <span className={`ev-chip ev-chip--${state}`}>{chip}</span> : undefined}
    />
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
    <div className="ev-week" role="tablist" aria-label={t('Pick a day')}>
      {cells.map((cell, i) => (
        <button
          key={cell.day}
          ref={(el) => {
            refs.current[i] = el
          }}
          className="ev-day"
          role="tab"
          aria-selected={cell.isSelected}
          aria-label={weekCellText(cell).label}
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
          <span className="ev-day-name">{weekCellText(cell).name}</span>
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
      line={t('Nothing on for {day}', { day: dayLabels(props.payload).dayName })}
      sub={
        busiest && busiest.count > 0
          ? `${t('Nobody scheduled anything and nothing is broken.')} ${busiestLine(busiest, props.payload.day)}`
          : t('Nobody scheduled anything and nothing is broken.')
      }
      action={{ label: t('See the whole month'), onAct: props.onSeeMonth }}
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
      {/* The skeleton is the agenda row's own geometry, read off the same
          primitive, so nothing reflows when the data lands. */}
      <RowList className="ev-agenda">
        {['76%', '62%', '84%'].map((width) => (
          <RowItem
            key={width}
            lead={
              <>
                <span className="ev-time">
                  <Skeleton width="30px" height={14} />
                </span>
                <Skeleton shape="block" width="34px" height={34} />
              </>
            }
            title={<Skeleton width={width} />}
            meta={<Skeleton width="48%" height={11} />}
          />
        ))}
      </RowList>
    </div>
  )
}

/* ────────────────────────────────────────────────────────── the month ──── */

/** The grid head, Sunday first. 1 March 2026 was a Sunday. */
function weekdays(): string[] {
  return Array.from({ length: 7 }, (_, i) => dayText(`2026-03-0${1 + i}`, { weekday: 'short' }))
}

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
  // Bumped by "Try now". Setting the month to itself is not a change, so it
  // cannot be what asks for the month again.
  const [attempt, setAttempt] = useState(0)
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
  }, [month, attempt])

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
        line={t('The month could not be loaded.')}
        onRetry={() => setAttempt((n) => n + 1)}
      />
    )
  }
  if (!payload) return <div className="ev-month-loading" aria-busy="true"><Skeleton shape="block" height={420} /></div>

  const monthLabel =
    getLocale() === 'en'
      ? payload.label
      : capitalize(dayText(`${payload.month}-15`, { month: 'long', year: 'numeric' }))

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
            label={t('Previous month')}
            disabled={!payload.prevMonth}
            onClick={() => payload.prevMonth && setMonth(payload.prevMonth)}
          />
          <h2>{monthLabel}</h2>
          <IconButton
            variant="quiet"
            name="chevron-right"
            label={t('Next month')}
            disabled={!payload.nextMonth}
            onClick={() => payload.nextMonth && setMonth(payload.nextMonth)}
          />
          <span className="ev-month-count">
            {tn(payload.total, '{count} event', '{count} events')}
          </span>
        </div>

        <div className="ev-month-dow" aria-hidden="true">
          {weekdays().map((d) => (
            <span key={d}>{d}</span>
          ))}
        </div>

        <div
          className="ev-month-grid"
          role="grid"
          aria-label={monthLabel}
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
      aria-label={getLocale() === 'en' ? cell.label : `${capitalize(longDay(cell.day))}, ${dayCount(cell.count)}`}
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
        <span className="ev-mnone">{t('nothing on')}</span>
      ) : (
        <>
          {cell.chips.map((chip) => (
            <span className="ev-mchip" data-category={chip.category} key={chip.id}>
              {chip.title}
            </span>
          ))}
          {cell.more > 0 && <span className="ev-mmore">{t('+{count} more', { count: cell.more })}</span>}
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
  const labels = payload ? dayLabels(payload) : null

  return (
    <aside className="ev-daypanel" aria-label={labels?.eyebrow ?? t('The day')}>
      {payload && labels ? (
        <>
          <div className="ev-eyebrow">{capitalize(labels.dayName)}</div>
          <h3 className="ev-daypanel-date">{labels.date}</h3>
          <p className="ev-daypanel-sub">
            {payload.total === 0
              ? t('Nothing on.')
              : tn(payload.total, '{word} thing on.', '{word} things on.', { word: countWord(payload.total) })}
          </p>
          {/* Compact, because it sits beside the grid rather than owning the
              screen. Four variables change; the tap target still floors at
              44px. */}
          <RowList className="ev-agenda" density="compact" framed={false}>
            {rows.slice(0, 4).map((row) => (
              <AgendaRow key={row.id} row={row} now={now} onOpen={props.onOpenEvent} />
            ))}
          </RowList>
          {payload.total > 4 && (
            <Button variant="quiet" onClick={() => props.onSeeDay(props.day)}>
              {t('See all {count}', { count: payload.total })}
            </Button>
          )}
        </>
      ) : (
        <Skeleton shape="block" height={200} />
      )}
    </aside>
  )
}
