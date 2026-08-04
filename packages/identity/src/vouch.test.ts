import { describe, expect, it } from 'vitest'
import { canVouch, vouchBudget, VOUCH_DEFAULT_BUDGET, type VouchLike } from './vouch.js'

const DAY = 24 * 60 * 60 * 1000
const NOW = 1_800_000_000_000

function issued(n: number, ageDays: number, revoked = false): VouchLike[] {
  return Array.from({ length: n }, (_, i) => ({
    voucherId: 'me',
    voucheeId: `them-${ageDays}-${i}`,
    createdAt: NOW - ageDays * DAY,
    revokedAt: revoked ? NOW - 1 : null,
  }))
}

describe('vouchBudget', () => {
  it('starts at the global default', () => {
    expect(vouchBudget([], { now: NOW })).toMatchObject({
      budget: VOUCH_DEFAULT_BUDGET,
      used: 0,
      available: VOUCH_DEFAULT_BUDGET,
      nextReplenishAt: null,
    })
  })

  it('counts only vouches inside the window', () => {
    const budget = vouchBudget([...issued(3, 10), ...issued(4, 200)], { now: NOW })
    expect(budget.used).toBe(3)
    expect(budget.available).toBe(VOUCH_DEFAULT_BUDGET - 3)
  })

  it('refunds a revoked vouch, so withdrawing one is not punished', () => {
    expect(vouchBudget(issued(5, 10, true), { now: NOW }).used).toBe(0)
  })

  it('replenishes because time passed, with no job to run', () => {
    const vouches = issued(2, 89)
    expect(vouchBudget(vouches, { now: NOW }).used).toBe(2)
    expect(vouchBudget(vouches, { now: NOW + 2 * DAY }).used).toBe(0)
  })

  it('reports when the next one comes back', () => {
    const budget = vouchBudget([...issued(1, 80), ...issued(1, 20)], { now: NOW })
    expect(budget.nextReplenishAt).toBe(NOW - 80 * DAY + 90 * DAY)
  })

  it('honours a per-user override', () => {
    expect(vouchBudget(issued(3, 1), { now: NOW, override: 2 }).available).toBe(0)
  })
})

describe('canVouch', () => {
  const voucher = { id: 'me', verifiedResident: true, vouchBudgetOverride: null }
  const vouchee = { id: 'them', verifiedResident: false, emailConfirmed: true }

  it('allows a verified resident with budget left', () => {
    expect(canVouch(voucher, vouchee, [], { now: NOW }).ok).toBe(true)
  })

  it('refuses an unverified voucher, which is what keeps the chain closed', () => {
    const result = canVouch({ ...voucher, verifiedResident: false }, vouchee, [], { now: NOW })
    expect(result).toMatchObject({ ok: false, refusal: 'not_verified' })
  })

  it('refuses self-vouching', () => {
    expect(canVouch(voucher, { ...vouchee, id: 'me' }, [], { now: NOW })).toMatchObject({
      ok: false,
      refusal: 'self',
    })
  })

  it('refuses a second vouch for the same person', () => {
    const existing: VouchLike[] = [
      { voucherId: 'me', voucheeId: 'them', createdAt: NOW - DAY, revokedAt: null },
    ]
    expect(canVouch(voucher, vouchee, existing, { now: NOW })).toMatchObject({
      ok: false,
      refusal: 'already_vouched',
    })
  })

  it('refuses when the budget is spent, and allows again once it rolls off', () => {
    const spent = issued(10, 30)
    expect(canVouch(voucher, vouchee, spent, { now: NOW })).toMatchObject({
      ok: false,
      refusal: 'budget_exhausted',
    })
    expect(canVouch(voucher, vouchee, spent, { now: NOW + 61 * DAY }).ok).toBe(true)
  })

  it('does nothing for someone already verified', () => {
    expect(canVouch(voucher, { ...vouchee, verifiedResident: true }, [], { now: NOW })).toMatchObject(
      { ok: false, refusal: 'already_verified' },
    )
  })
})
