/**
 * Opaque credentials: session cookies and email challenge tokens.
 *
 * Two rules hold for both, and they are the reason this is one small module
 * rather than inline calls at each site:
 *
 *   1. Only the hash is ever stored. A database dump should not be a set of
 *      working sessions.
 *   2. Lookup is by hash, and any secret comparison is constant time.
 */

import { createHash, randomBytes, timingSafeEqual } from 'node:crypto'

/** 32 bytes of CSPRNG output, base64url. Not a uuid: uuids are identifiers. */
export function newSecret(bytes = 32): string {
  return randomBytes(bytes).toString('base64url')
}

export function hashSecret(secret: string): string {
  return createHash('sha256').update(secret, 'utf8').digest('hex')
}

/**
 * Compare two secrets without leaking their common prefix through timing.
 *
 * Hashing both first makes the inputs fixed-length, which sidesteps the
 * length-mismatch throw in `timingSafeEqual` — and length is itself something
 * worth not leaking.
 */
export function secretsMatch(a: string, b: string): boolean {
  const ha = createHash('sha256').update(a, 'utf8').digest()
  const hb = createHash('sha256').update(b, 'utf8').digest()
  return timingSafeEqual(ha, hb)
}

/**
 * A short human-typable code, for the day a challenge is read aloud or copied
 * off a screen rather than clicked.
 *
 * Digits and unambiguous consonants: no 0/O, no 1/I/L, no vowels, so it cannot
 * spell anything and cannot be misread. Entropy is ~5 bits a character, so
 * eight characters is ~41 bits, which is only defensible alongside the attempt
 * limit the challenge store enforces.
 */
const CODE_ALPHABET = '23456789BCDFGHJKMNPQRSTVWXYZ'

export function newCode(length = 8): string {
  const bytes = randomBytes(length)
  let out = ''
  for (let i = 0; i < length; i++) {
    // Modulo bias across 256 % 28 is under 2% and irrelevant against an
    // eight-attempt ceiling. Rejection sampling here would be ceremony.
    out += CODE_ALPHABET[bytes[i]! % CODE_ALPHABET.length]
  }
  return out
}

export function normalizeCode(raw: string): string {
  return raw.trim().toUpperCase().replace(/[\s-]/g, '')
}
