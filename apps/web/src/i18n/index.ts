/**
 * The shell's own words, in English or Spanish.
 *
 * English is the source language and the key: `t('Try again')` reads like the
 * string it renders, so a screen stays readable without opening a dictionary,
 * and a missing Spanish entry falls back to English rather than to a key name
 * nobody can read. `i18n.test.ts` scans every `t(...)` and `tn(...)` call in
 * the shell and fails if Spanish is missing one, or if the two disagree about
 * which `{placeholders}` a string carries.
 *
 * Only the shell's interface is translated here. Stories, events, business
 * listings, notices and anything a neighbour wrote are content, and they reach
 * a resident in the language they were published in. Translating them belongs
 * to the reader pipeline, where a translation can carry its provenance.
 *
 * ## One subscriber, on purpose
 *
 * `App` is the only component that subscribes to the locale. Nothing in the
 * shell is memoised, so a locale change re-renders `App` and with it every
 * screen, and every `t()` underneath reads the new language. That keeps
 * translation a plain function call: no hook to remember in sixty components,
 * and helpers outside React (`relative.ts`, `when.ts`) can translate too.
 * Wrapping a screen in `memo` would break this, and `i18n.test.ts` says so.
 */

import { useSyncExternalStore } from 'react'
import { es } from './es/index.js'

export type Locale = 'en' | 'es'

export interface Plural {
  one: string
  other: string
}

export type Entry = string | Plural

export const LOCALES: ReadonlyArray<{ id: Locale; name: string }> = [
  { id: 'en', name: 'English' },
  { id: 'es', name: 'Español' },
]

const STORAGE_KEY = 'ts-locale'
const DICTIONARIES: Record<Locale, Readonly<Record<string, Entry>>> = { en: {}, es }

let current: Locale = initialLocale()
const listeners = new Set<() => void>()

function initialLocale(): Locale {
  try {
    const stored = globalThis.localStorage?.getItem(STORAGE_KEY)
    if (stored === 'en' || stored === 'es') return stored
  } catch {
    // Private windows and blocked storage throw. The browser's language is
    // still a good guess.
  }
  const preferred = globalThis.navigator?.languages ?? []
  return preferred.find((tag) => /^(en|es)\b/i.test(tag))?.slice(0, 2).toLowerCase() === 'es' ? 'es' : 'en'
}

export function getLocale(): Locale {
  return current
}

/** BCP 47 tag for `Intl` and for `<html lang>`. Spanish as written in the US. */
export function intlLocale(locale: Locale = current): string {
  return locale === 'es' ? 'es-US' : 'en-US'
}

export function setLocale(next: Locale): void {
  if (next === current) return
  current = next
  try {
    globalThis.localStorage?.setItem(STORAGE_KEY, next)
  } catch {
    // The choice still holds for this visit.
  }
  syncDocument()
  for (const listener of listeners) listener()
}

/** Keep `<html lang>` true, so a screen reader speaks the page in the right voice. */
export function syncDocument(): void {
  if (typeof document === 'undefined') return
  document.documentElement.lang = intlLocale().slice(0, 2)
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

/** For `App` only. See "One subscriber, on purpose" above. */
export function useLocale(): Locale {
  return useSyncExternalStore(subscribe, getLocale, getLocale)
}

type Vars = Record<string, string | number>

function fill(text: string, vars?: Vars): string {
  if (!vars) return text
  return text.replace(/\{(\w+)\}/g, (whole, name: string) =>
    name in vars ? String(vars[name]) : whole,
  )
}

/** Translate a shell string. `{name}` placeholders are filled from `vars`. */
export function t(source: string, vars?: Vars): string {
  const entry = DICTIONARIES[current][source]
  const text = entry === undefined ? source : typeof entry === 'string' ? entry : entry.other
  return fill(text, vars)
}

/**
 * Translate a count. English passes both forms; the key is the `other` form,
 * and Spanish supplies its own pair. `{count}` is always available.
 */
export function tn(count: number, one: string, other: string, vars?: Vars): string {
  const all = { count, ...vars }
  const entry = DICTIONARIES[current][other]
  const rule = new Intl.PluralRules(intlLocale()).select(count) === 'one' ? 'one' : 'other'
  if (entry === undefined) return fill(rule === 'one' ? one : other, all)
  if (typeof entry === 'string') return fill(entry, all)
  return fill(entry[rule], all)
}

/**
 * Mark a string for translation without translating it yet: for tables of
 * labels defined at module scope and translated where they render with
 * `t(label)`. The test finds keys by these calls, so a label that is neither
 * inside `t()` nor `msg()` is a label Spanish will never get.
 */
export function msg<S extends string>(source: S): S {
  return source
}

/** The list joiner for the current language: "a, b and c" or "a, b y c". */
export function list(items: string[], type: 'conjunction' | 'disjunction' = 'conjunction'): string {
  return new Intl.ListFormat(intlLocale(), { style: 'long', type }).format(items)
}
