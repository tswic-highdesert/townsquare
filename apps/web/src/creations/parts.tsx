/**
 * The three small pieces every creations screen repeats.
 *
 * They live together because they have to stay consistent with each other: the
 * plate, the strip of what a creation can touch, and the attribution line. A
 * second copy of any of them is a second chance for one screen to say something
 * about a creation that another screen does not.
 */

import { useState } from 'react'
import { Icon, type IconName } from '../Icon.js'
import { iconLook, iconUrl } from './appIcon.js'
import { touchChips } from './touch.js'
import type { TrustLine } from '@townsquare/host'
import type { CreationSummary } from '../townData.js'

/**
 * One glyph per capability, shared by the trust page and the detail page.
 *
 * Two screens describing the same manifest with different pictures is two
 * screens a resident has to reconcile, so the map lives once.
 */
export const TRUST_GLYPHS: Record<TrustLine['kind'], IconName> = {
  reads_town: 'storefront',
  reads_records: 'database',
  writes_records: 'cloud-upload',
  identity: 'badge-check',
  storage: 'sliders',
  network: 'globe',
  no_network: 'lock',
}

export type PlateSize = 'sm' | 'md' | 'lg'

/**
 * The creation's own icon, degrading to a tag-derived glyph.
 *
 * The bundle ships the file and the manifest names it, so this is real art the
 * builder chose. When it does not load we draw a glyph rather than a broken
 * image: a creation whose icon 404s is not necessarily broken, and it should
 * not be made to look it.
 */
export function AppIcon({ creation, size = 'md' }: { creation: CreationSummary; size?: PlateSize }) {
  const [failed, setFailed] = useState(false)
  const look = iconLook(creation.manifest)
  const px = size === 'sm' ? 16 : size === 'lg' ? 26 : 20

  return (
    <span className="cr-appicon" data-size={size} data-tone={look.tone} aria-hidden="true">
      {failed ? (
        <Icon name={look.icon} size={px} />
      ) : (
        <img
          className="cr-appicon-img"
          src={iconUrl(creation.origin, creation.manifest)}
          alt=""
          onError={() => setFailed(true)}
        />
      )}
    </span>
  )
}

/**
 * What this creation can reach, generated from its frozen manifest.
 *
 * The consequential chips carry a rule and a heavier weight as well as the
 * tint, so the distinction survives greyscale, a dimmed screen, and colour
 * blindness. Colour is confirmation here, never the message.
 */
export function TouchStrip({ creation, onDark }: { creation: CreationSummary; onDark?: boolean }) {
  return (
    <ul className="cr-touch" data-on={onDark ? 'dark' : undefined}>
      {touchChips(creation.manifest).map((chip) => (
        <li key={chip.kind} className="cr-touch-item" data-w={chip.consequential ? 'consequential' : undefined}>
          <Icon name={chip.icon} size={13} />
          {chip.label}
        </li>
      ))}
    </ul>
  )
}

/**
 * Who made it, as one string in one place.
 *
 * A creation's author is assigned by the platform at approval and
 * `packages/manifest` rejects a self-asserted `author` outright as an
 * impersonation attempt. Nothing in development has been through the review
 * queue, so the honest label is "a neighbor" with no initials beside it — a
 * two-letter avatar derived from the creation's own name reads as a person who
 * does not exist, which is the failure this whole rule is guarding against.
 *
 * A constant rather than a component, because the gallery says it inside a
 * `CardMeta` and the trust page says it in its own header block. Two shapes,
 * one sentence, and the sentence is the part that must not drift.
 */
export const MADE_BY = 'Made by a neighbor'
