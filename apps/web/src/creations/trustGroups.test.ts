/**
 * The tally is the one line most residents will read, so it is tested against
 * real parsed manifests rather than hand-built objects: a shape the validator
 * would reject is a shape this function will never see.
 */

import { describe, expect, it } from 'vitest'
import { parseManifest, type Manifest } from '@townsquare/manifest'
import { summariseTrust } from './trustGroups.js'

function manifest(overrides: Record<string, unknown>): Manifest {
  const parsed = parseManifest({
    manifest_version: 1,
    sdk: 1,
    name: 'Bona Dea Trail Report',
    tagline: 'Which loops are still mud this morning',
    description: 'Trail conditions around the Bona Dea sanctuary, reported by whoever walked them.',
    version: '1.0.0',
    entry: 'index.html',
    icon: 'icon.svg',
    ...overrides,
  })
  if (!parsed.ok) throw new Error(`fixture is not a valid manifest: ${JSON.stringify(parsed.issues)}`)
  return parsed.manifest
}

describe('summariseTrust', () => {
  it('says nothing leaves when nothing does, and offers no way out because none is needed', () => {
    const summary = summariseTrust(manifest({ permissions: { storage: true } }))

    expect(summary.tone).toBe('calm')
    expect(summary.tally).toBe('Nothing here leaves the visit or leaves town.')
    expect(summary.counsel).toBe(false)
    // Everything a boring creation does is background, so there is exactly one
    // group and the terracotta rule never appears.
    expect(summary.groups.map((g) => g.title)).toEqual(['Background'])
  })

  it('counts a single outside host as one thing that leaves town', () => {
    const summary = summariseTrust(
      manifest({ permissions: { network: ['tile.openstreetmap.org'] } }),
    )

    expect(summary.tone).toBe('notable')
    expect(summary.tally).toBe('One thing here leaves town. It is marked.')
    expect(summary.groups.map((g) => g.title)).toEqual(['Leaves town', 'Background'])
  })

  it('counts record types, not the sentence describing them', () => {
    // `describeManifest` folds both types into one line. Counting lines would
    // say "one thing" about a creation that posts two different kinds of
    // record under a resident's name.
    const summary = summariseTrust(
      manifest({
        permissions: { write: ['trail_report', 'trail_closure'], read: ['trail_report', 'trail_closure'] },
        defines: [
          {
            type: 'trail_report',
            label: 'Trail report',
            schema: { loop: { type: 'string', required: true } },
          },
          {
            type: 'trail_closure',
            label: 'Trail closure',
            schema: { loop: { type: 'string', required: true } },
          },
        ],
      }),
    )

    expect(summary.tally).toBe('Two things here outlive the visit. They are marked.')
    expect(summary.groups[0]?.title).toBe('Leaves the visit')
  })

  it('gets heavier at three, and earns a way out rather than a warning colour', () => {
    const summary = summariseTrust(
      manifest({
        permissions: {
          write: ['trail_report'],
          read: ['trail_report'],
          network: ['api.mapbox.com', 'hooks.zapier.com'],
        },
        defines: [
          {
            type: 'trail_report',
            label: 'Trail report',
            schema: { loop: { type: 'string', required: true } },
          },
        ],
      }),
    )

    expect(summary.tone).toBe('heavy')
    expect(summary.tally).toBe(
      'Three things here outlive the visit, and two of them leave town. That is more than most.',
    )
    expect(summary.counsel).toBe(true)
  })

  it('never invents a group, and never drops a line', () => {
    const summary = summariseTrust(
      manifest({ permissions: { identity: 'handle', storage: true, network: ['water.weather.gov'] } }),
    )

    // Every group carries at least one line, and every line lands in exactly
    // one group: a trust page that quietly omits a capability is worse than no
    // trust page at all.
    for (const group of summary.groups) expect(group.lines.length).toBeGreaterThan(0)
    const kinds = summary.groups.flatMap((g) => g.lines.map((l) => l.kind))
    expect(new Set(kinds).size).toBe(kinds.length)
    expect(kinds).toContain('identity')
    expect(kinds).toContain('storage')
    expect(kinds).toContain('network')
    expect(kinds).toContain('reads_town')
  })
})
