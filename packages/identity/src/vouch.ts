/**
 * Vouch budget: a rolling window, computed on read.
 *
 * Available = budget minus the vouches you issued inside the window that still
 * stand. Replenishment therefore happens because time passed, not because a
 * job ran — there is no scheduler to fail quietly and no `remaining` column to
 * drift out of agreement with the vouch rows themselves.
 *
 * Revoked vouches are refunded, which is a deliberate choice and not an
 * oversight. Charging someone for a vouch they withdrew punishes exactly the
 * correction the moderation model wants people to make.
 */

export const VOUCH_DEFAULT_BUDGET = 10
export const VOUCH_WINDOW_DAYS = 90

export interface VouchLike {
  voucherId: string
  voucheeId: string
  createdAt: number
  revokedAt: number | null
}

export interface VouchBudget {
  budget: number
  used: number
  available: number
  windowDays: number
  /** When the oldest counted vouch falls out of the window, or null if none. */
  nextReplenishAt: number | null
}

export function vouchBudget(
  issued: readonly VouchLike[],
  opts: { now: number; override?: number | null; windowDays?: number },
): VouchBudget {
  const windowDays = opts.windowDays ?? VOUCH_WINDOW_DAYS
  const windowMs = windowDays * 24 * 60 * 60 * 1000
  const cutoff = opts.now - windowMs
  const budget = opts.override ?? VOUCH_DEFAULT_BUDGET

  const counted = issued.filter((v) => v.revokedAt === null && v.createdAt > cutoff)
  const oldest = counted.reduce<number | null>(
    (min, v) => (min === null || v.createdAt < min ? v.createdAt : min),
    null,
  )

  return {
    budget,
    used: counted.length,
    available: Math.max(0, budget - counted.length),
    windowDays,
    nextReplenishAt: oldest === null ? null : oldest + windowMs,
  }
}

export type VouchRefusal =
  | 'not_verified'
  | 'self'
  | 'already_vouched'
  | 'already_verified'
  | 'budget_exhausted'

export interface VoucherState {
  id: string
  verifiedResident: boolean
  vouchBudgetOverride: number | null
}

export interface VoucheeState {
  id: string
  verifiedResident: boolean
  emailConfirmed: boolean
}

export type VouchDecision =
  | { ok: true; budget: VouchBudget }
  | { ok: false; refusal: VouchRefusal; message: string }

/**
 * The whole vouch policy, in one pure function.
 *
 * Separated from storage so the rules can be read, tested and argued about
 * without a database, and so the API route reads as "decide, then write"
 * rather than interleaving the two.
 */
export function canVouch(
  voucher: VoucherState,
  vouchee: VoucheeState,
  issued: readonly VouchLike[],
  opts: { now: number; windowDays?: number },
): VouchDecision {
  if (!voucher.verifiedResident) {
    return {
      ok: false,
      refusal: 'not_verified',
      message: 'Only a verified resident can vouch for someone.',
    }
  }
  if (voucher.id === vouchee.id) {
    return { ok: false, refusal: 'self', message: 'You cannot vouch for yourself.' }
  }
  if (vouchee.verifiedResident) {
    return {
      ok: false,
      refusal: 'already_verified',
      message: 'They are already a verified resident.',
    }
  }
  if (issued.some((v) => v.voucheeId === vouchee.id && v.revokedAt === null)) {
    return { ok: false, refusal: 'already_vouched', message: 'You have already vouched for them.' }
  }

  const budget = vouchBudget(issued, {
    now: opts.now,
    override: voucher.vouchBudgetOverride,
    ...(opts.windowDays === undefined ? {} : { windowDays: opts.windowDays }),
  })
  if (budget.available <= 0) {
    return {
      ok: false,
      refusal: 'budget_exhausted',
      message: `You have used all ${budget.budget} vouches in the last ${budget.windowDays} days.`,
    }
  }

  return { ok: true, budget }
}
