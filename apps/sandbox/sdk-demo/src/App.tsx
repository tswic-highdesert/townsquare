import { useEffect, useState } from 'react'
import { town, TownSquareError, type TownInfo } from '@townsquare/sdk'

type State =
  | { status: 'loading' }
  | { status: 'ok'; info: TownInfo }
  | { status: 'error'; code: string; message: string }

export function App() {
  const [state, setState] = useState<State>({ status: 'loading' })

  useEffect(() => {
    let cancelled = false
    town
      .info()
      .then((info) => {
        if (!cancelled) setState({ status: 'ok', info })
      })
      .catch((err: unknown) => {
        if (cancelled) return
        const code = err instanceof TownSquareError ? err.code : 'unknown'
        const message = err instanceof Error ? err.message : String(err)
        setState({ status: 'error', code, message })
      })
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <main>
      <h1>SDK Demo</h1>
      <p className="lede">A React creation talking to Town Square through the SDK.</p>

      <section className="panel">
        <h2>
          <code>town.info()</code>
        </h2>
        {state.status === 'loading' && <p>Loading…</p>}
        {state.status === 'ok' && (
          <dl>
            <dt>Town</dt>
            <dd>{state.info.name}</dd>
            <dt>Id</dt>
            <dd>
              <code>{state.info.id}</code>
            </dd>
            <dt>Timezone</dt>
            <dd>{state.info.timezone}</dd>
          </dl>
        )}
        {state.status === 'error' && (
          <p className="error">
            <code>{state.code}</code> {state.message}
          </p>
        )}
      </section>
    </main>
  )
}
