/**
 * Page headers in three registers. `design/hifi-v2` section 02, specimen 8.
 *
 * Editorial says what this is, utility says where you came from, host says
 * this is not us. The difference between them is how much chrome the page has
 * earned:
 *
 * - **Editorial** has no chrome at all, because the title is the page. Serif,
 *   large, an optional mono eyebrow above it.
 * - **Utility** has a back control and exactly one action. Two actions is a
 *   menu wearing a disguise, so the prop only takes one.
 * - **Host** is the seam a resident can feel. It is the one header set on
 *   navy, it names the neighbour who built the thing, and it says out loud
 *   what the sandbox can see. A creation that looked exactly like the rest of
 *   the app would be more elegant and much worse: the whole trust model
 *   depends on a resident knowing when they have stepped into something a
 *   neighbour wrote.
 *
 * The close control on a host header is a cross rather than a chevron, because
 * you are leaving rather than going back. That is why `onBack` and `onClose`
 * are the same prop with a register-dependent glyph rather than two.
 */

import type { ReactNode } from 'react'
import { Icon } from '../Icon.js'
import { AppChip } from '../ui/index.js'

export type HeaderRegister = 'editorial' | 'utility' | 'host'

export interface PageHeaderProps {
  register: HeaderRegister
  title: string
  /** Mono, above the title. Editorial only: it labels the page. */
  eyebrow?: string
  subtitle?: ReactNode
  /**
   * Where the control goes, named. "Back" is not a place — a resident who
   * arrived from a shared link is still going to Today, and the label should
   * say Today.
   */
  back?: { label: string; onClick: () => void }
  /** One action, on the right. */
  action?: ReactNode
  /** Host only: the icon a creation supplied for itself. */
  icon?: ReactNode
}

export function PageHeader({
  register,
  title,
  eyebrow,
  subtitle,
  back,
  action,
  icon,
}: PageHeaderProps) {
  if (register === 'editorial') {
    return (
      <header className="ts-ph" data-register="editorial">
        {eyebrow && <div className="ts-ph-eyebrow">{eyebrow}</div>}
        <h1 className="ts-ph-title">{title}</h1>
        {subtitle && <p className="ts-ph-sub">{subtitle}</p>}
      </header>
    )
  }

  const host = register === 'host'

  return (
    <header className="ts-ph" data-register={register}>
      {back && (
        <button
          className="ts-ph-back"
          type="button"
          onClick={back.onClick}
          aria-label={host ? `Close ${title}` : `Back to ${back.label}`}
        >
          <Icon name={host ? 'close' : 'chevron-left'} size={20} />
        </button>
      )}
      {icon}
      <div className="ts-ph-stack">
        {host && <AppChip inverse />}
        <h1 className="ts-ph-title">{title}</h1>
        {subtitle && <p className="ts-ph-sub">{subtitle}</p>}
      </div>
      {action}
    </header>
  )
}

/**
 * Back on its own, where a page has no header to hang it off.
 *
 * The label names where you will land rather than saying the word "Back". A
 * resident who arrived from a shared link gets "Today" here too, because that
 * is where the control actually goes.
 */
export function BackTo({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button className="ts-back" type="button" onClick={onClick}>
      <Icon name="chevron-left" size={18} />
      {label}
    </button>
  )
}
