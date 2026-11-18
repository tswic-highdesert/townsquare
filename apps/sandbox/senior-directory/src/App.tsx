/**
 * The Senior Directory's view. Shows the town name from `town.info()` and the
 * merged directory from `./data/directory.ts`: the bundled chamber senior
 * resources plus senior-relevant listings from `town.businesses()`.
 */

import { useEffect, useState } from 'react'
import { town } from '@townsquare/sdk'
import { chamberEntries, loadDirectory, type DirectoryEntry } from './data/directory.js'

export function App() {
  const [townName, setTownName] = useState<string | null>(null)
  // Chamber data is bundled, so show it immediately; town listings merge in.
  const [entries, setEntries] = useState<DirectoryEntry[]>(chamberEntries)
  const [loading, setLoading] = useState(true)
  const [townError, setTownError] = useState<string | null>(null)

  useEffect(() => {
    town
      .info()
      .then((info) => setTownName(info.name))
      .catch(() => setTownName(null))

    let cancelled = false
    loadDirectory().then((result) => {
      if (cancelled) return
      setEntries(result.entries)
      setTownError(result.townError)
      setLoading(false)
    })
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <main className="shell">
      <h1>Senior Directory</h1>
      <p className="muted">{townName ? `For ${townName}.` : 'Loading…'}</p>
      <p className="muted">
        {entries.length} listings
        {loading ? ' (loading town directory…)' : ''}
      </p>
      {townError && (
        <p className="muted">Town directory unavailable; showing chamber listings only.</p>
      )}

      <ul className="directory">
        {entries.map((e) => (
          <li key={e.id} className="entry">
            <strong>{e.name}</strong>
            {e.category && <span className="muted"> · {e.category}</span>}
            {e.address && <div>{e.address}</div>}
            <div>
              {e.phone && <a href={`tel:${e.phone}`}>{e.phone}</a>}
              {e.email && (
                <>
                  {e.phone && ' · '}
                  <a href={`mailto:${e.email}`}>{e.email}</a>
                </>
              )}
              {e.website && (
                <>
                  {(e.phone || e.email) && ' · '}
                  <a href={e.website} target="_blank" rel="noreferrer">
                    Website
                  </a>
                </>
              )}
            </div>
            <div className="muted source">
              {e.sources.map((s) => (s === 'chamber' ? 'Chamber' : 'Town directory')).join(' + ')}
            </div>
          </li>
        ))}
      </ul>
    </main>
  )
}
