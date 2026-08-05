import { describe, expect, it } from 'vitest'
import { availabilityFor, PUBLISH_GATES, resolveGate, routeFor } from './policy.js'
import { CONTRIBUTION_TYPES } from './model.js'

describe('the publish gate matrix', () => {
  it('has a row for every type the chooser offers, and no others', () => {
    expect(Object.keys(PUBLISH_GATES).sort()).toEqual([...CONTRIBUTION_TYPES].sort())
  })

  it('reads as the design specifies it', () => {
    // This is the matrix, asserted rather than described. If somebody changes
    // the policy, they change it here as well and the change is visible in a
    // diff instead of buried in a branch three files away.
    const summary = CONTRIBUTION_TYPES.map((type) => {
      const gate = PUBLISH_GATES[type]
      return [type, gate.standing, gate.route, gate.countsTowardPause]
    })
    expect(summary).toEqual([
      ['event', 'verified', 'immediate', true],
      ['correction', 'verified', 'owner_then_moderator', false],
      ['notice', 'organisation', 'immediate', true],
      ['collection', 'verified', 'immediate', true],
      ['photo', 'verified', 'immediate', true],
    ])
  })

  it('sends only an urgent notice to a human', () => {
    const route = (severity: 'notice' | 'time_sensitive' | 'urgent') =>
      resolveGate('notice', {
        kind: 'notice',
        title: 't',
        body: 'b',
        severity,
        publishAt: null,
      }).route

    expect(route('notice')).toBe('immediate')
    expect(route('time_sensitive')).toBe('immediate')
    expect(route('urgent')).toBe('moderator')
  })

  it('defaults a notice with no severity to the quiet route, never the loud one', () => {
    expect(resolveGate('notice', null).route).toBe('immediate')
  })

  it('routes a correction to the owner only when somebody has claimed the listing', () => {
    const gate = PUBLISH_GATES['correction']
    expect(routeFor(gate, false)).toBe('moderator')
    expect(routeFor(gate, true)).toBe('owner')
  })

  it('exempts corrections from the pause, and nothing else', () => {
    const exempt = CONTRIBUTION_TYPES.filter((t) => !PUBLISH_GATES[t].countsTowardPause)
    expect(exempt).toEqual(['correction'])
  })
})

describe('what the chooser shows', () => {
  it('shows every type to an unverified resident, and says which ones would be held', () => {
    const rows = availabilityFor({ verified: false }, 0)
    const byType = Object.fromEntries(rows.map((r) => [r.type, r.ifUsed]))

    // Held, not refused: the work is kept and posts when the vouches land.
    expect(byType['event']).toBe('hold')
    expect(byType['collection']).toBe('hold')
    // Waiting does not make somebody an organisation, so this one is refused.
    expect(byType['notice']).toBe('refuse')
    // And this one has nowhere to put the file.
    expect(byType['photo']).toBe('unavailable')
  })

  it('opens the notice row once a resident is attached to an organisation', () => {
    const locked = availabilityFor({ verified: true }, 0).find((r) => r.type === 'notice')
    const open = availabilityFor({ verified: true }, 1).find((r) => r.type === 'notice')
    expect(locked?.allowed).toBe(false)
    expect(open?.allowed).toBe(true)
  })

  it('tells a verified resident which types go straight up and which are read first', () => {
    const rows = availabilityFor({ verified: true }, 0)
    const byType = Object.fromEntries(rows.map((r) => [r.type, r.ifUsed]))
    expect(byType['event']).toBe('publish')
    expect(byType['correction']).toBe('review')
  })
})
