import { describe, expect, it } from 'vitest'
import {
  MAX_VISIBLE,
  announce,
  dismissToast,
  pushToast,
  toastDuration,
  toastText,
  type Toast,
} from './toastQueue.js'

function toast(over: Partial<Toast> & Pick<Toast, 'id' | 'kind' | 'message'>): Toast {
  return { count: 1, ...over }
}

describe('how long a toast waits', () => {
  it('gives an undoable toast time to be undone', () => {
    // The whole reason undo exists is that somebody notices the mistake a
    // beat after making it. Four seconds is not that beat.
    expect(toastDuration('info', false)).toBe(4000)
    expect(toastDuration('info', true)).toBe(8000)
    expect(toastDuration('good', true)).toBe(8000)
  })

  it('never dismisses a problem, because it is waiting on a decision', () => {
    expect(toastDuration('problem', true)).toBe(0)
    expect(toastDuration('problem', false)).toBe(0)
  })

  it('gives a warning a second look', () => {
    expect(toastDuration('warn', false)).toBe(10_000)
  })
})

describe('stacking', () => {
  it('puts the newest at the end, where the eye already is', () => {
    const list = pushToast(
      pushToast([], toast({ id: 'a', kind: 'info', message: 'Saved.' })),
      toast({ id: 'b', kind: 'good', message: 'Published.' }),
    )
    expect(list.map((t) => t.id)).toEqual(['a', 'b'])
  })

  it('holds three and pushes the oldest out on the fourth', () => {
    let list: Toast[] = []
    for (const id of ['a', 'b', 'c', 'd']) {
      list = pushToast(list, toast({ id, kind: 'info', message: `msg ${id}` }))
    }
    expect(list).toHaveLength(MAX_VISIBLE)
    expect(list.map((t) => t.id)).toEqual(['b', 'c', 'd'])
  })

  it('never evicts the problem toast to make room for a confirmation', () => {
    let list = pushToast([], toast({ id: 'p', kind: 'problem', message: "Couldn't remove that." }))
    for (const id of ['a', 'b', 'c']) {
      list = pushToast(list, toast({ id, kind: 'info', message: `msg ${id}` }))
    }
    expect(list.map((t) => t.id)).toContain('p')
    expect(list).toHaveLength(MAX_VISIBLE)
    // The oldest *dismissible* one went instead.
    expect(list.map((t) => t.id)).toEqual(['p', 'b', 'c'])
  })

  it('collapses an identical toast into a count rather than repeating it', () => {
    let list = pushToast([], toast({ id: 'a', kind: 'info', message: 'Saved to your list.' }))
    list = pushToast(list, toast({ id: 'b', kind: 'info', message: 'Saved to your list.' }))
    list = pushToast(list, toast({ id: 'c', kind: 'info', message: 'Saved to your list.' }))
    expect(list).toHaveLength(1)
    expect(list[0]!.count).toBe(3)
  })

  it('does not collapse two different messages of the same kind', () => {
    let list = pushToast([], toast({ id: 'a', kind: 'info', message: 'Saved to your list.' }))
    list = pushToast(list, toast({ id: 'b', kind: 'info', message: 'Removed from your list.' }))
    expect(list).toHaveLength(2)
  })

  it('moves a repeat to the end so its timer restarts in a fresh position', () => {
    let list = pushToast([], toast({ id: 'a', kind: 'info', message: 'Saved.' }))
    list = pushToast(list, toast({ id: 'b', kind: 'good', message: 'Published.' }))
    list = pushToast(list, toast({ id: 'c', kind: 'info', message: 'Saved.' }))
    expect(list.map((t) => t.id)).toEqual(['b', 'a'])
    expect(list[1]!.count).toBe(2)
  })
})

describe('dismissal', () => {
  it('removes only the one asked for', () => {
    const list = [
      toast({ id: 'a', kind: 'info', message: 'a' }),
      toast({ id: 'b', kind: 'info', message: 'b' }),
    ]
    expect(dismissToast(list, 'a').map((t) => t.id)).toEqual(['b'])
  })

  it('is a no-op for an id that already left', () => {
    const list = [toast({ id: 'a', kind: 'info', message: 'a' })]
    expect(dismissToast(dismissToast(list, 'a'), 'a')).toEqual([])
  })
})

describe('what the toast says once it has collapsed', () => {
  it('uses the caller\'s plural when there is one', () => {
    const t = toast({
      id: 'a',
      kind: 'info',
      message: 'Saved to your list.',
      count: 3,
      plural: (n) => `${n} stories saved.`,
    })
    expect(toastText(t)).toBe('3 stories saved.')
  })

  it('falls back to a tally rather than lying about the sentence', () => {
    const t = toast({ id: 'a', kind: 'warn', message: 'A photo was skipped.', count: 2 })
    expect(toastText(t)).toBe('A photo was skipped. (2)')
  })

  it('announces exactly what is on screen', () => {
    const t = toast({ id: 'a', kind: 'info', message: 'Saved to your list.' })
    expect(announce(t)).toBe('Saved to your list.')
  })
})
