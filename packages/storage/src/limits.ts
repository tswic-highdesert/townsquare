/**
 * The limits, and the decisions behind each number.
 *
 * Storage is the first capability a builder asks for after identity, and it is
 * also the first one that costs a town real disk. Every limit here exists to
 * make the second thing bounded without making the first thing annoying.
 *
 * **The quota is per creation, per user.** One app filling its allowance can
 * never affect another app, or another resident, which is what makes the
 * ceiling something we can be relaxed about.
 */

/**
 * 64 KB per (creation, user), total across every key.
 *
 * `spec-manifest-and-sdk.md` says 64 KB per user and the sandbox design says
 * 256 KB; the spec wins, per the rule in the README. It is also the number
 * already written into the SDK docs a builder reads, and a documented limit
 * that disagrees with the enforced one is worse than either number.
 */
export const MAX_TOTAL_BYTES = 64 * 1024

/**
 * 64 keys.
 *
 * Not about bytes — the total already bounds those. This bounds the row count,
 * so a creation looping `set(`item-${i}`, 1)` produces a small table rather
 * than sixty thousand tiny rows inside its byte budget.
 */
export const MAX_KEYS = 64

export const MAX_KEY_CHARS = 128

/**
 * Keys are identifiers, not free text.
 *
 * The charset is narrow enough to be safe as a path segment, a cache key or a
 * log field without anyone having to remember to escape it. Slashes are absent
 * on purpose: a key that looks like a path invites code that treats it as one.
 */
const KEY_PATTERN = /^[A-Za-z0-9._:-]+$/

export type KeyProblem = 'empty' | 'too_long' | 'bad_characters'

export type KeyResult = { ok: true; key: string } | { ok: false; problem: KeyProblem; message: string }

export function checkKey(raw: unknown): KeyResult {
  if (typeof raw !== 'string' || raw.length === 0) {
    return { ok: false, problem: 'empty', message: 'A storage key is required.' }
  }
  if (raw.length > MAX_KEY_CHARS) {
    return {
      ok: false,
      problem: 'too_long',
      message: `Storage keys are at most ${MAX_KEY_CHARS} characters.`,
    }
  }
  if (!KEY_PATTERN.test(raw)) {
    return {
      ok: false,
      problem: 'bad_characters',
      message: 'Storage keys use letters, numbers, and . _ : - only.',
    }
  }
  return { ok: true, key: raw }
}

export type ValueResult =
  | { ok: true; value: unknown; bytes: number }
  | { ok: false; problem: 'unserializable' | 'too_large'; message: string }

/**
 * Serialize a value and measure it.
 *
 * The round trip is the validation: whatever comes back out is exactly what a
 * later `get` will return, so a value that survives storing cannot surprise
 * the app that reads it. `undefined`, functions and symbols vanish through
 * JSON, and a cycle or a BigInt throws — all of which are much better as an
 * error at the call site than as a silently different value tomorrow.
 */
export function measureValue(value: unknown): ValueResult {
  let json: string
  try {
    json = JSON.stringify(value)
  } catch {
    return {
      ok: false,
      problem: 'unserializable',
      message: 'Storage values must be JSON — no functions, no cycles, no BigInt.',
    }
  }
  if (json === undefined) {
    return {
      ok: false,
      problem: 'unserializable',
      message: 'Storage values must be JSON — no functions, no cycles, no BigInt.',
    }
  }

  const bytes = Buffer.byteLength(json, 'utf8')
  if (bytes > MAX_TOTAL_BYTES) {
    return {
      ok: false,
      problem: 'too_large',
      message: `That value is ${describeBytes(bytes)}. Storage holds ${describeBytes(MAX_TOTAL_BYTES)} in total.`,
    }
  }

  return { ok: true, value: JSON.parse(json) as unknown, bytes }
}

export interface Usage {
  /** Bytes currently stored for this (creation, user). */
  bytes: number
  keys: number
  maxBytes: number
  maxKeys: number
}

export type QuotaVerdict =
  | { ok: true; usage: Usage }
  | { ok: false; problem: 'over_bytes' | 'over_keys'; message: string; usage: Usage }

/**
 * Decide whether one write fits, given what is already there.
 *
 * Replacing a key is measured as a replacement, not an addition. The naive
 * version — add the new size to the current total — makes an app that
 * rewrites one key every render hit the ceiling on the second write, which is
 * both wrong and exactly what real apps do.
 */
export function checkQuota(input: {
  existingBytes: number
  existingKeys: number
  /** The row being overwritten, or null when this key is new. */
  replacing: { bytes: number } | null
  incomingBytes: number
}): QuotaVerdict {
  const bytes = input.existingBytes - (input.replacing?.bytes ?? 0) + input.incomingBytes
  const keys = input.existingKeys + (input.replacing ? 0 : 1)
  const usage: Usage = { bytes, keys, maxBytes: MAX_TOTAL_BYTES, maxKeys: MAX_KEYS }

  if (bytes > MAX_TOTAL_BYTES) {
    return {
      ok: false,
      problem: 'over_bytes',
      message: `That would put you over ${describeBytes(MAX_TOTAL_BYTES)} of storage for this app. Remove a key first.`,
      usage,
    }
  }
  if (keys > MAX_KEYS) {
    return {
      ok: false,
      problem: 'over_keys',
      message: `This app already stores ${MAX_KEYS} keys for you. Remove one first.`,
      usage,
    }
  }

  return { ok: true, usage }
}

function describeBytes(n: number): string {
  return n >= 1024 ? `${Math.round(n / 1024)} KB` : `${n} bytes`
}
