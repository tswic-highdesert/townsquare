import { describe, expect, it } from 'vitest'
import { parseManifest, type Manifest } from '@townsquare/manifest'
import { describeManifest, expandedPermissions } from './trust.js'

function manifest(
  permissions: Record<string, unknown> = {},
  defines: unknown[] = [],
): Manifest {
  const parsed = parseManifest({
    manifest_version: 1,
    sdk: 1,
    name: 'The Burrito Index',
    tagline: 'Fourteen taquerias, ranked',
    description: 'Fourteen taquerias in town, ranked by whoever shows up to vote each week.',
    version: '1.0.0',
    entry: 'index.html',
    icon: 'icon.png',
    permissions,
    defines,
  })
  if (!parsed.ok) throw new Error(JSON.stringify(parsed.issues))
  return parsed.manifest
}

const kinds = (m: Manifest) => describeManifest(m).map((l) => l.kind)

describe('the trust page', () => {
  it('always says a creation can read public town content', () => {
    expect(kinds(manifest())).toContain('reads_town')
  })

  it('states the absence of network access as loudly as its presence', () => {
    const lines = describeManifest(manifest())
    const line = lines.find((l) => l.kind === 'no_network')
    expect(line?.title).toBe("Can't reach anything outside town")
  })

  it('names every declared host, and says those are the only ones', () => {
    const lines = describeManifest(manifest({ network: ['tile.openstreetmap.org'] }))
    const line = lines.find((l) => l.kind === 'network')
    expect(line?.title).toContain('tile.openstreetmap.org')
    expect(line?.detail).toContain('only outside address')
    expect(kinds(manifest({ network: ['a.example'] }))).not.toContain('no_network')
  })

  it('reads identity as what it is, and names what it is not', () => {
    const line = describeManifest(manifest({ identity: 'handle' })).find(
      (l) => l.kind === 'identity',
    )
    expect(line?.title).toBe("Knows you're a verified resident")
    expect(line?.detail).toContain('Not your name, email or address')
  })

  it('uses the human label a creation gave its own record type', () => {
    const m = manifest({ read: ['taco_vote'], write: ['taco_vote'] }, [
      { type: 'taco_vote', label: 'Taco vote', schema: { spot: { type: 'string' } } },
    ])
    const line = describeManifest(m).find((l) => l.kind === 'writes_records')
    expect(line?.title).toBe('Posts taco vote with your name on it')
  })

  it('describes a written type once, as a write, not twice', () => {
    const m = manifest({ read: ['taco_vote'], write: ['taco_vote'] }, [
      { type: 'taco_vote', label: 'Taco vote', schema: { spot: { type: 'string' } } },
    ])
    expect(kinds(m)).toContain('writes_records')
    expect(kinds(m)).not.toContain('reads_records')
  })

  it('marks writing and reaching offsite as the consequential lines', () => {
    const m = manifest({ read: ['taco_vote'], write: ['taco_vote'], network: ['a.example'] }, [
      { type: 'taco_vote', label: 'Taco vote', schema: { spot: { type: 'string' } } },
    ])
    const heavy = describeManifest(m)
      .filter((l) => l.weight === 'consequential')
      .map((l) => l.kind)
    expect(heavy).toEqual(['writes_records', 'network'])
  })

  it('reads plainly with several items in a list', () => {
    const m = manifest({ network: ['a.example', 'b.example', 'c.example'] })
    const line = describeManifest(m).find((l) => l.kind === 'network')
    expect(line?.title).toBe('Loads data from a.example, b.example and c.example')
  })

  it('never invents a capability the manifest did not declare', () => {
    expect(kinds(manifest())).toEqual(['reads_town', 'no_network'])
  })
})

describe('update review', () => {
  it('is silent when nothing grew', () => {
    const before = manifest({ network: ['a.example'] })
    expect(expandedPermissions(before, manifest({ network: ['a.example'] }))).toEqual([])
  })

  it('is silent when permissions shrank', () => {
    const before = manifest({ identity: 'handle', network: ['a.example'] })
    expect(expandedPermissions(before, manifest())).toEqual([])
  })

  it('catches every direction a permission can grow', () => {
    const before = manifest()
    const after = manifest(
      { identity: 'handle', storage: true, read: ['taco_vote'], write: ['taco_vote'], network: ['evil.example'] },
      [{ type: 'taco_vote', label: 'Taco vote', schema: { spot: { type: 'string' } } }],
    )
    const grown = expandedPermissions(before, after)
    expect(grown).toEqual([
      'now asks who you are',
      'now stores data on your device',
      'now reads taco_vote',
      'now posts taco_vote',
      'now reaches evil.example',
    ])
  })

  it('catches a quiet new host added to an already-networked creation', () => {
    const before = manifest({ network: ['tile.openstreetmap.org'] })
    const after = manifest({ network: ['tile.openstreetmap.org', 'collect.evil.example'] })
    expect(expandedPermissions(before, after)).toEqual(['now reaches collect.evil.example'])
  })
})
