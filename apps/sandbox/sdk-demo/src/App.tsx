/**
 * A deliberately plain view over `sdk/methods.ts` and `sdk/useSdkCall.ts`.
 * All SDK logic lives there; replace this file to restyle the demo.
 */

import { useState } from 'react'
import { initialValues, METHODS, NAMESPACES, nextCursorOf, type SdkMethod } from './sdk/methods.js'
import { useSdkCall } from './sdk/useSdkCall.js'

export function App() {
  return (
    <main>
      <h1>SDK Demo</h1>
      <p className="lede">Every @townsquare/sdk method. Fill in the inputs and press Run.</p>
      {NAMESPACES.map((ns) => (
        <section key={ns}>
          <h2>{ns}</h2>
          {METHODS.filter((m) => m.namespace === ns).map((m) => (
            <MethodPanel key={m.id} method={m} />
          ))}
        </section>
      ))}
    </main>
  )
}

function MethodPanel({ method }: { method: SdkMethod }) {
  const [values, setValues] = useState(() => initialValues(method))
  const { state, run } = useSdkCall(method)
  const set = (name: string, value: string) => setValues((v) => ({ ...v, [name]: value }))

  const cursor = state.status === 'ok' ? nextCursorOf(state.result) : null
  const pageable = method.inputs.some((f) => f.name === 'cursor')
  const nextPage = () => {
    if (!cursor) return
    const next = { ...values, cursor }
    setValues(next)
    void run(next)
  }

  return (
    <article className="panel">
      <h3>
        <code>{method.signature}</code>
      </h3>
      <p>{method.summary}</p>
      <p>Requires: {method.requires ?? 'nothing'}</p>
      {method.note && <p>Note: {method.note}</p>}

      <form
        onSubmit={(e) => {
          e.preventDefault()
          void run(values)
        }}
      >
        {method.inputs.map((f) => (
          <label key={f.name}>
            {f.label}
            {f.optional && ' (optional)'}{' '}
            {f.kind === 'select' ? (
              <select value={values[f.name]} onChange={(e) => set(f.name, e.target.value)}>
                {f.options?.map((o) => (
                  <option key={o} value={o}>
                    {o || '(any)'}
                  </option>
                ))}
              </select>
            ) : f.kind === 'json' ? (
              <textarea value={values[f.name]} onChange={(e) => set(f.name, e.target.value)} />
            ) : (
              <input
                type={f.kind === 'number' ? 'number' : 'text'}
                value={values[f.name]}
                placeholder={f.hint}
                onChange={(e) => set(f.name, e.target.value)}
              />
            )}
          </label>
        ))}
        <button type="submit" disabled={state.status === 'running'}>
          Run
        </button>
        {pageable && cursor && (
          <button type="button" onClick={nextPage}>
            Next page
          </button>
        )}
      </form>

      <pre>
        <code>{method.code(values)}</code>
      </pre>

      {state.status === 'running' && <p>Running…</p>}
      {state.status === 'ok' &&
        (state.fired ? (
          <p>Sent. This call returns nothing.</p>
        ) : (
          <pre>
            {state.ms}ms{'\n'}
            {state.result === undefined ? 'undefined' : JSON.stringify(state.result, null, 2)}
          </pre>
        ))}
      {state.status === 'error' && (
        <p className="error">
          <code>{state.code}</code> {state.message}
          {state.retryable && ' (retryable)'}
        </p>
      )}
    </article>
  )
}
