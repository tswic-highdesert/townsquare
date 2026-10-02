/**
 * Yours — you, what you saved, and what you built. `design/hifi` section 5b.
 *
 * This is the screen where "a section with no real data does not appear" bites
 * hardest, because the hi-fi's version of it is mostly things Town Square does
 * not yet know. What is left is small, and small-and-true is the deal.
 *
 * | In the hi-fi | Why it is not here |
 * |---|---|
 * | POSTED, and "You posted" | there is no posts table. `design/hifi` t11 |
 * | Usage bars on the app you built | no usage telemetry exists, anywhere |
 * | RESIDENTS / REPORTS / CITY FIXED | same: those are counts of nothing |
 * | "Ward 2" beside the name | the town holds no address for anybody |
 * | Following | there is nothing to follow yet |
 * | "Build something else" | the builder door has no screen in the shell yet |
 *
 * The usage bars are the interesting refusal. They are the most attractive part
 * of the design — a little sparkline is what makes a builder feel like their app
 * matters — and drawing seven plausible bars from nothing would be inventing
 * the one number a builder would go and repeat to somebody.
 *
 * What is real: the handle and the verification, which come from the session;
 * the saved list, which is a store this change added; and the built list, which
 * is `Creation.ownerId`, set by the platform at approval and never claimed by a
 * manifest.
 */

import { useState } from 'react'
import { AppBar, initials, VerifiedChip } from './AppBar.js'
import { Icon, type IconName } from './Icon.js'
import { TabBar, type TabName } from './TabBar.js'
import { unsaveThing, type BuiltCreation, type SavedThing, type SaveKind } from './savesData.js'
import { EmptyState, RowItem, RowList } from './ui/index.js'
import type { AccountView } from './session.js'

export interface YoursProps {
  account: AccountView | null
  canReview: boolean
  town: { name: string }
  saved: SavedThing[]
  built: BuiltCreation[]
  onSavedChange: (saves: SavedThing[]) => void
  onOpenCreation: (slug: string) => void
  onTab: (tab: TabName) => void
  onAccount: () => void
  onReview: () => void
  onContribute?: () => void
  onOpenSaved?: (save: SavedThing) => void
}

const SAVE_ICON: Record<SaveKind, IconName> = {
  business: 'storefront',
  event: 'calendar',
  creation: 'add',
  // Matches the glyph search already uses for a story, so a resident who found
  // one and a resident who saved one are looking at the same mark.
  story: 'newspaper',
}

export function Yours(props: YoursProps) {
  const { account } = props
  const [saveError, setSaveError] = useState<string | null>(null)
  const [removing, setRemoving] = useState<string | null>(null)

  const bar = (
    <AppBar
      label="Yours"
      place={props.town.name}
      account={account}
      canReview={props.canReview}
      onAccount={props.onAccount}
      onReview={props.onReview}
    />
  )

  /*
    Signed out, this tab is one sentence and a button rather than a stripped
    version of itself. Everything on it is about a particular person; there is
    no useful half of it to show to nobody in particular.
  */
  if (!account) {
    return (
      <div className="today">
        {bar}
        <div className="yours-signedout" id="ts-main" tabIndex={-1}>
          <span className="yours-signedout-icon">
            <Icon name="bookmarks" size={26} />
          </span>
          <h1>Your corner of the town square</h1>
          <p>
            Places you keep, and anything you build. Reading {props.town.name} never needs an
            account — this part does.
          </p>
          <button className="primary" onClick={props.onAccount}>
            Sign in
          </button>
        </div>
        <TabBar current="yours" onChange={props.onTab} />
      </div>
    )
  }

  async function unsave(save: SavedThing) {
    if (removing) return
    setRemoving(save.id)
    setSaveError(null)
    try {
    if (await unsaveThing(save.kind, save.refId)) {
      props.onSavedChange(props.saved.filter((s) => s.id !== save.id))
    } else setSaveError('Could not remove this save. Please try again.')
    } catch { setSaveError('Could not remove this save. Please try again.') }
    finally { setRemoving(null) }
  }

  return (
    <div className="today">
      {bar}

      {/* Where the skip link lands. See the note in `Today.tsx`. */}
      <div className="yours-head" id="ts-main" tabIndex={-1}>
        <span className="yours-avatar" data-verified={account.verified || undefined}>
          {initials(account.handle)}
        </span>
        <div>
          <h1 className="yours-handle">{account.handle}</h1>
          <VerifiedChip verified={account.verified} />
        </div>
      </div>

      {/*
        No tile row. The hi-fi has SAVED, POSTED and BUILT across the top, and
        two of the three count things nothing measures — so what was left was a
        row of one, saying a number the section heading below it already
        carries. The count moved onto the heading instead.
      */}
      {props.built.length > 0 && (
        <section className="today-section">
          <SectionHead label="What you built" count={props.built.length} />
          {/*
            One target per creation, a title, a fact underneath and a chevron —
            which is `Row` exactly, so this uses it rather than a fourth local
            copy of the same shape. `framed={false}` because the section
            already sits on the page rather than on a card.

            Today drew the same shape from the same `.creation-row` classes, so
            those rules survived this screen's migration and died with Today's.
          */}
          <RowList framed={false} label="What you built">
            {props.built.map((creation) => (
              <RowItem
                key={creation.slug}
                title={creation.name}
                // Status and when it last changed, which are both facts on the
                // row. Not "241 residents": nothing counts that.
                meta={`${creation.status === 'active' ? 'Live' : creation.status} · updated ${sinceLabel(creation.updatedAt)}`}
                onClick={() => props.onOpenCreation(creation.slug)}
              />
            ))}
          </RowList>
        </section>
      )}

      <section className="today-section">
        {props.onContribute && <button className="secondary" onClick={props.onContribute}>Your contributions</button>}
        <SectionHead label="Saved" count={props.saved.length} />
        {saveError && <p className="problem" role="alert">{saveError}</p>}
        {/*
          Not `Row`, deliberately.

            A saved row has two independent targets in it: the title, which is a
            link out to the thing, and the bookmark, which un-saves it without
            leaving the screen. `Row`'s contract is one row, one target — the
            trailing slot is for a chip or a time, explicitly not for a second
            thing to press — and bending it here would either nest a button
            inside a link or quietly widen that contract for every other screen
            using it.

            The composer and the news feed hit the same limit on two-target
            rows. Three screens wanting it is an argument for a second
            primitive with its own contract, not for loosening this one, and
            none of the three is blocked meanwhile.
          */}
        {props.saved.length === 0 ? (
          <EmptyState
            align="start"
            mark="bookmark"
            line="You haven’t saved anything yet."
            sub="The bookmark on a row in the directory keeps it here — the hardware store’s hours, the clinic you can never remember the name of."
          />
        ) : (
          <ul className="saved-list">
            {props.saved.map((save) => (
              <li key={save.id} className="saved-row">
                <span className="place-icon" data-kind={save.kind === 'event' ? 'event' : 'shop'}>
                  <Icon name={SAVE_ICON[save.kind]} size={20} />
                </span>
                <span className="place-text">
                  {/*
                    The title is the snapshot taken when it was saved, not a
                    live read. A saved event that quietly vanishes the morning
                    after it happened is a list that deletes your things.
                  */}
                  <span className="place-name">
                    {props.onOpenSaved ? (
                      <button className="saved-title" onClick={() => props.onOpenSaved?.(save)}>{save.title}</button>
                    ) : save.url ? (
                      <a href={save.url} target="_blank" rel="noopener noreferrer">
                        {save.title}
                      </a>
                    ) : (
                      save.title
                    )}
                  </span>
                  <span className="place-detail">
                    {[save.detail, `saved ${sinceLabel(save.savedAt)}`].filter(Boolean).join(' · ')}
                  </span>
                </span>
                <button
                  className="place-save"
                  data-saved="true"
                  disabled={removing !== null}
                  onClick={() => void unsave(save)}
                  aria-label={`Remove ${save.title} from your saved things`}
                  aria-pressed
                >
                  <Icon name="bookmark" size={18} />
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <TabBar current="yours" onChange={props.onTab} />
    </div>
  )
}

function SectionHead({ label, count }: { label: string; count: number }) {
  return (
    <div className="section-head">
      <span className="section-rule" />
      <span className="section-label">{label}</span>
      {count > 0 && <span className="section-count">{count}</span>}
    </div>
  )
}

/**
 * "today", "yesterday", "3 days ago", then a date.
 *
 * Relative for the week where relative is how a person thinks about it, and a
 * date beyond that — "97 days ago" is arithmetic nobody asked for. Rounded down
 * from whole days rather than from the hour, so something saved last night does
 * not read as today at 1am and yesterday at 2am.
 */
function sinceLabel(at: number): string {
  const days = Math.floor((Date.now() - at) / 86_400_000)
  if (days <= 0) return 'today'
  if (days === 1) return 'yesterday'
  if (days < 7) return `${days} days ago`
  return new Date(at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}
