/**
 * The way into the other language.
 *
 * In the app bar it names the language you would switch *to*, in that
 * language and marked with its `lang`, because a resident who cannot read the
 * current screen can still find the word "Español". The choice is kept in this
 * browser, so the next visit opens in it.
 *
 * On the account screen it is a pressed-button pair, the system's control for
 * a global preference, so the current language is visible as well as the other.
 */

import { getLocale, LOCALES, setLocale, t } from './index.js'
import './language.css'

export function LanguageSwitch() {
  const other = LOCALES.find((locale) => locale.id !== getLocale())!
  return (
    <button
      type="button"
      className="ts-lang"
      lang={other.id}
      onClick={() => setLocale(other.id)}
    >
      {other.name}
    </button>
  )
}

export function LanguageChoice() {
  const current = getLocale()
  return (
    <div className="ts-seg ts-lang-group" role="group" aria-label={t('Language')}>
      {LOCALES.map((locale) => (
        <button
          key={locale.id}
          type="button"
          className="ts-seg-btn"
          lang={locale.id}
          aria-pressed={locale.id === current}
          onClick={() => setLocale(locale.id)}
        >
          {locale.name}
        </button>
      ))}
    </div>
  )
}
