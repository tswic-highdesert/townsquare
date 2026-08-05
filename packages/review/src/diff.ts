/**
 * What changed between the version residents are running and the one asking to
 * replace it.
 *
 * This is the single highest-value thing the review screen shows, and it exists
 * because of one specific attack: publish something innocuous, get approved,
 * build an audience, then push an update that quietly adds a network host or a
 * write permission. A reviewer reading a full permissions block for the fifth
 * time will not notice one new line. A reviewer reading "**adds** network:
 * collect.example.com" cannot miss it.
 *
 * So the diff is computed from the two frozen manifests, never from anything
 * the submitter wrote about their own change, and escalations are named
 * separately from reductions — dropping a permission needs no scrutiny at all.
 */

import type { Manifest, Permissions } from '@townsquare/manifest'

export interface PermissionChange {
  key: 'identity' | 'read' | 'write' | 'network' | 'storage' | 'device'
  added: string[]
  removed: string[]
}

export interface ManifestDiff {
  /** Changes that grant something new. The reason this function exists. */
  escalations: PermissionChange[]
  /** Changes that give something up. Shown, but never a reason to look harder. */
  reductions: PermissionChange[]
  /** Record types this version introduces that the previous one did not. */
  newRecordTypes: string[]
  /** Plain metadata, so a reviewer can see a rename without diffing by eye. */
  renamed: { from: string; to: string } | null
  versionFrom: string
  versionTo: string
}

function listOf(permissions: Permissions, key: PermissionChange['key']): string[] {
  switch (key) {
    case 'identity':
      // Modelled as a list of one so every key diffs the same way. `none` is
      // the absence of the grant, not a grant called "none".
      return permissions.identity === 'none' ? [] : [permissions.identity]
    case 'storage':
      return permissions.storage ? ['storage'] : []
    case 'read':
      return [...permissions.read]
    case 'write':
      return [...permissions.write]
    case 'network':
      return [...permissions.network]
    case 'device':
      return [...permissions.device]
  }
}

const KEYS: PermissionChange['key'][] = [
  'identity',
  'read',
  'write',
  'network',
  'storage',
  'device',
]

export function diffManifests(previous: Manifest, next: Manifest): ManifestDiff {
  const escalations: PermissionChange[] = []
  const reductions: PermissionChange[] = []

  for (const key of KEYS) {
    const before = new Set(listOf(previous.permissions, key))
    const after = new Set(listOf(next.permissions, key))
    const added = [...after].filter((v) => !before.has(v)).sort()
    const removed = [...before].filter((v) => !after.has(v)).sort()

    if (added.length) escalations.push({ key, added, removed: [] })
    if (removed.length) reductions.push({ key, added: [], removed })
  }

  const definedBefore = new Set(previous.defines.map((d) => d.type))
  const newRecordTypes = next.defines
    .map((d) => d.type)
    .filter((t) => !definedBefore.has(t))
    .sort()

  return {
    escalations,
    reductions,
    newRecordTypes,
    renamed: previous.name === next.name ? null : { from: previous.name, to: next.name },
    versionFrom: previous.version,
    versionTo: next.version,
  }
}

/** True when this update asks for anything it did not already have. */
export function isEscalation(diff: ManifestDiff): boolean {
  return diff.escalations.length > 0 || diff.newRecordTypes.length > 0
}

/**
 * The same summary for a first submission, where there is nothing to diff
 * against and every declared permission is new by definition.
 */
export function grantsOf(manifest: Manifest): PermissionChange[] {
  return KEYS.map((key) => ({ key, added: listOf(manifest.permissions, key), removed: [] })).filter(
    (c) => c.added.length > 0,
  )
}
