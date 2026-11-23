/**
 * A place, typed ahead over the seven hundred listings we already hold.
 *
 * Searching the directory rather than taking free text means an event links to
 * a real business with real hours instead of a string somebody typed, and it
 * means the record survives that business moving.
 *
 * **The escape hatch takes a name and never an address.** Somewhere with no
 * listing is still a place people go, so refusing it outright would push
 * somebody to put "behind the Casey's on Weir Road" in the title. But the field
 * is a name, the placeholder says so, and there is no address input anywhere in
 * this component: a pin can be a house, a listing cannot, and Town Square holds
 * no address for anybody.
 */

import { useEffect, useState } from 'react'
import { Icon } from '../Icon.js'
import { t } from '../i18n/index.js'
import { searchListings, type Listing } from './contributeData.js'

export interface PickedPlace {
  listingId: string | null
  name: string
}

export function PlacePicker(props: {
  label: string
  place: PickedPlace | null
  /**
   * The full listing rides along beside the place.
   *
   * A correction needs more than a name and an id: it has to show what the
   * listing currently says for the field being corrected, so the reviewer reads
   * a diff. Handing back the row we already fetched avoids a second request for
   * data that was on screen a moment ago.
   */
  onPick: (place: PickedPlace | null, listing?: Listing) => void
  help?: string
  optional?: boolean
  /** A correction is against a real listing, so there is no escape hatch. */
  listingsOnly?: boolean
}) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<Listing[]>([])
  const open = query.trim().length >= 2 && props.place === null

  useEffect(() => {
    if (!open) {
      setResults([])
      return
    }
    let live = true
    const timer = setTimeout(() => {
      void searchListings(query).then((found) => {
        if (live) setResults(found)
      })
    }, 200)
    return () => {
      live = false
      clearTimeout(timer)
    }
  }, [query, open])

  if (props.place) {
    return (
      <div className="cn-field">
        <span className="cn-label">{props.label}</span>
        <div className="cn-place" data-picked>
          <span className="cn-place-ic">
            <Icon name="map-pin" size={16} />
          </span>
          <span className="cn-place-text">
            <b>{props.place.name}</b>
            <span>
              {props.place.listingId ? t('From the directory') : t('A name you typed, no address stored')}
            </span>
          </span>
          <button
            className="cn-icon-btn cn-icon-btn--sm"
            type="button"
            aria-label={t('Clear {place}', { place: props.place.name })}
            onClick={() => {
              props.onPick(null)
              setQuery('')
            }}
          >
            <Icon name="close" size={16} />
          </button>
        </div>
        {props.help ? <p className="cn-hint">{props.help}</p> : null}
      </div>
    )
  }

  const listId = `cn-place-list-${props.label.replace(/\s+/g, '-').toLowerCase()}`

  return (
    <div className="cn-field">
      <label className="cn-label" htmlFor={`${listId}-in`}>
        {props.label}
        {props.optional ? <span className="cn-optional">{t('optional')}</span> : null}
      </label>
      <div className="cn-place" data-open={open || undefined}>
        <span className="cn-place-ic">
          <Icon name="search" size={16} />
        </span>
        <input
          id={`${listId}-in`}
          className="cn-input cn-input--bare"
          value={query}
          placeholder={t('Find a place in town')}
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>

      {open ? (
        <ul className="cn-picker-list" role="listbox" id={listId} aria-label={t('Places')}>
          {results.map((listing) => (
            <li key={listing.id} role="presentation">
              <button
                type="button"
                className="cn-picker-opt"
                role="option"
                aria-selected={false}
                onClick={() => props.onPick({ listingId: listing.id, name: listing.name }, listing)}
              >
                <span className="cn-place-ic cn-place-ic--sm">
                  <Icon name="building" size={16} />
                </span>
                <span className="cn-item-text">
                  <b>{listing.name}</b>
                  <span>{listing.address}</span>
                </span>
              </button>
            </li>
          ))}
          {props.listingsOnly ? null : (
          <li role="presentation">
            <button
              type="button"
              className="cn-picker-opt"
              data-new
              role="option"
              aria-selected={false}
              onClick={() => props.onPick({ listingId: null, name: query.trim() })}
            >
              <span className="cn-place-ic cn-place-ic--sm">
                <Icon name="plus" size={16} />
              </span>
              <span className="cn-item-text">
                <b>{t('Somewhere else')}</b>
                <span>{t('Use "{name}" as a place name. No street address, ever.', { name: query.trim() })}</span>
              </span>
            </button>
          </li>
          )}
        </ul>
      ) : null}
      {props.help ? <p className="cn-hint">{props.help}</p> : null}
    </div>
  )
}
