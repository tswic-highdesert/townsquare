import { describe, expect, it } from 'vitest'
import { parseManifest, type Manifest } from '@townsquare/manifest'
import { touchChips } from './touch.js'

function manifest(overrides: Record<string, unknown>): Manifest {
  const parsed = parseManifest({
    manifest_version: 1,
    sdk: 1,
    name: 'Market Table',
    tagline: 'Who is setting up Saturday on Depot Lane',
    description: 'The Saturday market on Depot Lane, stall by stall.',
    version: '1.0.0',
    entry: 'index.html',
    icon: 'icon.svg',
    ...overrides,
  })
  if (!parsed.ok) throw new Error(`fixture is not a valid manifest: ${JSON.stringify(parsed.issues)}`)
  return parsed.manifest
}

describe('touchChips', () => {
  it('states the reassuring absence rather than leaving a gap', () => {
    // A creation that touches nothing consequential still needs an answer on
    // the card. Blank space is not one.
    const chips = touchChips(manifest({ permissions: { storage: true } }))

    expect(chips[0]).toMatchObject({ kind: 'no_network', label: 'Nothing leaves town' })
    expect(chips.every((c) => !c.consequential)).toBe(true)
  })

  it('leads with what outlives the visit', () => {
    const chips = touchChips(
      manifest({
        permissions: {
          write: ['stall'],
          read: ['stall'],
          identity: 'handle',
          storage: true,
          network: ['tile.openstreetmap.org'],
        },
        defines: [
          { type: 'stall', label: 'Market stall', schema: { name: { type: 'string', required: true } } },
        ],
      }),
    )

    expect(chips.map((c) => c.kind)).toEqual(['writes', 'network', 'identity'])
    expect(chips[0]?.label).toBe('Posts market stall as you')
    expect(chips.slice(0, 2).every((c) => c.consequential)).toBe(true)
  })

  it('names one outside host and counts several, because three hostnames is not a card', () => {
    const one = touchChips(manifest({ permissions: { network: ['water.weather.gov'] } }))
    expect(one[0]?.label).toBe('water.weather.gov')

    const many = touchChips(
      manifest({ permissions: { network: ['api.mapbox.com', 'hooks.zapier.com'] } }),
    )
    expect(many[0]?.label).toBe('2 outside hosts')
  })

  it('never puts more than three on a card', () => {
    const chips = touchChips(
      manifest({
        permissions: {
          write: ['stall'],
          read: ['stall', 'vendor'],
          identity: 'handle',
          storage: true,
          network: ['tile.openstreetmap.org'],
        },
        defines: [
          { type: 'stall', label: 'Market stall', schema: { name: { type: 'string', required: true } } },
        ],
      }),
    )

    expect(chips).toHaveLength(3)
  })
})
