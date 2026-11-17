/**
 * The Senior Directory's view. A blank starting point: it shows the town name
 * from `town.info()` (which needs no permission) so you can see the SDK
 * connection works. Replace this with the real UI.
 */

import { useEffect, useState } from 'react'
import { town } from '@townsquare/sdk'

export function App() {
  const [townName, setTownName] = useState<string | null>(null)

  useEffect(() => {
    town
      .info()
      .then((info) => setTownName(info.name))
      .catch(() => setTownName(null))
  }, [])

  return (
    <main className="shell">
      <h1>Senior Directory</h1>
      <p className="muted">{townName ? `For ${townName}.` : 'Loading…'}</p>
    </main>
  )
}
