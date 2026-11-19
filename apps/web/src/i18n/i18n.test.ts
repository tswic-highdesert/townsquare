import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'
import { getLocale, setLocale, t, tn } from './index.js'
import { AREAS, es, review } from './es/index.js'

const SRC = fileURLToPath(new URL('..', import.meta.url))

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) return name === 'i18n' ? [] : sources(path)
    return /\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name) ? [path] : []
  })
}

const STRING = String.raw`(?:'((?:\\.|[^'\\])*)'|"((?:\\.|[^"\\])*)")`
const unescape = (s: string) => s.replace(/\\(.)/g, '$1')

/** Every key the shell asks for, with the file that asks. */
function keys(): Map<string, string> {
  const found = new Map<string, string>()
  const single = new RegExp(String.raw`\b(?:t|msg)\(\s*${STRING}`, 'g')
  const plural = new RegExp(String.raw`\btn\([^,()]+(?:\([^()]*\))?[^,()]*,\s*${STRING}\s*,\s*${STRING}`, 'g')
  for (const file of sources(SRC)) {
    const text = readFileSync(file, 'utf8')
    for (const m of text.matchAll(single)) found.set(unescape(m[1] ?? m[2] ?? ''), file)
    for (const m of text.matchAll(plural)) found.set(unescape(m[3] ?? m[4] ?? ''), file)
  }
  return found
}

const holes = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort()

describe('the Spanish dictionary', () => {
  const asked = keys()

  it('finds the strings it is meant to check', () => {
    expect(asked.size).toBeGreaterThan(20)
  })

  it('has every string the shell asks for', () => {
    const missing = [...asked].filter(([key]) => !(key in es)).map(([key, file]) => `${file.slice(SRC.length)}: ${key}`)
    expect(missing).toEqual([])
  })

  it('carries no string the shell no longer asks for', () => {
    expect(Object.keys(es).filter((key) => !asked.has(key))).toEqual([])
  })

  it('keeps the same placeholders as English', () => {
    const wrong = Object.entries(es).flatMap(([key, entry]) => {
      const forms = typeof entry === 'string' ? [entry] : [entry.one, entry.other]
      return forms.filter((form) => {
        const want = holes(key).filter((h) => h !== 'count')
        const got = holes(form).filter((h) => h !== 'count')
        return JSON.stringify([...new Set(want)]) !== JSON.stringify([...new Set(got)])
      }).map((form) => `${key} -> ${form}`)
    })
    expect(wrong).toEqual([])
  })

  it('never translates one string two ways in two areas', () => {
    const seen = new Map<string, { area: string; value: string }>()
    const clash: string[] = []
    for (const [area, { strings }] of Object.entries(AREAS)) {
      for (const [key, entry] of Object.entries(strings)) {
        const value = JSON.stringify(entry)
        const before = seen.get(key)
        if (before && before.value !== value) clash.push(`${key}: ${before.area} ${before.value}, ${area} ${value}`)
        seen.set(key, { area, value })
      }
    }
    expect(clash).toEqual([])
  })

  it('only flags strings it translates', () => {
    expect(Object.keys(review).filter((key) => !(key in es))).toEqual([])
  })

  it('has no memoised component that would miss a language change', () => {
    const memo = sources(SRC).filter((file) => /\bmemo\(/.test(readFileSync(file, 'utf8')))
    expect(memo).toEqual([])
  })
})

describe('t and tn', () => {
  afterEach(() => setLocale('en'))

  it('falls back to English and fills placeholders', () => {
    setLocale('en')
    expect(t('Search {place}', { place: 'Russellville' })).toBe('Search Russellville')
    expect(tn(1, '{count} place', '{count} places')).toBe('1 place')
    expect(tn(3, '{count} place', '{count} places')).toBe('3 places')
  })

  it('switches language', () => {
    setLocale('es')
    expect(getLocale()).toBe('es')
    expect(t('Search {place}', { place: 'Russellville' })).toBe('Buscar en Russellville')
  })
})
