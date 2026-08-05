import { describe, expect, it } from 'vitest'
import { canStep, clampStep } from './stepper.js'

const bounds = { min: 1, max: 12 }

describe('stepping within bounds', () => {
  it('moves by one in each direction', () => {
    expect(clampStep(6, 1, bounds)).toBe(7)
    expect(clampStep(6, -1, bounds)).toBe(5)
  })

  it('stops at the ceiling instead of going past it', () => {
    expect(clampStep(12, 1, bounds)).toBe(12)
  })

  it('stops at the floor instead of going below it', () => {
    expect(clampStep(1, -1, bounds)).toBe(1)
  })

  it('honours a step size larger than one, and still clamps', () => {
    expect(clampStep(6, 1, { min: 0, max: 20, step: 5 })).toBe(11)
    expect(clampStep(18, 1, { min: 0, max: 20, step: 5 })).toBe(20)
  })

  it('pulls a value that is already out of range back inside', () => {
    // Data changes underneath a control more often than anyone expects.
    expect(clampStep(40, 1, bounds)).toBe(12)
    expect(clampStep(-3, -1, bounds)).toBe(1)
  })
})

describe('which button is still live', () => {
  it('disables minus at the floor and plus at the ceiling', () => {
    expect(canStep(1, -1, bounds)).toBe(false)
    expect(canStep(1, 1, bounds)).toBe(true)
    expect(canStep(12, 1, bounds)).toBe(false)
    expect(canStep(12, -1, bounds)).toBe(true)
  })

  it('disables both when the range is a single value', () => {
    expect(canStep(3, 1, { min: 3, max: 3 })).toBe(false)
    expect(canStep(3, -1, { min: 3, max: 3 })).toBe(false)
  })
})
