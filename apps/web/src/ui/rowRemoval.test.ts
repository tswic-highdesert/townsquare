import { describe, expect, it } from 'vitest'
import { nextFocusAfterRemoval, removalAnnouncement } from './rowRemoval.js'

describe('focus after a row removes itself', () => {
  /**
   * The failure this prevents: the pressed button stops existing, focus falls
   * to `<body>`, and a keyboard user is silently returned to the top of the
   * page. Nothing throws and a screenshot looks fine.
   */
  it('lands on the row that took the removed row’s place', () => {
    expect(nextFocusAfterRemoval({ count: 4, removed: 1 })).toEqual({ kind: 'row', index: 1 })
    expect(nextFocusAfterRemoval({ count: 4, removed: 0 })).toEqual({ kind: 'row', index: 0 })
  })

  it('steps back when the last row goes, because nothing took its place', () => {
    expect(nextFocusAfterRemoval({ count: 4, removed: 3 })).toEqual({ kind: 'row', index: 2 })
  })

  it('hands focus to the list when the last remaining row goes', () => {
    // There is no row left to hold it, and `<body>` is not an answer.
    expect(nextFocusAfterRemoval({ count: 1, removed: 0 })).toEqual({ kind: 'list' })
  })

  it('never points past the end, even given a stale index', () => {
    // A removal computed against an out-of-date render would otherwise send
    // focus to a row that does not exist, which is the same bug again.
    expect(nextFocusAfterRemoval({ count: 3, removed: 9 })).toEqual({ kind: 'row', index: 1 })
    expect(nextFocusAfterRemoval({ count: 3, removed: -2 })).toEqual({ kind: 'row', index: 0 })
  })

  it('treats an empty list as having nowhere to go rather than throwing', () => {
    expect(nextFocusAfterRemoval({ count: 0, removed: 0 })).toEqual({ kind: 'list' })
  })
})

describe('what is announced', () => {
  it('names the thing and says what is left', () => {
    expect(removalAnnouncement('Feltner’s Whatta-Burger', 3)).toBe(
      'Feltner’s Whatta-Burger removed. 3 items left.',
    )
  })

  it('gets the singular right, because "1 items left" reads as a bug', () => {
    expect(removalAnnouncement('Plant Parlor', 1)).toBe('Plant Parlor removed. 1 item left.')
  })

  it('says the list is empty rather than saying zero', () => {
    expect(removalAnnouncement('Plant Parlor', 0)).toBe(
      'Plant Parlor removed. Nothing left in this list.',
    )
  })
})
