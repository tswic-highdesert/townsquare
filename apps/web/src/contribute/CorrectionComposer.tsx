/**
 * Correct a listing: an edit against data that already exists.
 *
 * The whole shape of this screen follows from one thing: **a reviewer should
 * read a diff, not a claim.** So the old value and the new one are stacked with
 * an arrow between them and the old one is labelled with where it came from,
 * which turns "the hours are wrong" into something a moderator can act on in
 * ten seconds without opening another tab.
 *
 * **One correction, one field.** Chosen so each can be accepted or turned down
 * on its own: a resident who is right about the hours and wrong about the phone
 * number should not lose both, and a moderator should not have to write a note
 * explaining a partial acceptance.
 *
 * **The reason is required**, and it is the only field in the whole contribute
 * surface whose absence is refused for a reason that is not structural. It is
 * what a reviewer actually reads. "Sign taped to the door since May" is a
 * correction somebody can act on; a changed value with no account of how you
 * know is a stranger asserting something about a business.
 */

import { Textarea, TextInput } from '../ui/index.js'
import { Icon } from '../Icon.js'
import { CORRECTION_FIELDS, type Listing } from './contributeData.js'
import { PlacePicker } from './PlacePicker.js'

export interface CorrectionDraft {
  listing: Listing | null
  field: (typeof CORRECTION_FIELDS)[number]['field']
  beforeValue: string
  newValue: string
  reason: string
}

export const emptyCorrection: CorrectionDraft = {
  listing: null,
  field: 'hours',
  beforeValue: '',
  newValue: '',
  reason: '',
}

export function correctionContent(draft: CorrectionDraft) {
  return {
    targetRef: draft.listing?.id ?? '',
    targetLabel: draft.listing?.name ?? '',
    field: draft.field,
    beforeValue: draft.beforeValue,
    newValue: draft.newValue,
    reason: draft.reason,
  }
}

export function correctionMissing(draft: CorrectionDraft): string | null {
  if (!draft.listing) return 'Pick the listing you are correcting.'
  if (!draft.newValue.trim()) return 'It needs the corrected value.'
  if (!draft.reason.trim()) return 'A reason is required. It is what a reviewer reads.'
  return null
}

/** What the listing says now, for the field being corrected. */
export function currentValue(listing: Listing | null, field: string): string {
  if (!listing) return ''
  if (field === 'phone') return listing.phone ?? ''
  if (field === 'address') return listing.address
  if (field === 'name') return listing.name
  // Hours are not on the summary the directory endpoint returns, and "closed
  // for good" has no column at all. Blank is the honest answer rather than a
  // guess, and the diff below says so in words instead of showing an empty box.
  return ''
}

export function CorrectionComposer(props: {
  draft: CorrectionDraft
  onChange: (draft: CorrectionDraft) => void
}) {
  const { draft, onChange } = props
  const before = draft.beforeValue || currentValue(draft.listing, draft.field)

  return (
    <>
      <p className="cn-lead">
        Pick the one thing that is wrong. One correction, one field, so it can be accepted or turned
        down on its own.
      </p>

      {/* No escape hatch here: a correction is an edit against a listing that
          already exists, so there is nothing to correct if it is not one. */}
      <PlacePicker
        label="Which listing"
        listingsOnly
        place={draft.listing ? { listingId: draft.listing.id, name: draft.listing.name } : null}
        onPick={(_place, listing) =>
          onChange({
            ...draft,
            listing: listing ?? null,
            beforeValue: currentValue(listing ?? null, draft.field),
            newValue: '',
          })
        }
      />

      <div className="cn-field">
        <span className="cn-label" id="cn-fieldpick">
          Which field
        </span>
        <div className="cn-chips" role="group" aria-labelledby="cn-fieldpick">
          {CORRECTION_FIELDS.map(({ field, label }) => {
            const on = draft.field === field
            return (
              <button
                key={field}
                type="button"
                className="cn-chip"
                data-on={on || undefined}
                aria-pressed={on}
                onClick={() =>
                  onChange({
                    ...draft,
                    field,
                    // The captured old value belongs to the field it was read
                    // from. Carrying it across would make the diff a lie.
                    beforeValue: currentValue(draft.listing, field),
                    newValue: '',
                  })
                }
              >
                {on ? <Icon name="check" size={16} /> : null}
                {label}
              </button>
            )
          })}
        </div>
      </div>

      <div className="cn-diff">
        <div className="cn-diff-side" data-side="old">
          <span className="cn-diff-tag">On the listing now</span>
          <p className="cn-diff-val">
            {before || <span className="cn-diff-none">Nothing is listed for this yet</span>}
          </p>
          <span className="cn-diff-src">From the directory import</span>
        </div>
        <div className="cn-diff-arrow" aria-hidden="true">
          <Icon name="arrow-down" size={16} />
        </div>
        <div className="cn-diff-side" data-side="new">
          <span className="cn-diff-tag">Your correction</span>
          <TextInput
            label="Corrected value"
            className="cn-sr-label"
            value={draft.newValue}
            maxLength={200}
            onChange={(e) => onChange({ ...draft, newValue: e.target.value, beforeValue: before })}
          />
        </div>
      </div>

      <Textarea
        label="How do you know"
        value={draft.reason}
        rows={3}
        maxLength={300}
        help="A reason is required. It is what a reviewer actually reads."
        onChange={(e) => onChange({ ...draft, reason: e.target.value })}
      />

      <div className="cn-vernote">
        <Icon name="history" size={16} />
        <p>
          This becomes a new version of the listing. The current one stays exactly as it is and
          anyone, including you, can put it back. Nothing here is deleted.
        </p>
      </div>
    </>
  )
}
