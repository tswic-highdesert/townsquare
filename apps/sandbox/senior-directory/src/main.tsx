import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { app } from '@townsquare/sdk'
import { App } from './App.js'
import './styles.css'

const root = document.getElementById('root')
if (!root) throw new Error('index.html is missing <div id="root">')

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

// Tell Town Square we have painted. The host shows a "did not load" state if
// this has not happened within 10 seconds, so call it as soon as the first
// render is queued, not after data arrives. Outside React on purpose:
// StrictMode runs effects twice in development, and this must happen once.
requestAnimationFrame(() => app.ready())

// Report our height so Town Square sizes the frame to fit, instead of leaving
// it at its 320px default with a scrollbar inside. The SDK docs say the host
// measures "auto" creations itself, but the host cannot see into a
// cross-origin frame and nothing does that yet, so we report it. `#root` is
// measured, not the document, because the document is at least as tall as the
// frame and so could never shrink. The host clamps to 200-4000px.
let lastHeight = 0
let queued = false
new ResizeObserver(() => {
  if (queued) return
  queued = true
  requestAnimationFrame(() => {
    queued = false
    const height = Math.ceil(root.getBoundingClientRect().height)
    if (height !== lastHeight) {
      lastHeight = height
      app.setHeight(height)
    }
  })
}).observe(root)
