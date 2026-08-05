import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { cssVariables, fontFaceCss, townCss } from '@townsquare/tokens'
import { App } from './App.js'
import './ui/ui.css'
import './styles/index.css'

/**
 * The shell takes its palette from the same tokens a creation gets.
 *
 * Injected at startup rather than duplicated into a stylesheet, so the shell
 * and everything running inside it are the same colour by construction. A
 * hand-copied hex in `styles/` is exactly how a shell and its creations drift
 * apart, and the drift is invisible until you put them side by side.
 */
const style = document.createElement('style')
style.textContent = [
  fontFaceCss('/fonts'),
  `:root {\n${Object.entries(cssVariables())
    .map(([k, v]) => `  ${k}: ${v};`)
    .join('\n')}\n}`,
  // The theming seam, shipped rather than described. Setting data-town on any
  // ancestor reskins everything below it, including a creation in a frame,
  // without reloading it or telling it. A seam nothing exercises is a seam
  // that breaks silently, so it is in the shell even though the shell only
  // ever renders one town.
  townCss(),
].join('\n\n')
document.head.prepend(style)

const root = document.getElementById('root')
if (!root) throw new Error('no #root')

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
