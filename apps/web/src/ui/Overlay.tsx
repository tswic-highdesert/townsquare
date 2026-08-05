import { useCallback, useEffect, useId, useRef, type KeyboardEvent, type ReactNode } from 'react'
import { cx } from './cx.js'
import { FOCUSABLE, acceptsScrimDismiss, wrapFocus } from './focusTrap.js'

/**
 * The two ways this app interrupts somebody, and the rules both obey.
 *
 * Interrupting a person is expensive, so an overlay has to be a question only
 * they can answer. Everything below is from section 10's focus and dismissal
 * list, and the ordering decisions are the ones that matter:
 *
 * - Focus moves to the **heading**, not to a button. Landing on "Remove
 *   listing" is how an accident happens.
 * - Tab is trapped. Shift+Tab from the first element wraps to the last.
 * - Escape closes everything, including a destructive confirm: Escape is the
 *   cancel path, and cancel is always safe.
 * - The scrim closes an informational sheet and does **not** close either
 *   confirm, because a stray thumb on a phone should not answer a question.
 * - On close, focus returns to the control that opened it, every time.
 * - The page behind stops scrolling. Background scroll under a sheet is the
 *   most common way this pattern breaks.
 * - One layer at a time. A dialog never opens another dialog; it replaces
 *   itself.
 */

export type OverlayKind = 'sheet' | 'confirm' | 'alert'

interface OverlayProps {
  open: boolean
  onClose: () => void
  title: string
  /** `alert` for a destructive answer, and only then. */
  kind?: OverlayKind
  /** The sentence under the title. On a destructive confirm it does the real work. */
  description?: ReactNode
  children?: ReactNode
  /** Buttons. The safe choice goes first, so it is the easy target. */
  actions?: ReactNode
  className?: string
}

function useOverlay(open: boolean, onClose: () => void, kind: OverlayKind) {
  const ref = useRef<HTMLDivElement | null>(null)
  const opener = useRef<Element | null>(null)

  useEffect(() => {
    if (!open) return
    opener.current = document.activeElement
    const node = ref.current
    const heading = node?.querySelector<HTMLElement>('[data-overlay-title]')
    heading?.focus()

    const { overflow } = document.body.style
    document.body.style.overflow = 'hidden'

    return () => {
      document.body.style.overflow = overflow
      // Back where they were, every time. A dialog that dumps focus on <body>
      // sends a keyboard user to the top of the page to find their place again.
      const back = opener.current
      if (back instanceof HTMLElement) back.focus()
    }
  }, [open])

  const onKeyDown = useCallback(
    (e: KeyboardEvent<HTMLDivElement>) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        onClose()
        return
      }
      if (e.key !== 'Tab') return
      const node = ref.current
      if (!node) return
      const items = Array.from(node.querySelectorAll<HTMLElement>(FOCUSABLE))
      const target = wrapFocus({
        count: items.length,
        current: items.indexOf(document.activeElement as HTMLElement),
        shiftKey: e.shiftKey,
      })
      if (target === null) return
      e.preventDefault()
      items[target]?.focus()
    },
    [onClose],
  )

  const onScrim = useCallback(() => {
    if (acceptsScrimDismiss(kind)) onClose()
  }, [kind, onClose])

  return { ref, onKeyDown, onScrim }
}

/**
 * A centred dialog. Interrupts on purpose, so it says why in one sentence.
 *
 * A dialog that only says "Are you sure?" has asked a resident to guess. Name
 * what is lost, count it, and say what recovery would cost.
 */
export function Modal({
  open,
  onClose,
  title,
  kind = 'confirm',
  description,
  children,
  actions,
  className,
}: OverlayProps) {
  const id = useId()
  const { ref, onKeyDown, onScrim } = useOverlay(open, onClose, kind)
  if (!open) return null

  return (
    <div className="ts-overlay" data-layer="modal">
      <div className="ts-scrim" onClick={onScrim} aria-hidden="true" />
      <div
        ref={ref}
        className={cx('ts-modal', className)}
        // `alertdialog` only where the answer is destructive. Using it for
        // every confirm is how the distinction stops carrying anything.
        role={kind === 'alert' ? 'alertdialog' : 'dialog'}
        aria-modal="true"
        aria-labelledby={`${id}-t`}
        aria-describedby={description ? `${id}-d` : undefined}
        onKeyDown={onKeyDown}
      >
        <h2 className="ts-modal-t" id={`${id}-t`} data-overlay-title tabIndex={-1}>
          {title}
        </h2>
        {description ? (
          <p className="ts-modal-s" id={`${id}-d`}>
            {description}
          </p>
        ) : null}
        {children}
        {actions ? <div className="ts-modal-acts">{actions}</div> : null}
      </div>
    </div>
  )
}

/**
 * A sheet, which rises from the bottom on a phone and becomes a centred dialog
 * at 640px and up. Same markup, one media query, in `ui.css`.
 *
 * Sheets are informational by default, which is why the scrim closes them.
 */
export function BottomSheet({
  open,
  onClose,
  title,
  description,
  children,
  actions,
  className,
}: Omit<OverlayProps, 'kind'>) {
  const id = useId()
  const { ref, onKeyDown, onScrim } = useOverlay(open, onClose, 'sheet')
  if (!open) return null

  return (
    <div className="ts-overlay" data-layer="sheet">
      <div className="ts-scrim" onClick={onScrim} aria-hidden="true" />
      <div
        ref={ref}
        className={cx('ts-sheet', className)}
        role="dialog"
        aria-modal="true"
        aria-labelledby={`${id}-t`}
        onKeyDown={onKeyDown}
      >
        <span className="ts-sheet-grab" aria-hidden="true" />
        <h2 className="ts-sheet-t" id={`${id}-t`} data-overlay-title tabIndex={-1}>
          {title}
        </h2>
        {description ? <p className="ts-sheet-p">{description}</p> : null}
        {children}
        {actions ? <div className="ts-sheet-acts">{actions}</div> : null}
      </div>
    </div>
  )
}
