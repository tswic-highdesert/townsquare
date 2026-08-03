/**
 * The closed error vocabulary.
 *
 * Generated code branches on these strings, so they are part of the contract and
 * their meanings never change. Adding a code is free; changing or removing one
 * breaks apps that residents will not maintain.
 */

export const ERROR_CODES = [
  /** Signed in, but not a verified resident, and the call writes. */
  'not_verified',
  /** Signed out and the call needs a user. */
  'unauthenticated',
  /** Capability not declared in the manifest. Fails closed. */
  'permission_denied',
  /** Over budget. Carries `retryAfter`. */
  'rate_limited',
  /** No such record, or the type and id do not match. */
  'not_found',
  /** Payload fails the record type's schema. */
  'invalid_record',
  /** Malformed params or unknown method. The one builders hit most. */
  'invalid_request',
  /** A concurrent update lost the race. */
  'conflict',
  /** Payload over a documented limit. */
  'too_large',
  /** Host or upstream failed or timed out. Retryable. */
  'unavailable',
] as const

export type ErrorCode = (typeof ERROR_CODES)[number]

const CODE_SET: ReadonlySet<string> = new Set(ERROR_CODES)

export function isErrorCode(v: unknown): v is ErrorCode {
  return typeof v === 'string' && CODE_SET.has(v)
}

/**
 * The only two worth retrying. Everything else is an answer: the caller should
 * change what it is doing rather than try again. Generated code retries by
 * default, so stating this explicitly is what stops an agent hammering a call
 * that will never succeed.
 */
export const RETRYABLE: ReadonlySet<ErrorCode> = new Set(['rate_limited', 'unavailable'])

export interface WireError {
  code: ErrorCode
  message: string
  /** Seconds. Only meaningful on `rate_limited` and sometimes `unavailable`. */
  retryAfter?: number
  details?: unknown
}

export class TownSquareError extends Error {
  readonly code: ErrorCode
  readonly retryAfter: number | undefined
  readonly details: unknown

  constructor(err: WireError) {
    super(err.message)
    this.name = 'TownSquareError'
    this.code = err.code
    this.retryAfter = err.retryAfter
    this.details = err.details
  }

  get retryable(): boolean {
    return RETRYABLE.has(this.code)
  }
}

/**
 * Build a wire error without leaking internals.
 *
 * Every message that crosses to the guest goes through here. An upstream
 * exception string can carry a connection URL, a query, or a stack path, and the
 * guest is untrusted code that can post whatever it sees to a declared host.
 */
export function wireError(code: ErrorCode, message: string, extra?: Partial<WireError>): WireError {
  return {
    code,
    message,
    ...(extra?.retryAfter !== undefined ? { retryAfter: extra.retryAfter } : {}),
    ...(extra?.details !== undefined ? { details: extra.details } : {}),
  }
}
