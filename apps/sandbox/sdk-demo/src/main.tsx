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
