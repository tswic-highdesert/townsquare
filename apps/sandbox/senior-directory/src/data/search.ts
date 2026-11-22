/**
 * Search and link helpers for the directory, kept out of the view so they can
 * be tested.
 *
 * Search is forgiving on purpose: people type "pharmacies", "dentists" or
 * "marys" and expect "Pharmacy", "Dentistry" and "Saint Mary's". So both the
 * query and the listing are reduced to word stems before comparing, and a
 * query word matches when it is the start of any listing word.
 */

import type { DirectoryEntry } from './directory.js'
import { NEEDS } from './needs.js'

/** The chamber list is Russellville's; anything elsewhere is out of town. */
export const HOME_CITY = 'Russellville'

/** Lowercase, apostrophes dropped, punctuation to spaces, split into words. */
function words(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/&/g, ' and ')
    .split(/[^a-z0-9]+/)
    .filter(Boolean)
}

/** A rough English stem: enough for plurals and "-istry"/"-ist" style pairs. */
export function stem(word: string): string {
  if (word.length <= 3) return word
  if (word.endsWith('ies')) return `${word.slice(0, -3)}y`
  if (word.endsWith('es') && /(ch|sh|ss|x|z)es$/.test(word)) return word.slice(0, -2)
  if (word.endsWith('s') && !word.endsWith('ss')) return word.slice(0, -1)
  return word
}

/** What a listing can be found by: name, category, address and its need. */
function haystack(e: DirectoryEntry): string[] {
  const need = NEEDS.find((n) => n.id === e.need)
  return words([e.name, e.category, e.address, need?.label, need?.hint].join(' ')).map(stem)
}

/**
 * Every word of the query starts some word of the listing, after stemming.
 * "dentists" → "dentist", which starts "dentistry"; "pharmacies" → "pharmacy".
 */
export function matches(e: DirectoryEntry, query: string): boolean {
  const q = words(query).map(stem)
  if (q.length === 0) return true
  const hay = haystack(e)
  return q.every((w) => hay.some((h) => h.startsWith(w)))
}

export function isInTown(e: Pick<DirectoryEntry, 'city'>): boolean {
  // Town listings have no city field; they come from this town's directory.
  return e.city === null || e.city.toLowerCase() === HOME_CITY.toLowerCase()
}

/** "(479) 968-2456" → "+14799682456"; leaves anything unexpected as digits. */
export function telOf(phone: string): string {
  const digits = phone.replace(/\D/g, '')
  return digits.length === 10 ? `+1${digits}` : digits
}

export function mapsUrl(e: Pick<DirectoryEntry, 'name' | 'address' | 'geo'>): string {
  const q = e.geo ? `${e.geo.lat},${e.geo.lng}` : `${e.name}, ${e.address}`
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}`
}
