/**
 * The identity rules, run against the real memory store rather than mocks.
 *
 * Mocks in an authentication test agree with whatever the code does, which is
 * the one property you do not want here. The memory store enforces expiry,
 * single use and case-insensitive uniqueness the same way the schema does, so
 * these tests fail when a rule breaks rather than when a call count changes.
 */

import { beforeEach, describe, expect, it } from 'vitest'
import { Identity, type ChallengeDelivery } from './service.js'
import { seedCohort, parseSeedList } from './seed.js'
import { MemoryIdentityStore } from './store.js'

const HOUR = 60 * 60 * 1000
const DAY = 24 * HOUR

class CapturingDelivery implements ChallengeDelivery {
  sent: Array<{ email: string; purpose: string; token: string }> = []
  async deliver(input: { email: string; purpose: string; token: string }): Promise<void> {
    this.sent.push({ email: input.email, purpose: input.purpose, token: input.token })
  }
  get last() {
    return this.sent[this.sent.length - 1]
  }
}

let store: MemoryIdentityStore
let delivery: CapturingDelivery
let now: number
let identity: Identity

beforeEach(() => {
  store = new MemoryIdentityStore()
  delivery = new CapturingDelivery()
  now = 1_800_000_000_000
  identity = new Identity({ store, delivery, now: () => now })
})

async function signUpAndConfirm(handle: string, email: string) {
  await identity.signUp({ handle, email })
  const token = delivery.last!.token
  const result = await identity.confirmChallenge(token)
  if (!result.ok) throw new Error('confirm failed')
  return result
}

describe('signing up', () => {
  it('creates an unconfirmed account and sends one confirmation', async () => {
    expect(await identity.signUp({ handle: 'tswic', email: 'tal@example.com' })).toEqual({
      ok: true,
      sent: true,
    })
    expect(delivery.sent).toHaveLength(1)
    expect(delivery.last).toMatchObject({ email: 'tal@example.com', purpose: 'confirm' })

    const user = await store.userByHandle('tswic')
    expect(user).toMatchObject({ emailConfirmed: false, verifiedResident: false, role: 'user' })
  })

  it('says plainly when a handle is taken, because handles are public', async () => {
    await identity.signUp({ handle: 'tswic', email: 'tal@example.com' })
    expect(await identity.signUp({ handle: 'TSwic', email: 'other@example.com' })).toMatchObject({
      ok: false,
      code: 'handle_taken',
    })
  })

  it('never reveals that an email is already registered', async () => {
    await signUpAndConfirm('tswic', 'tal@example.com')
    delivery.sent = []

    const again = await identity.signUp({ handle: 'someone-else', email: 'TAL@example.com' })

    // Same answer a stranger would get for an unknown address, and the person
    // who actually owns the inbox still gets in.
    expect(again).toEqual({ ok: true, sent: true })
    expect(delivery.last).toMatchObject({ purpose: 'signin' })
    expect(await store.userByHandle('someone-else')).toBe(null)
  })

  it('rejects a malformed handle or email before creating anything', async () => {
    expect(await identity.signUp({ handle: 'ab', email: 'tal@example.com' })).toMatchObject({
      ok: false,
      code: 'invalid',
    })
    expect(await identity.signUp({ handle: 'tswic', email: 'nope' })).toMatchObject({
      ok: false,
      code: 'invalid',
    })
    expect(delivery.sent).toHaveLength(0)
  })
})

describe('signing in', () => {
  it('answers identically for an address that has no account', async () => {
    expect(await identity.requestSignIn({ email: 'nobody@example.com' })).toEqual({
      ok: true,
      sent: true,
    })
    expect(delivery.sent).toHaveLength(0)
  })

  it('opens a session and confirms the email on first use', async () => {
    const { session, user } = await signUpAndConfirm('tswic', 'tal@example.com')
    expect(user.emailConfirmed).toBe(true)
    expect((await identity.resolveSession(session))?.handle).toBe('tswic')
  })

  it('burns the challenge on use', async () => {
    await identity.signUp({ handle: 'tswic', email: 'tal@example.com' })
    const token = delivery.last!.token
    expect((await identity.confirmChallenge(token)).ok).toBe(true)
    expect(await identity.confirmChallenge(token)).toMatchObject({ code: 'bad_challenge' })
  })

  it('expires a challenge that sat in an inbox', async () => {
    await identity.signUp({ handle: 'tswic', email: 'tal@example.com' })
    const token = delivery.last!.token
    now += 21 * 60 * 1000
    expect(await identity.confirmChallenge(token)).toMatchObject({ code: 'bad_challenge' })
  })

  it('supersedes the previous link when a new one is asked for', async () => {
    await signUpAndConfirm('tswic', 'tal@example.com')
    await identity.requestSignIn({ email: 'tal@example.com' })
    const first = delivery.last!.token
    await identity.requestSignIn({ email: 'tal@example.com' })
    const second = delivery.last!.token

    expect(await identity.confirmChallenge(first)).toMatchObject({ code: 'bad_challenge' })
    expect((await identity.confirmChallenge(second)).ok).toBe(true)
  })

  it('gives the same message for a wrong token as for a used one', async () => {
    const wrong = await identity.confirmChallenge('x'.repeat(43))
    await identity.signUp({ handle: 'tswic', email: 'tal@example.com' })
    const token = delivery.last!.token
    await identity.confirmChallenge(token)
    const used = await identity.confirmChallenge(token)
    expect(wrong).toEqual(used)
  })

  it('rate limits challenge mail per account', async () => {
    await signUpAndConfirm('tswic', 'tal@example.com')
    for (let i = 0; i < 4; i++) {
      expect((await identity.requestSignIn({ email: 'tal@example.com' })).ok).toBe(true)
    }
    expect(await identity.requestSignIn({ email: 'tal@example.com' })).toMatchObject({
      code: 'rate_limited',
    })

    now += HOUR + 1000
    expect((await identity.requestSignIn({ email: 'tal@example.com' })).ok).toBe(true)
  })
})

describe('sessions', () => {
  it('resolves nothing for an absent, unknown or expired token', async () => {
    const { session } = await signUpAndConfirm('tswic', 'tal@example.com')
    expect(await identity.resolveSession(null)).toBe(null)
    expect(await identity.resolveSession('made-up')).toBe(null)

    now += 31 * DAY
    expect(await identity.resolveSession(session)).toBe(null)
  })

  it('signs out, which a stateless token could not do', async () => {
    const { session } = await signUpAndConfirm('tswic', 'tal@example.com')
    await identity.signOut(session)
    expect(await identity.resolveSession(session)).toBe(null)
  })

  it('signs out everywhere', async () => {
    await signUpAndConfirm('tswic', 'tal@example.com')
    await identity.requestSignIn({ email: 'tal@example.com' })
    const a = await identity.confirmChallenge(delivery.last!.token)
    await identity.requestSignIn({ email: 'tal@example.com' })
    const b = await identity.confirmChallenge(delivery.last!.token)
    if (!a.ok || !b.ok) throw new Error('setup failed')

    expect(await identity.signOutEverywhere(a.user.id)).toBe(3)
    expect(await identity.resolveSession(a.session)).toBe(null)
    expect(await identity.resolveSession(b.session)).toBe(null)
  })
})

describe('vouching', () => {
  async function seededPair() {
    const admin = await signUpAndConfirm('mayor-of-nothing', 'admin@example.com')
    await store.updateUser(admin.user.id, { role: 'admin' }, now)
    await seedCohort(store, [{ handle: 'first-resident', email: 'first@example.com' }], now)
    const first = (await store.userByHandle('first-resident'))!
    const newcomer = await signUpAndConfirm('newcomer', 'new@example.com')
    return { admin, first, newcomer }
  }

  it('verifies the vouchee immediately, by the vouch method', async () => {
    const { first, newcomer } = await seededPair()
    const result = await identity.vouchFor(first.id, 'newcomer')

    expect(result).toMatchObject({ ok: true, vouchee: { handle: 'newcomer', verified: true } })
    expect(await store.userById(newcomer.user.id)).toMatchObject({
      verifiedResident: true,
      verifiedMethod: 'vouch',
      verifiedAt: now,
    })
  })

  it('refuses an unverified voucher', async () => {
    await seededPair()
    const stranger = await signUpAndConfirm('stranger', 'stranger@example.com')
    expect(await identity.vouchFor(stranger.user.id, 'newcomer')).toMatchObject({
      ok: false,
      code: 'forbidden',
    })
  })

  it('spends budget and reports what is left', async () => {
    const { first } = await seededPair()
    const result = await identity.vouchFor(first.id, 'newcomer')
    expect(result.ok && result.budget).toMatchObject({ used: 1, available: 9 })
  })

  it('does not un-verify anyone on revoke, it flags the branch', async () => {
    const { first, newcomer } = await seededPair()
    await identity.vouchFor(first.id, 'newcomer')
    expect(await identity.revokeVouch(first.id, 'newcomer')).toMatchObject({
      ok: true,
      flagged: 'newcomer',
    })
    expect((await store.userById(newcomer.user.id))?.verifiedResident).toBe(true)
  })

  it('returns the budget when a vouch is revoked', async () => {
    const { first } = await seededPair()
    await identity.vouchFor(first.id, 'newcomer')
    await identity.revokeVouch(first.id, 'newcomer')

    const again = await signUpAndConfirm('another', 'another@example.com')
    expect(again.user.verifiedResident).toBe(false)
    const result = await identity.vouchFor(first.id, 'another')
    expect(result.ok && result.budget.used).toBe(1)
  })

  it('says nothing useful about a handle that does not exist', async () => {
    const { first } = await seededPair()
    expect(await identity.vouchFor(first.id, 'ghost')).toMatchObject({ code: 'not_found' })
  })
})

describe('manual verification', () => {
  it('is admin only', async () => {
    const admin = await signUpAndConfirm('boss', 'boss@example.com')
    const mod = await signUpAndConfirm('modsquad', 'mod@example.com')
    await signUpAndConfirm('newcomer', 'new@example.com')
    await store.updateUser(admin.user.id, { role: 'admin' }, now)
    await store.updateUser(mod.user.id, { role: 'moderator' }, now)

    expect(await identity.manualVerify(mod.user.id, 'newcomer')).toMatchObject({
      ok: false,
      code: 'forbidden',
    })
    expect(await identity.manualVerify(admin.user.id, 'newcomer')).toMatchObject({
      ok: true,
      user: { handle: 'newcomer', verified: true },
    })
  })
})

describe('the account view', () => {
  it('withholds submission until someone is both confirmed and verified', async () => {
    const { user } = await signUpAndConfirm('tswic', 'tal@example.com')
    expect(await identity.accountView(user)).toMatchObject({
      handle: 'tswic',
      emailConfirmed: true,
      verified: false,
      canSubmit: false,
      vouches: { available: 0 },
    })

    const verified = await store.updateUser(
      user.id,
      { verifiedResident: true, verifiedMethod: 'manual', verifiedAt: now },
      now,
    )
    expect(await identity.accountView(verified)).toMatchObject({
      verified: true,
      canSubmit: true,
      vouches: { available: 10, budget: 10, used: 0 },
    })
  })

  it('never carries an email', async () => {
    const { user } = await signUpAndConfirm('tswic', 'tal@example.com')
    expect(JSON.stringify(await identity.accountView(user))).not.toContain('example.com')
  })
})

describe('the seed cohort', () => {
  it('creates verified, confirmed residents', async () => {
    const outcomes = await seedCohort(
      store,
      [{ handle: 'tswic', email: 'tal@example.com', role: 'admin' }],
      now,
    )
    expect(outcomes).toEqual([{ handle: 'tswic', action: 'created' }])
    expect(await store.userByHandle('tswic')).toMatchObject({
      role: 'admin',
      emailConfirmed: true,
      verifiedResident: true,
      verifiedMethod: 'manual',
    })
  })

  it('is idempotent, and promotes an account that signed up first', async () => {
    await signUpAndConfirm('tswic', 'tal@example.com')
    const entries = [{ handle: 'tswic', email: 'tal@example.com' }]

    expect(await seedCohort(store, entries, now)).toEqual([{ handle: 'tswic', action: 'promoted' }])
    expect(await seedCohort(store, entries, now)).toEqual([{ handle: 'tswic', action: 'unchanged' }])
  })

  it('does not rewrite how an existing resident was verified', async () => {
    await signUpAndConfirm('tswic', 'tal@example.com')
    const user = (await store.userByHandle('tswic'))!
    await store.updateUser(
      user.id,
      { verifiedResident: true, verifiedMethod: 'vouch', verifiedAt: now - DAY },
      now,
    )

    await seedCohort(store, [{ handle: 'tswic', email: 'tal@example.com', role: 'admin' }], now)
    expect(await store.userByHandle('tswic')).toMatchObject({
      verifiedMethod: 'vouch',
      verifiedAt: now - DAY,
      role: 'admin',
    })
  })

  it('skips a malformed entry rather than failing the whole boot', async () => {
    const outcomes = await seedCohort(
      store,
      [
        { handle: 'ok-handle', email: 'ok@example.com' },
        { handle: 'no', email: 'bad' },
      ],
      now,
    )
    expect(outcomes.map((o) => o.action)).toEqual(['created', 'skipped'])
  })

  it('parses the environment format, roles included', () => {
    expect(parseSeedList('tswic:tal@example.com:admin, ann:ann@example.com\n\n')).toEqual([
      { handle: 'tswic', email: 'tal@example.com', role: 'admin' },
      { handle: 'ann', email: 'ann@example.com' },
    ])
    expect(parseSeedList(undefined)).toEqual([])
  })
})
