/**
 * The manifest, in plain English.
 *
 * This is the trust page a resident sees *before* a creation launches, and it
 * is the whole reason the manifest is declarative. A permission list nobody can
 * read is a permission list nobody checks, and "reads: [business]" means
 * nothing to the person deciding whether to open Luis's burrito ranking.
 *
 * Two rules hold this honest:
 *
 *   Every line is derived from the frozen manifest, never from anything the
 *   creation says about itself. A creation cannot write its own trust page.
 *
 *   Absence is stated as loudly as presence. "Can't reach anything outside
 *   town" is the single most reassuring line on the screen, and it only means
 *   something because it is generated from the same field that would otherwise
 *   list a host.
 */

import type { Manifest } from '@townsquare/manifest'

export interface TrustLine {
  /** Stable key, so the shell can pick its own icon per capability. */
  kind:
    | 'reads_town'
    | 'reads_records'
    | 'writes_records'
    | 'identity'
    | 'storage'
    | 'network'
    | 'no_network'
  /** One line, sentence case, written for a resident and not a developer. */
  title: string
  /** The qualifier underneath. Often what the creation *cannot* do. */
  detail: string
  /**
   * `ambient` is background reassurance, `notable` is worth a glance, and
   * `consequential` is something that outlives the visit or leaves the town.
   */
  weight: 'ambient' | 'notable' | 'consequential'
}

/** Human-readable name for a record type, falling back to the raw type. */
function typeLabel(type: string, manifest: Manifest): string {
  const defined = manifest.defines.find((d) => d.type === type)
  if (defined) return defined.label.toLowerCase()
  return type.replace(/_/g, ' ')
}

function list(items: string[]): string {
  if (items.length === 0) return ''
  if (items.length === 1) return items[0]!
  if (items.length === 2) return `${items[0]} and ${items[1]}`
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`
}

export function describeManifest(manifest: Manifest): TrustLine[] {
  const lines: TrustLine[] = []
  const { permissions } = manifest

  // Always true, always first. Every creation can read public town content,
  // and saying so plainly is better than leaving a resident to wonder.
  lines.push({
    kind: 'reads_town',
    title: 'Reads the town directory and calendar',
    detail: 'Names, hours, addresses and events. The same things the website shows anyone.',
    weight: 'ambient',
  })

  if (permissions.identity === 'handle') {
    lines.push({
      kind: 'identity',
      title: "Knows you're a verified resident",
      detail: 'Your handle and whether you are verified. Not your name, email or address.',
      weight: 'notable',
    })
  }

  // Read-only types. A type that is also written is described by the write
  // line instead, because "reads and writes X" reads as one capability.
  const readOnly = permissions.read.filter((t) => !permissions.write.includes(t))
  if (readOnly.length > 0) {
    lines.push({
      kind: 'reads_records',
      title: `Reads ${list(readOnly.map((t) => typeLabel(t, manifest)))} from the town`,
      detail: 'Shared records other residents contributed. It cannot change them.',
      weight: 'ambient',
    })
  }

  if (permissions.write.length > 0) {
    lines.push({
      kind: 'writes_records',
      title: `Posts ${list(permissions.write.map((t) => typeLabel(t, manifest)))} with your name on it`,
      detail:
        'Asks the first time. Everything it writes is attributed to you and to this creation, ' +
        'and every version is kept.',
      weight: 'consequential',
    })
  }

  if (permissions.storage) {
    lines.push({
      kind: 'storage',
      title: 'Remembers your settings for this app',
      detail: 'Private to you and to this app. No other creation can read it.',
      weight: 'ambient',
    })
  }

  if (permissions.network.length > 0) {
    lines.push({
      kind: 'network',
      title: `Loads data from ${list(permissions.network)}`,
      detail:
        permissions.network.length === 1
          ? 'That is the only outside address it can reach.'
          : 'Those are the only outside addresses it can reach.',
      weight: 'consequential',
    })
  } else {
    lines.push({
      kind: 'no_network',
      title: "Can't reach anything outside town",
      detail: 'Runs sandboxed on Town Square. Nothing it sees can leave.',
      weight: 'ambient',
    })
  }

  return lines
}

/**
 * Whether an update needs a human, comparing an incoming manifest to the one
 * currently approved.
 *
 * Permission expansion always forces review, and it is the one rule that should
 * never be automated away for anyone, trusted publishers included. Publish
 * something harmless, build an audience, then push an update that asks for
 * more is the browser-extension attack, and it works precisely where updates
 * are rubber-stamped.
 */
export function expandedPermissions(previous: Manifest, next: Manifest): string[] {
  const grown: string[] = []
  const before = previous.permissions
  const after = next.permissions

  if (before.identity === 'none' && after.identity === 'handle') {
    grown.push('now asks who you are')
  }
  if (!before.storage && after.storage) {
    grown.push('now stores data on your device')
  }

  const newReads = after.read.filter((t) => !before.read.includes(t))
  if (newReads.length > 0) grown.push(`now reads ${list(newReads)}`)

  const newWrites = after.write.filter((t) => !before.write.includes(t))
  if (newWrites.length > 0) grown.push(`now posts ${list(newWrites)}`)

  const newHosts = after.network.filter((h) => !before.network.includes(h))
  if (newHosts.length > 0) grown.push(`now reaches ${list(newHosts)}`)

  return grown
}
