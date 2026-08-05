import { describe, expect, it } from 'vitest'
import { FOCUSABLE, acceptsScrimDismiss, wrapFocus } from './focusTrap.js'

describe('trapping Tab inside a dialog', () => {
  it('lets the browser handle every step that stays inside', () => {
    // Intercepting all of them means reimplementing focus order, and the
    // browser is better at that than we are.
    expect(wrapFocus({ count: 4, current: 1, shiftKey: false })).toBeNull()
    expect(wrapFocus({ count: 4, current: 2, shiftKey: true })).toBeNull()
  })

  it('wraps forward off the last element to the first', () => {
    expect(wrapFocus({ count: 4, current: 3, shiftKey: false })).toBe(0)
  })

  it('wraps backward off the first element to the last', () => {
    expect(wrapFocus({ count: 4, current: 0, shiftKey: true })).toBe(3)
  })

  it('sends Shift+Tab from the heading to the end of the dialog', () => {
    // Focus lands on the heading on open, and the heading is not a tab stop.
    // Backwards from there has to stay inside, so it goes to the last control.
    expect(wrapFocus({ count: 3, current: -1, shiftKey: true })).toBe(2)
  })

  it('does nothing at all in a dialog with nothing to focus', () => {
    expect(wrapFocus({ count: 0, current: -1, shiftKey: false })).toBeNull()
    expect(wrapFocus({ count: 0, current: -1, shiftKey: true })).toBeNull()
  })

  it('handles a dialog with a single control without bouncing focus off it', () => {
    expect(wrapFocus({ count: 1, current: 0, shiftKey: false })).toBe(0)
    expect(wrapFocus({ count: 1, current: 0, shiftKey: true })).toBe(0)
  })
})

describe('the focusable selector', () => {
  it('excludes tabindex -1, which the heading uses to be focusable but not a stop', () => {
    expect(FOCUSABLE).toContain('[tabindex]:not([tabindex="-1"])')
  })

  it('skips disabled controls, which cannot take focus anyway', () => {
    expect(FOCUSABLE).toContain('button:not([disabled])')
    expect(FOCUSABLE).toContain('input:not([disabled])')
  })
})

describe('dismissing by tapping the scrim', () => {
  it('closes an informational sheet', () => {
    expect(acceptsScrimDismiss('sheet')).toBe(true)
  })

  it('does not answer a confirm for you, because a thumb is not an answer', () => {
    expect(acceptsScrimDismiss('confirm')).toBe(false)
    expect(acceptsScrimDismiss('alert')).toBe(false)
  })
})
