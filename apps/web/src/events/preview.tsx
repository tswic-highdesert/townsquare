// Temporary preview harness. Deleted before hand-off; the real mount is App.tsx.
import { StrictMode, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { cssVariables, fontFaceCss } from '@townsquare/tokens'
import '../ui/ui.css'
import '../styles/index.css'
import { EventsScreen } from './Events.js'
import { EventDetailScreen } from './EventDetail.js'

const style = document.createElement('style')
style.textContent = [
  fontFaceCss('/fonts'),
  `:root {\n${Object.entries(cssVariables()).map(([k, v]) => `  ${k}: ${v};`).join('\n')}\n}`,
].join('\n\n')
document.head.prepend(style)

function Preview() {
  const [id, setId] = useState<string | null>(null)
  const view = new URLSearchParams(location.search).get('view') === 'month' ? 'month' : 'day'
  if (id) {
    return (
      <EventDetailScreen
        id={id}
        account={null}
        saved={[]}
        onSavedChange={() => undefined}
        onBack={() => setId(null)}
        onOpenEvent={setId}
        onOpenDay={() => setId(null)}
      />
    )
  }
  return (
    <EventsScreen
      account={null}
      canReview={false}
      view={view}
      onOpenEvent={setId}
      onBack={() => undefined}
      onAccount={() => undefined}
      onReview={() => undefined}
    />
  )
}

createRoot(document.getElementById('root')!).render(<StrictMode><Preview /></StrictMode>)
