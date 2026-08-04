import { describe, expect, it } from 'vitest'
import { emailKey, normalizeEmail, normalizeHandle } from './handles.js'

describe('normalizeHandle', () => {
  it('lowercases, so one identity has one spelling', () => {
    expect(normalizeHandle('TSwic')).toEqual({ ok: true, handle: 'tswic' })
    expect(normalizeHandle('  tswic  ')).toEqual({ ok: true, handle: 'tswic' })
  })

  it('accepts the separators people actually use', () => {
    for (const h of ['ann-marie', 'ann.marie', 'ann_marie', 'a1b2c3']) {
      expect(normalizeHandle(h).ok, h).toBe(true)
    }
  })

  it.each([
    ['ab', 'too_short'],
    ['a'.repeat(25), 'too_long'],
    ['ann marie', 'bad_characters'],
    ['ann@marie', 'bad_characters'],
    ['-ann', 'bad_edges'],
    ['ann-', 'bad_edges'],
    ['ann..marie', 'doubled_separator'],
    ['ann__marie', 'doubled_separator'],
  ])('rejects %s', (input, problem) => {
    const result = normalizeHandle(input)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.problem).toBe(problem)
  })

  it('reserves route names and official-sounding words', () => {
    for (const h of ['admin', 'settings', 'mayor', 'police', 'townsquare']) {
      expect(normalizeHandle(h).ok, h).toBe(false)
    }
  })

  it('reserves them through separator padding, which is the actual attack', () => {
    // `m-a-y-o-r` reads as `mayor` to a person scanning a list.
    for (const h of ['m-a-y-o-r', 'admin_', 'a.d.m.i.n', 'p_o_l_i_c_e']) {
      expect(normalizeHandle(h).ok, h).toBe(false)
    }
  })
})

describe('normalizeEmail', () => {
  it('lowercases the domain and leaves the local part alone', () => {
    expect(normalizeEmail('Tal@Example.COM')).toEqual({ ok: true, email: 'Tal@example.com' })
  })

  it('still matches those two as one address', () => {
    expect(emailKey('Tal@Example.COM')).toBe(emailKey('tal@example.com'))
  })

  it.each(['', 'nope', 'a@b', 'a@b.', '@example.com', 'a b@example.com', 'a@ex ample.com'])(
    'rejects %s',
    (input) => {
      expect(normalizeEmail(input).ok).toBe(false)
    },
  )

  it('accepts the ordinary shapes', () => {
    for (const e of ['a@b.co', 'first.last@sub.example.org', 'x+tag@example.com']) {
      expect(normalizeEmail(e).ok, e).toBe(true)
    }
  })
})
