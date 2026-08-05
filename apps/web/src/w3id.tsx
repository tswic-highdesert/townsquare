// TEMPORARY audit harness: none of apps/web/src/identity/** is wired into the
// shell, so this is the only way to see the screens. Delete after screenshots.
import { createRoot } from 'react-dom/client'
import { cssVariables, fontFaceCss } from '@townsquare/tokens'
import './ui/ui.css'
import './styles/index.css'
import { SignIn, UnlockTable, VerificationCard, Vouching, WhatWeHold, ReportForm } from './identity/index.js'
import type { AccountView } from './session.js'

const style = document.createElement('style')
style.textContent = [fontFaceCss('/fonts'), `:root {\n${Object.entries(cssVariables()).map(([k,v]) => `  ${k}: ${v};`).join('\n')}\n}`].join('\n\n')
document.head.prepend(style)

const unverified: AccountView = {
  handle: 'plainresident', emailConfirmed: true, role: 'user', verified: false,
  verifiedMethod: null, canSubmit: false,
  vouches: { available: 0, budget: 10, used: 0, windowDays: 90 },
} as AccountView

const verified: AccountView = {
  handle: 'tswic', emailConfirmed: true, role: 'admin', verified: true,
  verifiedMethod: 'vouch', canSubmit: true,
  vouches: { available: 7, budget: 10, used: 3, windowDays: 90 },
} as AccountView

const q = new URLSearchParams(location.search)
const who = q.get('who') === 'verified' ? verified : unverified

function Section({ t, children }: { t: string; children: React.ReactNode }) {
  return <div style={{ padding: '24px 16px', borderTop: '2px solid #0002' }}>
    <div style={{ font: '600 11px/1 monospace', letterSpacing: '.12em', textTransform: 'uppercase', opacity: .5, marginBottom: 12 }}>{t}</div>
    <div className="id-screen">{children}</div>
  </div>
}

createRoot(document.getElementById('root')!).render(
  <div style={{ background: 'var(--ts-cream)', minHeight: '100vh' }}>
    <Section t="SignIn — front door"><SignIn onBack={() => undefined} /></Section>
    <Section t="VerificationCard"><VerificationCard account={who} /></Section>
    <Section t="UnlockTable"><UnlockTable account={who} /></Section>
    <Section t="Vouching"><Vouching account={who} onAccountChange={() => undefined} /></Section>
    <Section t="WhatWeHold"><WhatWeHold account={who} /></Section>
    <Section t="ReportForm — verified"><ReportForm slug="x" name="The Burrito Index" account={{ handle: who.handle, verified: who.verified }} onClose={() => undefined} /></Section>
  </div>
)
