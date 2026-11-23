import { useState } from 'react'
import { Button, InlineError, TextInput } from '../ui/index.js'
import { Icon } from '../Icon.js'
import { isError, passwordAccount, type AccountView } from '../session.js'
import { t } from '../i18n/index.js'
import './identity.css'

export interface SignInProps {
  onBack(): void
  onAccountChange(account: AccountView): void
}

export function SignIn(props: SignInProps) {
  const [mode, setMode] = useState<'signin' | 'signup'>('signin')
  const [handle, setHandle] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [problem, setProblem] = useState<string | null>(null)

  async function submit() {
    setBusy(true)
    setProblem(null)
    try {
      const result = await passwordAccount(mode, handle, password)
      if (isError(result)) setProblem(result.message)
      else {
        setPassword('')
        props.onAccountChange(result)
      }
    } catch {
      setProblem(t('We could not reach Town Square. Check your connection and try again.'))
    } finally { setBusy(false) }
  }

  return <main className="id-screen">
    <Button variant="quiet" size="sm" icon="arrow-left" className="id-back" onClick={props.onBack}>{t('Back')}</Button>
    <p className="id-eyebrow">{t('Your corner of the River Valley')}</p>
    <h1 className="id-h1">{mode === 'signup' ? t('Make yourself at home') : t('Welcome back')}</h1>
    <p className="id-lede">{t('Save places and stories for later, and help keep local information useful. Browsing is always open to everyone.')}</p>
    <form className="id-form" onSubmit={(event) => { event.preventDefault(); void submit() }}>
      <TextInput label={t('Handle')} value={handle} onChange={(event) => setHandle(event.target.value)} autoComplete="username" required minLength={3} maxLength={24} placeholder={t('what your neighbors see')} help={t('3 to 24 characters. Letters, numbers, and . _ - only.')} />
      <TextInput label={t('Password')} type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete={mode === 'signup' ? 'new-password' : 'current-password'} required minLength={12} maxLength={128} help={t('At least 12 characters. A few memorable words work well.')} />
      {problem && <InlineError live>{problem}</InlineError>}
      <div className="id-actions">
        <Button variant="primary" size="lg" full loading={busy} type="submit">{mode === 'signup' ? t('Create my account') : t('Sign in')}</Button>
        <Button variant="quiet" full disabled={busy} onClick={() => { setMode(mode === 'signup' ? 'signin' : 'signup'); setProblem(null); setPassword('') }}>{mode === 'signup' ? t('I already have an account') : t('New here? Create an account')}</Button>
      </div>
    </form>
    <p className="id-fine"><Icon name="lock" size={14} />{t('No email, name, address, or phone required. Keep your password somewhere safe: password recovery is not available yet.')}</p>
    {mode === 'signup' && <p className="id-note">{t('An account lets you save and suggest corrections. It does not mark you as a verified resident.')}</p>}
  </main>
}
