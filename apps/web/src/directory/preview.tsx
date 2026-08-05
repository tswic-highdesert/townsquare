import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { cssVariables, fontFaceCss } from '@townsquare/tokens'
import { Directory } from './Directory.js'
import '../ui/ui.css'
import '../styles/index.css'

const style = document.createElement('style')
style.textContent = [
  fontFaceCss('/fonts'),
  `:root {\n${Object.entries(cssVariables()).map(([k, v]) => `  ${k}: ${v};`).join('\n')}\n}`,
].join('\n\n')
document.head.prepend(style)

const root = document.getElementById('root')
if (!root) throw new Error('no #root')
createRoot(root).render(
  <StrictMode>
    <Directory
      account={{ handle: 'tswic', verified: true, role: 'admin' } as never}
      canReview={false}
      saved={[]}
      onSavedChange={() => undefined}
      onTab={() => undefined}
      onAccount={() => undefined}
      onReview={() => undefined}
    />
  </StrictMode>,
)
