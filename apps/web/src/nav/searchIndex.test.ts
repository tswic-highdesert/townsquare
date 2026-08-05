/**
 * Search, as a pure function.
 *
 * This is the half of the omni field that decides what a resident sees, and it
 * runs on the device for the same reason Nearby's ranking does. Tested here
 * rather than through a component, because the properties that matter — what
 * outranks what, whether two words narrow or widen, whether the same shop can
 * appear twice — are properties of the ranking and not of the markup.
 */

import { describe, expect, it } from 'vitest'
import {
  PER_GROUP,
  mergeDocs,
  pushRecent,
  scoreDoc,
  searchTown,
  suggestions,
  terms,
  type SearchDoc,
  type SearchKind,
} from './searchIndex.js'

function doc(over: Partial<SearchDoc> & Pick<SearchDoc, 'id' | 'title'>): SearchDoc {
  return { kind: 'place', detail: '', href: null, ...over }
}

describe('terms', () => {
  it('splits on anything that is not a letter or a number', () => {
    expect(terms("Fat Daddy's Bar-B-Que")).toEqual(['fat', 'daddy', 's', 'bar', 'b', 'que'])
  })

  it('is empty for a query of only punctuation', () => {
    expect(terms('   ...  ')).toEqual([])
  })
})

describe('scoreDoc', () => {
  const oldSouth = doc({ id: 'a', title: 'Old South Restaurant', detail: 'Diner · 1330 E Main St' })
  const goldfinch = doc({ id: 'b', title: 'Goldfinch Antiques', detail: 'Antiques · Union St' })

  it('ranks a word start above a match buried inside a word', () => {
    // "old" is the whole first word of one and three letters inside the other.
    // A resident typing "old" means Old South, every time.
    expect(scoreDoc(oldSouth, ['old'])).toBeGreaterThan(scoreDoc(goldfinch, ['old']))
  })

  it('ranks the start of the title above a later word', () => {
    const later = doc({ id: 'c', title: 'The Old Post Park' })
    expect(scoreDoc(oldSouth, ['old'])).toBeGreaterThan(scoreDoc(later, ['old']))
  })

  it('ranks a title match above the same word in the detail', () => {
    const inDetail = doc({ id: 'd', title: 'Bost Chiropractic', detail: 'Clinic · Old Post Rd' })
    expect(scoreDoc(oldSouth, ['old'])).toBeGreaterThan(scoreDoc(inDetail, ['old']))
  })

  it('requires every term to land somewhere', () => {
    // Two words narrow. An OR here would hand back every "old" in town the
    // moment a resident added a second word to cut the list down.
    expect(scoreDoc(oldSouth, ['old', 'south'])).toBeGreaterThan(0)
    expect(scoreDoc(oldSouth, ['old', 'kayak'])).toBe(0)
  })

  it('finds a place by its street, which is only in the detail', () => {
    expect(scoreDoc(oldSouth, ['main'])).toBeGreaterThan(0)
  })

  it('scores nothing for an empty query', () => {
    expect(scoreDoc(oldSouth, [])).toBe(0)
  })
})

describe('searchTown', () => {
  const docs: SearchDoc[] = [
    doc({ kind: 'story', id: 's1', title: 'River level holds steady', detail: 'The Courier' }),
    doc({ kind: 'story', id: 's2', title: 'Dardanelle lock reopens', detail: 'The Courier · river' }),
    doc({ kind: 'event', id: 'e1', title: 'River cleanup, Old Post Park', detail: '8:00am' }),
    doc({ kind: 'place', id: 'p1', title: 'River Valley Cycling', detail: '300 W Main St' }),
    doc({ kind: 'place', id: 'p2', title: 'River Valley Music', detail: '118 S Arkansas Ave' }),
    doc({ kind: 'place', id: 'p3', title: 'Riverbend Roof', detail: 'N El Paso Ave' }),
    doc({ kind: 'place', id: 'p4', title: 'Riverside Auto', detail: 'Weir Rd' }),
    doc({ kind: 'creation', id: 'lake', title: 'Lake level, live', detail: 'river gauge', slug: 'lake' }),
  ]

  it('returns nothing at all for an empty query', () => {
    expect(searchTown(docs, '')).toEqual([])
    expect(searchTown(docs, '   ')).toEqual([])
  })

  it('groups by kind and counts everything that matched', () => {
    const groups = searchTown(docs, 'river')
    const places = groups.find((g) => g.kind === 'place')
    expect(places?.total).toBe(4)
  })

  it('caps a group at three rows while still counting the rest', () => {
    const places = searchTown(docs, 'river').find((g) => g.kind === 'place')
    expect(places?.hits).toHaveLength(PER_GROUP)
    expect(places?.total).toBeGreaterThan(PER_GROUP)
  })

  it('shows every row of the one group a resident expanded', () => {
    const places = searchTown(docs, 'river', 'place').find((g) => g.kind === 'place')
    expect(places?.hits).toHaveLength(4)
  })

  it('leaves the other groups capped when one is expanded', () => {
    const groups = searchTown(docs, 'river', 'place')
    for (const group of groups) {
      if (group.kind !== 'place') expect(group.hits.length).toBeLessThanOrEqual(PER_GROUP)
    }
  })

  it('orders groups by their best match rather than by a fixed hierarchy', () => {
    // "cleanup" only exists on an event, so Events leads even though stories
    // come first in the fallback order.
    expect(searchTown(docs, 'cleanup')[0]?.kind).toBe('event')
    // "lock" only exists on a story, and the same field puts Stories first.
    expect(searchTown(docs, 'lock')[0]?.kind).toBe('story')
  })

  it('omits a group with nothing in it rather than showing it empty', () => {
    const kinds = searchTown(docs, 'cleanup').map((g) => g.kind)
    expect(kinds).toEqual(['event'])
  })

  it('finds nothing for a thing the town does not have', () => {
    expect(searchTown(docs, 'kayak rental')).toEqual([])
  })

  it('never returns a People group, because there is no source for one', () => {
    const kinds = new Set<SearchKind>()
    for (const query of ['river', 'lake', 'valley', 'courier']) {
      for (const group of searchTown(docs, query)) kinds.add(group.kind)
    }
    expect(kinds.has('story')).toBe(true)
    expect([...kinds].every((k) => ['story', 'event', 'place', 'creation'].includes(k))).toBe(true)
  })
})

describe('mergeDocs', () => {
  it('keeps the first record of a thing and drops the later duplicate', () => {
    // Today's directory is a rotating handful of the same businesses Nearby
    // holds 741 of. The same shop listed twice reads as us not knowing our own
    // town, so the richer record is passed first and wins.
    const rich = doc({ id: 'p1', title: 'Old South Restaurant', detail: 'Diner · 1330 E Main St' })
    const thin = doc({ id: 'p1', title: 'Old South Restaurant', detail: 'Diner' })
    const merged = mergeDocs([rich], [thin])
    expect(merged).toHaveLength(1)
    expect(merged[0]?.detail).toBe('Diner · 1330 E Main St')
  })

  it('does not collide two kinds that happen to share an id', () => {
    const a = doc({ kind: 'story', id: 'x', title: 'A story' })
    const b = doc({ kind: 'place', id: 'x', title: 'A place' })
    expect(mergeDocs([a], [b])).toHaveLength(2)
  })
})

describe('suggestions', () => {
  it('takes one real thing per kind rather than inventing a query', () => {
    const docs = [
      doc({ kind: 'story', id: 's1', title: 'Dardanelle lock reopens' }),
      doc({ kind: 'event', id: 'e1', title: 'Pope County farmers market' }),
      doc({ kind: 'place', id: 'p1', title: 'Old South Restaurant' }),
      doc({ kind: 'place', id: 'p2', title: 'River Valley Music' }),
    ]
    expect(suggestions(docs).map((d) => d.title)).toEqual([
      'Pope County farmers market',
      'Dardanelle lock reopens',
      'Old South Restaurant',
    ])
  })

  it('offers fewer than three on a quiet day rather than padding', () => {
    expect(suggestions([doc({ kind: 'story', id: 's1', title: 'The only story' })])).toHaveLength(1)
  })
})

describe('pushRecent', () => {
  it('puts the newest first and does not repeat a query', () => {
    const after = pushRecent('old south', ['brush pickup', 'old south'])
    expect(after).toEqual(['old south', 'brush pickup'])
  })

  it('ignores a query that is only whitespace', () => {
    expect(pushRecent('   ', ['brush pickup'])).toEqual(['brush pickup'])
  })

  it('keeps at most five', () => {
    const five = ['a', 'b', 'c', 'd', 'e']
    expect(pushRecent('f', five)).toEqual(['f', 'a', 'b', 'c', 'd'])
  })
})
