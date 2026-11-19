/**
 * The touch strip: what a creation can reach, on the card, before the tap.
 *
 * If what an app can reach is only visible on the screen *after* the one where
 * a resident decided, then the decision was made without it. So this is on the
 * card, and it is derived from the frozen manifest exactly like the trust page
 * is — a creation has no say in what its own strip reads.
 *
 * Two chips is the target and three the ceiling. A card that tries to say
 * everything stops being a card, and the trust page is one tap away and says
 * all of it.
 */

import type { Manifest } from '@townsquare/manifest'
import type { IconName } from '../Icon.js'
import { getLocale, list as joinList, t } from '../i18n/index.js'

export interface TouchChip {
  /** Stable key, so React does not need an index and a caller can test one. */
  kind: 'writes' | 'network' | 'no_network' | 'identity' | 'reads_records' | 'reads_town' | 'storage'
  icon: IconName
  label: string
  /** Outlives the visit or leaves town. Gets the terracotta inset. */
  consequential: boolean
}

const MAX_CHIPS = 3

/**
 * In priority order, and the order is the argument.
 *
 * Consequential first, because that is what a resident is deciding about. The
 * reassuring absence comes third: **nothing leaves town** is the most
 * reassuring line available and it only means anything because it is generated
 * from the same field that would otherwise name a host. "Reads the directory"
 * is last because it is true of every creation in the gallery, and a fact
 * printed on every card is wallpaper.
 */
export function touchChips(manifest: Manifest): TouchChip[] {
  const p = manifest.permissions
  const chips: TouchChip[] = []

  if (p.write.length > 0) {
    chips.push({
      kind: 'writes',
      icon: 'cloud-upload',
      label: t('Posts {types} as you', { types: list(p.write.map((type) => typeLabel(type, manifest))) }),
      consequential: true,
    })
  }

  if (p.network.length > 0) {
    chips.push({
      kind: 'network',
      icon: 'globe',
      // One host is named. Three hostnames on a 160px card wrap into an
      // unreadable block, and the trust page names every one of them.
      label: p.network.length === 1 ? p.network[0]! : t('{count} outside hosts', { count: p.network.length }),
      consequential: true,
    })
  } else {
    chips.push({
      kind: 'no_network',
      icon: 'lock',
      label: t('Nothing leaves town'),
      consequential: false,
    })
  }

  if (p.identity === 'handle') {
    chips.push({ kind: 'identity', icon: 'badge-check', label: t('Your handle'), consequential: false })
  }

  const readOnly = p.read.filter((t) => !p.write.includes(t))
  if (readOnly.length > 0) {
    chips.push({
      kind: 'reads_records',
      icon: 'database',
      label: t('Reads {types}', { types: list(readOnly.map((type) => typeLabel(type, manifest))) }),
      consequential: false,
    })
  }

  chips.push({
    kind: 'reads_town',
    icon: 'storefront',
    label: t('Reads the directory'),
    consequential: false,
  })

  if (p.storage) {
    chips.push({ kind: 'storage', icon: 'sliders', label: t('Remembers your settings'), consequential: false })
  }

  return chips.slice(0, MAX_CHIPS)
}

/** The label the definer gave the type, falling back to the raw type. */
function typeLabel(type: string, manifest: Manifest): string {
  const defined = manifest.defines.find((d) => d.type === type)
  return defined ? defined.label.toLowerCase() : type.replace(/_/g, ' ')
}

function list(items: string[]): string {
  if (items.length === 0) return ''
  if (items.length === 1) return items[0]!
  if (getLocale() === 'es') return joinList(items)
  if (items.length === 2) return `${items[0]} and ${items[1]}`
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`
}
