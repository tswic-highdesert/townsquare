/**
 * The demo's view: a two-pane workbench over `sdk/methods.ts` and
 * `sdk/useSdkCall.ts`. All SDK logic lives there; this file only lays it out.
 *
 * Every method panel stays mounted (hidden when not selected), so form values
 * and the last result survive switching between methods.
 */

import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from 'react'
import { town, user } from '@townsquare/sdk'
import {
  EMPTY_LOCALLY,
  initialValues,
  METHODS,
  NAMESPACES,
  nextCursorOf,
  NOT_YET,
  type InputField,
  type InputValues,
  type Namespace,
  type SdkMethod,
} from './sdk/methods.js'
import { useSdkCall, type CallState } from './sdk/useSdkCall.js'
import { JsonView } from './JsonView.js'

type Outcome = 'running' | 'ok' | 'error' | 'notYet'

interface LogEntry {
  n: number
  methodId: string
  outcome: Outcome
  detail: string
  at: string
}

const NS_BLURB: Record<Namespace, string> = {
  app: 'Talk to the frame',
  town: 'Public town data',
  user: 'Who is signed in',
  storage: 'Private, per user',
  records: 'Shared town records',
}

const LOG_LIMIT = 25

function outcomeOf(state: CallState): Outcome | null {
  if (state.status === 'running') return 'running'
  if (state.status === 'ok') return 'ok'
  if (state.status === 'error') return state.notYet ? 'notYet' : 'error'
  return null
}

function detailOf(state: CallState): string {
  if (state.status === 'ok') return state.fired ? 'sent' : `${state.ms}ms`
  if (state.status === 'error') return state.notYet ? 'not built yet' : state.code
  return ''
}

// ── app shell ──────────────────────────────────────────────────────────────

export function App() {
  const [selected, setSelected] = useState(METHODS.find((m) => m.id === 'town.info')?.id ?? METHODS[0]!.id)
  const [filter, setFilter] = useState('')
  const [outcomes, setOutcomes] = useState<Record<string, Outcome>>({})
  const [log, setLog] = useState<LogEntry[]>([])
  const counter = useRef(0)

  const onSettled = useCallback((methodId: string, state: CallState) => {
    const outcome = outcomeOf(state)
    if (!outcome) return
    setOutcomes((o) => ({ ...o, [methodId]: outcome }))
    if (outcome === 'running') return
    const entry: LogEntry = {
      n: ++counter.current,
      methodId,
      outcome,
      detail: detailOf(state),
      at: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
    }
    setLog((l) => [entry, ...l].slice(0, LOG_LIMIT))
  }, [])

  const q = filter.trim().toLowerCase()
  const visible = METHODS.filter((m) => !q || m.id.toLowerCase().includes(q) || m.summary.toLowerCase().includes(q))

  return (
    <div className="shell">
      <Header />

      <div className="layout">
        <nav className="nav" aria-label="SDK methods">
          <input
            className="nav-search"
            type="search"
            placeholder="Filter methods"
            aria-label="Filter methods"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          />
          {NAMESPACES.map((ns) => {
            const items = visible.filter((m) => m.namespace === ns)
            if (items.length === 0) return null
            return (
              <div className="nav-group" key={ns}>
                <div className="nav-heading">
                  <span>{ns}</span>
                  <small>{NS_BLURB[ns]}</small>
                </div>
                <ul>
                  {items.map((m) => (
                    <li key={m.id}>
                      <button
                        type="button"
                        className="nav-item"
                        aria-current={m.id === selected ? 'page' : undefined}
                        onClick={() => setSelected(m.id)}
                      >
                        <span className={`dot dot-${outcomes[m.id] ?? 'idle'}`} aria-hidden="true" />
                        <span className="nav-name">{m.id.slice(ns.length + 1)}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )
          })}
          {visible.length === 0 && <p className="nav-empty">No method matches “{filter}”.</p>}
        </nav>

        <div className="main">
          {METHODS.map((m) => (
            <MethodPanel key={m.id} method={m} active={m.id === selected} onSettled={onSettled} />
          ))}

          <CallLog entries={log} onPick={setSelected} onClear={() => setLog([])} />
        </div>
      </div>
    </div>
  )
}

// ── header: which town, who is signed in ───────────────────────────────────

function Header() {
  const [townName, setTownName] = useState<string | null>(null)
  const [who, setWho] = useState<string>('Checking…')

  useEffect(() => {
    let live = true
    town
      .info()
      .then((t) => live && setTownName(`${t.name} · ${t.timezone}`))
      .catch(() => live && setTownName('Town unavailable'))
    user
      .current()
      .then((u) => live && setWho(u ? `@${u.handle}${u.verified ? ' · verified' : ''}` : 'Signed out'))
      .catch(() => live && setWho('Identity unavailable'))
    return () => {
      live = false
    }
  }, [])

  return (
    <header className="header">
      <div>
        <p className="eyebrow">Developer creation</p>
        <h1>SDK Demo</h1>
        <p className="lede">Call any @townsquare/sdk method, see the result and the line of code that made it.</p>
      </div>
      <dl className="context">
        <div>
          <dt>Town</dt>
          <dd>{townName ?? 'Connecting…'}</dd>
        </div>
        <div>
          <dt>You</dt>
          <dd>{who}</dd>
        </div>
      </dl>
    </header>
  )
}

// ── one method ─────────────────────────────────────────────────────────────

function MethodPanel({
  method,
  active,
  onSettled,
}: {
  method: SdkMethod
  active: boolean
  onSettled: (id: string, state: CallState) => void
}) {
  const [values, setValues] = useState(() => initialValues(method))
  const { state, run, reset } = useSdkCall(method)
  const set = (name: string, value: string) => setValues((v) => ({ ...v, [name]: value }))

  useEffect(() => {
    onSettled(method.id, state)
  }, [method.id, state, onSettled])

  const cursor = state.status === 'ok' ? nextCursorOf(state.result) : null
  const pageable = method.inputs.some((f) => f.name === 'cursor')
  const running = state.status === 'running'

  const submit = (v: InputValues = values) => {
    if (!running) void run(v)
  }
  const nextPage = () => {
    if (!cursor) return
    const next = { ...values, cursor }
    setValues(next)
    submit(next)
  }
  const restore = () => {
    setValues(initialValues(method))
    reset()
  }
  const onKeyDown = (e: KeyboardEvent<HTMLFormElement>) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault()
      submit()
    }
  }

  const notBuilt = method.note === NOT_YET
  const emptyLocally = method.note === EMPTY_LOCALLY
  const otherNote = method.note && !notBuilt && !emptyLocally ? method.note : null

  return (
    <section className="panel" hidden={!active} aria-labelledby={`${method.id}-title`}>
      <div className="panel-head">
        <p className="eyebrow">{method.namespace}</p>
        <h2 id={`${method.id}-title`}>
          <code>{method.signature}</code>
        </h2>
        <p className="summary">{method.summary}</p>
        <div className="why">
          <p className="why-label">When to use it</p>
          <p>{method.why}</p>
        </div>
        <div className="badges">
          <span className={`badge ${method.requires ? 'badge-perm' : 'badge-open'}`}>
            {method.requires ? `Needs ${method.requires}` : 'No permission needed'}
          </span>
          {notBuilt && <span className="badge badge-warn">Not served by the host yet</span>}
          {emptyLocally && <span className="badge badge-quiet">Empty under pnpm dev</span>}
        </div>
        {(notBuilt || emptyLocally) && <p className="note">{method.note}</p>}
        {otherNote && <p className="note">{otherNote}</p>}
      </div>

      <form
        className="form"
        onSubmit={(e) => {
          e.preventDefault()
          submit()
        }}
        onKeyDown={onKeyDown}
      >
        {method.inputs.length > 0 ? (
          <div className="fields">
            {method.inputs.map((f) => (
              <Field key={f.name} id={`${method.id}-${f.name}`} field={f} value={values[f.name] ?? ''} onChange={set} />
            ))}
          </div>
        ) : (
          <p className="no-inputs">This method takes no arguments.</p>
        )}

        <CodeBlock code={method.code(values)} />

        <div className="actions">
          <button type="submit" className="btn btn-primary" disabled={running}>
            {running ? 'Running…' : 'Run'}
          </button>
          {pageable && cursor && (
            <button type="button" className="btn" onClick={nextPage} disabled={running}>
              Next page
            </button>
          )}
          <button type="button" className="btn btn-ghost" onClick={restore}>
            Reset
          </button>
          <span className="shortcut">Ctrl + Enter to run</span>
        </div>
      </form>

      <Result state={state} />
    </section>
  )
}

function Field({
  id,
  field: f,
  value,
  onChange,
}: {
  id: string
  field: InputField
  value: string
  onChange: (name: string, value: string) => void
}) {
  return (
    <div className={`field${f.kind === 'json' ? ' field-wide' : ''}`}>
      <label htmlFor={id}>
        <code>{f.label}</code>
        {f.optional && <span className="optional">optional</span>}
      </label>
      {f.kind === 'select' ? (
        <select id={id} value={value} onChange={(e) => onChange(f.name, e.target.value)}>
          {f.options?.map((o) => (
            <option key={o} value={o}>
              {o || '(any)'}
            </option>
          ))}
        </select>
      ) : f.kind === 'json' ? (
        <textarea
          id={id}
          value={value}
          spellCheck={false}
          rows={4}
          onChange={(e) => onChange(f.name, e.target.value)}
        />
      ) : (
        <input
          id={id}
          type={f.kind === 'number' ? 'number' : 'text'}
          inputMode={f.kind === 'number' ? 'numeric' : undefined}
          value={value}
          placeholder={f.hint}
          onChange={(e) => onChange(f.name, e.target.value)}
        />
      )}
      {f.hint && f.kind !== 'text' && f.kind !== 'number' && <small className="hint">{f.hint}</small>}
    </div>
  )
}

function CodeBlock({ code }: { code: string }) {
  const [copied, setCopied] = useState<string | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  useEffect(() => () => clearTimeout(timer.current), [])

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code)
      setCopied('Copied')
    } catch {
      // The sandboxed frame may not be allowed clipboard access.
      setCopied('Copy blocked')
    }
    clearTimeout(timer.current)
    timer.current = setTimeout(() => setCopied(null), 1600)
  }

  return (
    <div className="code">
      <div className="code-bar">
        <span>Equivalent code</span>
        <button type="button" className="code-copy" onClick={() => void copy()}>
          {copied ?? 'Copy'}
        </button>
      </div>
      <pre>
        <code>{code}</code>
      </pre>
    </div>
  )
}

function Result({ state }: { state: CallState }) {
  let body
  if (state.status === 'idle') {
    body = <p className="result-empty">Press Run to call this method.</p>
  } else if (state.status === 'running') {
    body = <p className="result-empty">Waiting for the host…</p>
  } else if (state.status === 'ok') {
    const count = itemCount(state.result)
    body = (
      <>
        <div className="result-head">
          <span className="pill pill-ok">{state.fired ? 'Sent' : 'OK'}</span>
          {!state.fired && <span className="meta">{state.ms}ms</span>}
          {count !== null && <span className="meta">{count === 1 ? '1 item' : `${count} items`}</span>}
        </div>
        {state.fired ? (
          <p className="result-empty">This call is fire-and-forget, so there is nothing to return.</p>
        ) : (
          <JsonView value={state.result} />
        )}
      </>
    )
  } else {
    body = (
      <>
        <div className="result-head">
          <span className={`pill ${state.notYet ? 'pill-warn' : 'pill-error'}`}>
            {state.notYet ? 'Not built yet' : 'Error'}
          </span>
          <code className="meta">{state.code}</code>
          {state.retryable && <span className="meta">retryable</span>}
        </div>
        <p className={state.notYet ? 'result-msg' : 'result-msg result-msg-error'}>{state.message}</p>
        {state.notYet && (
          <p className="result-empty">
            Retrying will not help. The call is correct and will work once the host serves this method.
          </p>
        )}
      </>
    )
  }

  return (
    <div className="result" aria-live="polite">
      <h3 className="section-label">Result</h3>
      {body}
    </div>
  )
}

function itemCount(result: unknown): number | null {
  if (Array.isArray(result)) return result.length
  if (typeof result === 'object' && result !== null) {
    const items = (result as { items?: unknown }).items
    if (Array.isArray(items)) return items.length
  }
  return null
}

// ── session log ────────────────────────────────────────────────────────────

function CallLog({
  entries,
  onPick,
  onClear,
}: {
  entries: LogEntry[]
  onPick: (id: string) => void
  onClear: () => void
}) {
  return (
    <section className="log" aria-label="Call log">
      <div className="log-head">
        <h3 className="section-label">This session</h3>
        {entries.length > 0 && (
          <button type="button" className="btn btn-ghost btn-small" onClick={onClear}>
            Clear
          </button>
        )}
      </div>
      {entries.length === 0 ? (
        <p className="result-empty">Calls you run appear here.</p>
      ) : (
        <ol>
          {entries.map((e) => (
            <li key={e.n}>
              <button type="button" className="log-row" onClick={() => onPick(e.methodId)}>
                <span className={`dot dot-${e.outcome}`} aria-hidden="true" />
                <code className="log-method">{e.methodId}</code>
                <span className="log-detail">{e.detail}</span>
                <span className="log-time">{e.at}</span>
              </button>
            </li>
          ))}
        </ol>
      )}
    </section>
  )
}
