/**
 * Handles and emails: the only two strings this project stores about a person.
 *
 * Both are normalized once, here, and every comparison downstream is on the
 * normalized form. Two spellings of the same identity is the whole class of
 * bug that matters in a town — `TSwic` sitting beside `tswic` is not a
 * cosmetic inconsistency, it is impersonation, and a town is exactly the
 * setting where it would work.
 */

/**
 * Names a handle may not take.
 *
 * Split by reason rather than merged into one list, because the reasons decay
 * differently: routes change, official-sounding words do not.
 */
const RESERVED = new Set([
  // shell routes, present and plausible
  'about',
  'account',
  'admin',
  'api',
  'apps',
  'auth',
  'build',
  'creations',
  'help',
  'login',
  'logout',
  'me',
  'moderator',
  'new',
  'privacy',
  'report',
  'reports',
  'settings',
  'signin',
  'signout',
  'signup',
  'terms',
  'town',
  'townsquare',
  'user',
  'users',
  // official-sounding, which is the impersonation surface
  'city',
  'council',
  'mayor',
  'official',
  'police',
  'sheriff',
  'staff',
  'support',
  'system',
])

export const HANDLE_MIN = 3
export const HANDLE_MAX = 24

export type HandleProblem =
  | 'too_short'
  | 'too_long'
  | 'bad_characters'
  | 'bad_edges'
  | 'doubled_separator'
  | 'reserved'

export type HandleResult =
  | { ok: true; handle: string }
  | { ok: false; problem: HandleProblem; message: string }

/**
 * Validate and normalize a handle.
 *
 * Lowercased on the way in rather than merely compared case-insensitively.
 * Storing the case a person typed and comparing without it means the display
 * name and the unique key disagree, and every later feature has to remember
 * which one it is holding. One form, everywhere, is worth the small loss of
 * personalization.
 */
export function normalizeHandle(raw: string): HandleResult {
  const handle = raw.trim().toLowerCase()

  if (handle.length < HANDLE_MIN) {
    return { ok: false, problem: 'too_short', message: `Handles are at least ${HANDLE_MIN} characters.` }
  }
  if (handle.length > HANDLE_MAX) {
    return { ok: false, problem: 'too_long', message: `Handles are at most ${HANDLE_MAX} characters.` }
  }
  if (!/^[a-z0-9._-]+$/.test(handle)) {
    return {
      ok: false,
      problem: 'bad_characters',
      message: 'Handles use letters, numbers, and . _ - only.',
    }
  }
  if (!/^[a-z0-9]/.test(handle) || !/[a-z0-9]$/.test(handle)) {
    return {
      ok: false,
      problem: 'bad_edges',
      message: 'Handles start and end with a letter or a number.',
    }
  }
  // `a..b` and `a__b` are how a near-identical second handle gets built.
  if (/[._-]{2}/.test(handle)) {
    return {
      ok: false,
      problem: 'doubled_separator',
      message: 'Handles do not repeat . _ or - back to back.',
    }
  }
  if (RESERVED.has(handle.replace(/[._-]/g, ''))) {
    return { ok: false, problem: 'reserved', message: 'That handle is reserved.' }
  }

  return { ok: true, handle }
}

export function isReservedHandle(handle: string): boolean {
  return RESERVED.has(handle.trim().toLowerCase().replace(/[._-]/g, ''))
}

export type EmailResult = { ok: true; email: string } | { ok: false; message: string }

/**
 * Validate and normalize an email.
 *
 * Deliberately not a full RFC 5322 parser. The only question that matters is
 * whether a confirmation link can reach it, and the answer to that comes from
 * sending one, not from a regex. This rejects the obviously malformed and gets
 * out of the way.
 *
 * The domain is lowercased and the local part is not: the local part is
 * case-sensitive per spec, and rewriting it would break the rare provider that
 * honours that. Uniqueness is still checked case-insensitively, which trades a
 * theoretical duplicate for a much worse practical failure.
 */
export function normalizeEmail(raw: string): EmailResult {
  const email = raw.trim()
  if (email.length === 0) return { ok: false, message: 'An email address is required.' }
  if (email.length > 254) return { ok: false, message: 'That email address is too long.' }

  const at = email.lastIndexOf('@')
  if (at <= 0 || at === email.length - 1) {
    return { ok: false, message: "That does not look like an email address." }
  }
  const local = email.slice(0, at)
  const domain = email.slice(at + 1).toLowerCase()

  if (/\s/.test(email)) return { ok: false, message: "That does not look like an email address." }
  if (!/^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/.test(domain)) {
    return { ok: false, message: "That does not look like an email address." }
  }

  return { ok: true, email: `${local}@${domain}` }
}

/** The key uniqueness is enforced on. Never displayed, never emailed. */
export function emailKey(email: string): string {
  return email.trim().toLowerCase()
}
