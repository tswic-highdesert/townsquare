/**
 * Runs one catalog method and tracks its state for a view.
 *
 * Errors are normalized to `{ code, message }` so a view never has to know
 * the difference between a `TownSquareError` from the host, bad form input,
 * and anything unexpected.
 */

import { useCallback, useRef, useState } from 'react'
import { TownSquareError } from '@townsquare/sdk'
import { InputError, type InputValues, type SdkMethod } from './methods.js'

export type CallState =
  | { status: 'idle' }
  | { status: 'running' }
  /** `fired` is true for `app.*` calls, which return nothing by design. */
  | { status: 'ok'; result: unknown; fired: boolean; ms: number }
  /** `notYet` is true when the host says the method is not built yet; see below. */
  | { status: 'error'; code: string; message: string; retryable: boolean; notYet: boolean }

/** Only these two are worth retrying; every other code is an answer. */
const RETRYABLE = new Set(['rate_limited', 'unavailable'])

/**
 * The host answers a method it has not built yet (records, until Phase 8) with
 * `unavailable`, the same code as a passing outage, so the code alone would
 * tell a reader to retry something retrying can never fix. The message is the
 * only thing that tells them apart: it comes from `NotYetError` in
 * `packages/host/src/bridge.ts`, and a test fails if that wording changes.
 */
export const NOT_YET_MESSAGE = / is not available yet in this town\.$/

export function isNotYet(code: string, message: string): boolean {
  return code === 'unavailable' && NOT_YET_MESSAGE.test(message)
}

export function toCallError(err: unknown): Extract<CallState, { status: 'error' }> {
  if (err instanceof TownSquareError || err instanceof InputError) {
    const notYet = isNotYet(err.code, err.message)
    return {
      status: 'error',
      code: err.code,
      message: err.message,
      retryable: RETRYABLE.has(err.code) && !notYet,
      notYet,
    }
  }
  const message = err instanceof Error ? err.message : String(err)
  return { status: 'error', code: 'unknown', message, retryable: false, notYet: false }
}

export function useSdkCall(method: SdkMethod) {
  const [state, setState] = useState<CallState>({ status: 'idle' })
  // Drops a slow response that lands after a newer call was started.
  const latest = useRef(0)

  const run = useCallback(
    async (values: InputValues) => {
      const callId = ++latest.current
      const started = performance.now()
      setState({ status: 'running' })
      try {
        const out = method.run(values)
        const fired = !(out instanceof Promise)
        const result = fired ? undefined : await out
        if (callId === latest.current) {
          setState({ status: 'ok', result, fired, ms: Math.round(performance.now() - started) })
        }
      } catch (err) {
        if (callId === latest.current) setState(toCallError(err))
      }
    },
    [method],
  )

  const reset = useCallback(() => {
    latest.current++
    setState({ status: 'idle' })
  }, [])

  return { state, run, reset }
}
