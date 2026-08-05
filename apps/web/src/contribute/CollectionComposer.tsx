/**
 * Start a collection. Curation is contribution.
 *
 * A collection makes no new claims about the world: every item in it is
 * something the town already publishes, and the contribution is the selection
 * and the order. That is why it needs no review, only a name and an order, and
 * it is the cheapest genuinely valuable thing a resident can make.
 *
 * **Reorder is never drag-only.** Every item carries real buttons that move it,
 * they are 44px, they hold focus, and the live region says where it landed.
 * Drag is an accelerator for people who can drag; a list that can only be
 * reordered by dragging is a list some residents cannot make at all.
 */

import { useState } from 'react'
import { TextInput, Textarea } from '../ui/index.js'
import { Icon } from '../Icon.js'
import { searchListings, type Listing } from './contributeData.js'

export interface CollectionItem {
  kind: 'business'
  refId: string
  label: string
  detail: string
}

export interface CollectionDraft {
  name: string
  description: string
  items: CollectionItem[]
}

export const emptyCollection: CollectionDraft = { name: '', description: '', items: [] }

export function collectionContent(draft: CollectionDraft) {
  return {
    name: draft.name,
    description: draft.description || null,
    items: draft.items.map((i) => ({ kind: i.kind, refId: i.refId, label: i.label })),
  }
}

export function collectionMissing(draft: CollectionDraft): string | null {
  if (!draft.name.trim()) return 'Call it something.'
  if (draft.items.length === 0) return 'A collection needs at least one thing in it.'
  return null
}

export function CollectionComposer(props: {
  draft: CollectionDraft
  onChange: (draft: CollectionDraft) => void
}) {
  const { draft, onChange } = props
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<Listing[]>([])
  const [moved, setMoved] = useState('')

  function move(from: number, to: number) {
    if (to < 0 || to >= draft.items.length) return
    const items = [...draft.items]
    const [item] = items.splice(from, 1)
    if (!item) return
    items.splice(to, 0, item)
    onChange({ ...draft, items })
    // Announced, because a reorder a screen reader cannot hear is a reorder
    // that did not happen for the person doing it.
    setMoved(`${item.label} moved to position ${to + 1} of ${items.length}`)
  }

  return (
    <>
      <TextInput
        label="Call it something"
        value={draft.name}
        maxLength={80}
        onChange={(e) => onChange({ ...draft, name: e.target.value })}
      />

      <Textarea
        label="A line about it"
        value={draft.description}
        rows={2}
        maxLength={200}
        help="Optional."
        onChange={(e) => onChange({ ...draft, description: e.target.value })}
      />

      <div className="cn-field">
        <span className="cn-label">In this collection</span>
        {draft.items.length === 0 ? (
          <p className="cn-hint">Nothing in it yet. Find a place below.</p>
        ) : (
          <ul className="cn-items">
            {draft.items.map((item, at) => (
              <li className="cn-item" key={item.refId}>
                <span className="cn-item-pos" aria-hidden="true">
                  {at + 1}
                </span>
                <span className="cn-item-text">
                  <b>{item.label}</b>
                  <span>{item.detail}</span>
                </span>
                <span className="cn-item-moves">
                  <button
                    type="button"
                    className="cn-icon-btn cn-icon-btn--sm"
                    aria-label={`Move ${item.label} up`}
                    disabled={at === 0}
                    onClick={() => move(at, at - 1)}
                  >
                    <Icon name="arrow-up" size={16} />
                  </button>
                  <button
                    type="button"
                    className="cn-icon-btn cn-icon-btn--sm"
                    aria-label={`Move ${item.label} down`}
                    disabled={at === draft.items.length - 1}
                    onClick={() => move(at, at + 1)}
                  >
                    <Icon name="arrow-down" size={16} />
                  </button>
                  <button
                    type="button"
                    className="cn-icon-btn cn-icon-btn--sm"
                    aria-label={`Remove ${item.label}`}
                    onClick={() =>
                      onChange({
                        ...draft,
                        items: draft.items.filter((i) => i.refId !== item.refId),
                      })
                    }
                  >
                    <Icon name="close" size={16} />
                  </button>
                </span>
              </li>
            ))}
          </ul>
        )}
        <p className="cn-sr-live" role="status">
          {moved}
        </p>
      </div>

      <div className="cn-field">
        <label className="cn-label" htmlFor="cn-coll-find">
          Add a place
        </label>
        <div className="cn-place" data-open={results.length > 0 || undefined}>
          <span className="cn-place-ic">
            <Icon name="search" size={16} />
          </span>
          <input
            id="cn-coll-find"
            className="cn-input cn-input--bare"
            value={query}
            placeholder="Find a listing"
            onChange={(e) => {
              const next = e.target.value
              setQuery(next)
              void searchListings(next).then(setResults)
            }}
          />
        </div>
        {results.length > 0 ? (
          <ul className="cn-picker-list" role="listbox" aria-label="Results">
            {results
              .filter((l) => !draft.items.some((i) => i.refId === l.id))
              .map((listing) => (
                <li key={listing.id} role="presentation">
                  <button
                    type="button"
                    className="cn-picker-opt"
                    role="option"
                    aria-selected={false}
                    onClick={() => {
                      onChange({
                        ...draft,
                        items: [
                          ...draft.items,
                          {
                            kind: 'business',
                            refId: listing.id,
                            label: listing.name,
                            detail: listing.category,
                          },
                        ],
                      })
                      setQuery('')
                      setResults([])
                    }}
                  >
                    <span className="cn-item-text">
                      <b>{listing.name}</b>
                      <span>{listing.category}</span>
                    </span>
                    <Icon name="plus" size={16} className="cn-picker-add" />
                  </button>
                </li>
              ))}
          </ul>
        ) : null}
      </div>
    </>
  )
}
