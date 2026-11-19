/**
 * The date field, which asks rather than decides.
 *
 * A date picker is unambiguous and slow. Natural language is fast and
 * occasionally wrong, and a wrong start time is the single most damaging error
 * this product can make: fifteen people stand in a car park at the wrong hour
 * and nobody trusts the events feed again. So this takes what somebody would
 * say out loud, sends it to the service, and **reads back what it heard in full
 * prose with the weekday spelled out** — because "14/06" and "06/14" look
 * identical to a person skimming and "Saturday 14 June" does not.
 *
 * The parse line is a question, not a result. Five states, and the one that
 * carries the argument is `ambiguous`: two readings, nothing selected.
 * Defaulting to pm would be right most of the time in a town with evening ball
 * games and wrong every Saturday morning at the market, which is exactly the
 * population that matters most.
 *
 * Nothing here parses anything. The grammar lives in the service so that the
 * MCP door and a mobile client read "sat june 14 at 7pm" the same way this does
 * — two date grammars is one date grammar that is wrong on Saturdays.
 */

import { useEffect, useRef, useState } from 'react'
import { Button, InlineError } from '../ui/index.js'
import { Icon } from '../Icon.js'
import { t } from '../i18n/index.js'
import { withBold } from './ComposerShell.js'
import { readWhen, type WhenResult } from './contributeData.js'

/**
 * One value and one setter, deliberately.
 *
 * An earlier version of this took `onText` and `onConfirm` separately, and
 * typing into the field silently did nothing: the input handler called both,
 * each closed over the same render's draft, and the second overwrote the first.
 * The words went in and were immediately replaced by a copy of the draft that
 * never had them. Two setters for two halves of one fact is the shape that bug
 * lives in, so there is one of each here now.
 */
export interface WhenValue {
  /** The words the resident typed. Kept, always, whatever happens. */
  text: string
  /** The instant they confirmed, or null while nothing is settled. */
  startsAt: number | null
}

export interface WhenFieldProps {
  value: WhenValue
  onChange: (next: WhenValue) => void
}

export function WhenField(props: WhenFieldProps) {
  const [result, setResult] = useState<WhenResult>({ kind: 'empty' })
  const [manual, setManual] = useState(false)
  const latest = useRef(0)

  // Debounced, and guarded by a sequence number: a slow answer to an earlier
  // keystroke must never overwrite the reading of a later one, which is how a
  // field like this ends up confirming a date the resident already retyped.
  useEffect(() => {
    if (manual) return
    const seq = ++latest.current
    const timer = setTimeout(() => {
      void readWhen(props.value.text).then((next) => {
        if (seq === latest.current) setResult(next)
      })
    }, 250)
    return () => clearTimeout(timer)
  }, [props.value.text, manual])

  return (
    <div className="cn-field">
      <label className="cn-label" htmlFor="cn-when">
        {t('When')}
      </label>
      <div className="cn-nl" data-bad={result.kind === 'unreadable' || undefined}>
        <Icon name="clock" size={16} className="cn-nl-ic" />
        <input
          id="cn-when"
          className="cn-input cn-input--nl"
          value={props.value.text}
          // The placeholder teaches the input by example. No format is
          // documented anywhere, because a documented format is a format
          // somebody has to get right.
          placeholder="Saturday morning, next Thursday at 6, June 14 7pm"
          aria-invalid={result.kind === 'unreadable' || undefined}
          aria-describedby="cn-when-read"
          onChange={(e) => {
            // One update carrying both halves. Changing the words un-confirms
            // the instant, and that has to happen in the same write.
            props.onChange({ text: e.target.value, startsAt: null })
            setManual(false)
          }}
        />
      </div>

      <div id="cn-when-read">
        {manual ? (
          <ManualEntry
            onBack={() => {
              setManual(false)
              props.onChange({ text: props.value.text, startsAt: null })
            }}
            onSet={(startsAt) => props.onChange({ text: props.value.text, startsAt })}
          />
        ) : (
          <ParseLine
            result={result}
            confirmed={props.value.startsAt}
            onConfirm={(startsAt) => props.onChange({ text: props.value.text, startsAt })}
            onManual={() => setManual(true)}
          />
        )}
      </div>
    </div>
  )
}

function ParseLine(props: {
  result: WhenResult
  confirmed: number | null
  onConfirm: (at: number) => void
  onManual: () => void
}) {
  const { result } = props

  if (result.kind === 'empty') {
    return <p className="cn-hint">{t('However you would say it out loud.')}</p>
  }

  if (result.kind === 'ok') {
    const yes = props.confirmed === result.reading.startsAt
    return (
      <div className="cn-parse" data-tone="ok" role="status">
        <Icon name="check-circle" size={16} />
        <div>
          <p className="cn-parse-read">
            {withBold(t('We read that as {reading}. Is that right?'), 'reading', result.reading.label)}
          </p>
          <div className="cn-parse-acts">
            <button
              type="button"
              className="cn-chip"
              data-on={yes || undefined}
              aria-pressed={yes}
              onClick={() => props.onConfirm(result.reading.startsAt)}
            >
              {yes ? <Icon name="check" size={16} /> : null} {t('Yes')}
            </button>
            <button type="button" className="cn-chip" onClick={props.onManual}>
              {t('Set it myself')}
            </button>
          </div>
        </div>
      </div>
    )
  }

  if (result.kind === 'ambiguous') {
    return (
      <div className="cn-parse" data-tone="ask" role="status">
        <Icon name="help" size={16} />
        <div>
          <p className="cn-parse-read">{t('Two readings of that. Which one?')}</p>
          <div className="cn-parse-acts">
            {result.readings.map((reading) => (
              <button
                key={reading.startsAt}
                type="button"
                className="cn-chip"
                data-on={props.confirmed === reading.startsAt || undefined}
                aria-pressed={props.confirmed === reading.startsAt}
                onClick={() => props.onConfirm(reading.startsAt)}
              >
                {reading.label}
              </button>
            ))}
          </div>
          {/* Nothing is picked for you, and the reason is on the screen. */}
          <p className="cn-parse-tiny">
            {t('Nothing is picked for you. A market at 7am and a game at 7pm are both normal here.')}
          </p>
        </div>
      </div>
    )
  }

  if (result.kind === 'needs_time') {
    return (
      <div className="cn-parse" data-tone="ask" role="status">
        <Icon name="help" size={16} />
        <div>
          <p className="cn-parse-read">
            {withBold(t('We found {day}, but no time in that.'), 'day', result.dayLabel)}
          </p>
          <div className="cn-parse-acts">
            <button type="button" className="cn-chip" onClick={props.onManual}>
              {t('Set the time by hand')}
            </button>
          </div>
          <p className="cn-parse-tiny">{t('Add a time to the line above, or set it here.')}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="cn-parse" data-tone="bad" role="status">
      <Icon name="alert-circle" size={16} />
      <div>
        {/* Not brick. Being misread is not an emergency, and spending the alarm
            register here is how it stops meaning anything at 6am when the
            river is up. */}
        <p className="cn-parse-read">
          {t('We could not find a date in that. Try a day and a time, or set it by hand.')}
        </p>
        <div className="cn-parse-acts">
          <button type="button" className="cn-chip" onClick={props.onManual}>
            {t('Set it by hand')}
          </button>
        </div>
        <p className="cn-parse-tiny">
          {t('The words you typed are kept. Nothing you wrote was thrown away.')}
        </p>
      </div>
    </div>
  )
}

/**
 * The fallback, which is the thing every phone already knows how to do.
 *
 * Native `date` and `time` inputs rather than a bespoke picker: this is the
 * escape hatch, and an escape hatch that needs learning is not one.
 */
function ManualEntry(props: { onBack: () => void; onSet: (at: number) => void }) {
  const [date, setDate] = useState('')
  const [time, setTime] = useState('')
  const incomplete = !date || !time

  useEffect(() => {
    if (incomplete) return
    const at = Date.parse(`${date}T${time}`)
    if (Number.isFinite(at)) props.onSet(at)
  }, [date, time, incomplete, props])

  return (
    <div className="cn-parse" data-tone="edit">
      <Icon name="edit" size={16} />
      <div>
        <p className="cn-parse-read">{t('You set this by hand. We stopped guessing.')}</p>
        <div className="cn-manual">
          <label className="cn-manual-f">
            <span>{t('Date')}</span>
            <input
              className="cn-input cn-input--sm"
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </label>
          <label className="cn-manual-f">
            <span>{t('Starts')}</span>
            <input
              className="cn-input cn-input--sm"
              type="time"
              value={time}
              onChange={(e) => setTime(e.target.value)}
            />
          </label>
        </div>
        {incomplete ? <InlineError>{t('A date and a time, and it is set.')}</InlineError> : null}
        <Button variant="quiet" size="sm" icon="refresh" onClick={props.onBack}>
          {t('Go back to typing it')}
        </Button>
      </div>
    </div>
  )
}
