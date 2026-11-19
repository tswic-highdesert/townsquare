/**
 * The entry point: one plus, and five nouns.
 *
 * Choosing the shape first is what stops this becoming a complaint board. A
 * general status box has no shape, so it accepts everything, and the thing it
 * accepts most easily is a grievance about a neighbour. Nobody sets out to
 * build a complaint board; you build a box, and the box decides.
 *
 * Asking for the type first does three useful things at once: it turns
 * "somebody should do something about the potholes on Weir Road" into either an
 * event, a correction or nothing; it gives every record fields that make it
 * findable in six months; and it lets the rules be per type rather than one
 * global standard nobody agrees on.
 *
 * The cost is real. A resident with something to say that fits no shape is
 * turned away, and the sheet says so in plain words at the bottom rather than
 * hiding it.
 *
 * **Every type is shown, including the ones this resident cannot use.** A
 * locked row that names the reason and offers the route is a door. An absent
 * row is a product that looks smaller than it is. What each locked row says
 * comes from the server's gate matrix, never from a guess made here.
 */

import { BottomSheet } from '../ui/index.js'
import { Icon, type IconName } from '../Icon.js'
import { msg, t, tn } from '../i18n/index.js'
import type { ContributionType, GateAvailability } from './contributeData.js'

const DESCRIPTIONS: Record<ContributionType, { icon: IconName; desc: string }> = {
  event: {
    icon: 'calendar',
    desc: msg('Something happening at a time and a place that people can turn up to.'),
  },
  correction: {
    icon: 'edit',
    desc: msg('Hours, a phone number or a name that is wrong on a listing.'),
  },
  notice: {
    icon: 'megaphone',
    desc: msg('An organisation telling the town something. Verified organisations only.'),
  },
  collection: {
    icon: 'layers',
    desc: msg('Places or stories you have gathered into a list with a name.'),
  },
  photo: {
    icon: 'camera',
    desc: msg('One picture of something in town, and one line saying what it is.'),
  },
}

export interface ChooserProps {
  open: boolean
  onClose: () => void
  types: GateAvailability[]
  onPick: (type: ContributionType) => void
  onDrafts: () => void
  draftCount: number
}

export function Chooser(props: ChooserProps) {
  return (
    <BottomSheet open={props.open} onClose={props.onClose} title={t('Add something')}>
      <p className="cn-sheet-sub">
        {t('Pick what it is. Everything in Town Square has a shape, so it can be found again.')}
      </p>

      <ul className="cn-choose">
        {props.types.map((row) => (
          <ChooserRow key={row.type} row={row} onPick={() => props.onPick(row.type)} />
        ))}
      </ul>

      {props.draftCount > 0 ? (
        <button type="button" className="cn-drafts-link" onClick={props.onDrafts}>
          <Icon name="archive" size={16} />
          {tn(props.draftCount, '{count} draft, not posted yet', '{count} drafts, not posted yet')}
        </button>
      ) : null}

      <p className="cn-sheet-foot">
        <Icon name="info" size={16} />
        {t('There is no general post box here, on purpose.')}
      </p>
    </BottomSheet>
  )
}

function ChooserRow({ row, onPick }: { row: GateAvailability; onPick: () => void }) {
  const meta = DESCRIPTIONS[row.type]
  const descId = `cn-choose-${row.type}`

  // Unavailable is genuinely not a door: there is nowhere for it to lead, so it
  // is not a button. Locked-but-held is a door and stays pressable, because the
  // work is kept and it posts the moment the vouches land.
  const pressable = row.ifUsed !== 'unavailable'

  return (
    <li>
      <button
        className="cn-choose-row"
        type="button"
        data-locked={row.allowed ? undefined : true}
        aria-describedby={descId}
        disabled={!pressable}
        onClick={onPick}
      >
        <span className="cn-choose-ic" data-type={row.type}>
          <Icon name={meta.icon} size={20} />
        </span>
        <span className="cn-choose-text">
          <span className="cn-choose-name">
            {row.label}
            {row.allowed ? null : (
              <span className="cn-mini-lock">
                <Icon name="lock" size={14} label={lockLabel(row)} />
              </span>
            )}
          </span>
          {/* The description says what the type is, always. The server's
              reason says why this row is locked, and it is a separate line
              rather than a replacement: a resident who cannot use a type still
              needs to know what it is, and swapping the two leaves a lock with
              no explanation of what is behind it. */}
          <span className="cn-choose-desc" id={descId}>
            {t(meta.desc)}
          </span>
          {row.allowed || !row.reason ? null : (
            <span className="cn-choose-why">{sentence(row.reason)}</span>
          )}
          {row.ifUsed === 'hold' ? (
            <span className="cn-choose-hold">
              {t('You can write it now. It posts the moment you are verified.')}
            </span>
          ) : null}
        </span>
        {pressable ? <Icon name="chevron-right" size={16} className="cn-choose-go" /> : null}
      </button>
    </li>
  )
}

/**
 * The service's reason, as a sentence.
 *
 * Those strings are written as clauses because they are also thrown as error
 * messages, where "adding this is for verified residents" reads correctly after
 * a colon. On a chooser row it is standing on its own, so it gets a capital and
 * a full stop rather than being rewritten in two places.
 */
function sentence(reason: string): string {
  const trimmed = reason.trim()
  const first = trimmed.charAt(0).toUpperCase() + trimmed.slice(1)
  return /[.!?]$/.test(first) ? first : `${first}.`
}

function lockLabel(row: GateAvailability): string {
  return row.ifUsed === 'unavailable' ? t('Not available yet') : t('Locked')
}
