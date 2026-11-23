import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { Icon, type IconName } from '../Icon.js'
import { cx } from './cx.js'
import { t } from '../i18n/index.js'
import {
  announce,
  dismissToast,
  pushToast,
  toastDuration,
  toastText,
  type Toast,
  type ToastKind,
} from './toastQueue.js'

/**
 * Toasts, and the one live region the app announces them through.
 *
 * A toast is for something that already happened somewhere you are not
 * looking. A failed action in the thing the resident is currently staring at
 * is **not** a toast: it is an inline message next to the work, because it
 * needs a decision from them and a toast is gone in eight seconds. See
 * `InlineError` and the failed-action pattern in section 10.
 *
 * The queueing rules live in `toastQueue.ts` and are tested there. What is
 * here is timers, the live region, and the pause-on-hover that makes an undo
 * button catchable.
 */

const ICONS: Record<ToastKind, IconName> = {
  info: 'info',
  good: 'check-circle',
  warn: 'warning',
  problem: 'alert-circle',
}

export interface ToastRequest {
  kind?: ToastKind
  message: string
  action?: { label: string; onAct: () => void; icon?: 'undo' | 'refresh' }
  plural?: (n: number) => string
}

interface ToastApi {
  show: (req: ToastRequest) => void
  dismiss: (id: string) => void
}

const Ctx = createContext<ToastApi | null>(null)

/**
 * Wrap the app once.
 *
 * The live region is mounted here and never re-rendered away, because a region
 * created at the same moment as its message announces nothing: the screen
 * reader has to have been watching the node before the text arrives.
 */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [list, setList] = useState<readonly Toast[]>([])
  const [spoken, setSpoken] = useState('')
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>())
  const counts = useRef(new Map<string, number>())
  const listRef = useRef<readonly Toast[]>([])
  const paused = useRef(false)
  const seq = useRef(0)

  const dismiss = useCallback((id: string) => {
    const t = timers.current.get(id)
    if (t) clearTimeout(t)
    timers.current.delete(id)
    setList((cur) => dismissToast(cur, id))
  }, [])

  const arm = useCallback(
    (toast: Toast) => {
      const ms = toastDuration(toast.kind, Boolean(toast.action))
      if (!ms || paused.current) return
      const existing = timers.current.get(toast.id)
      if (existing) clearTimeout(existing)
      timers.current.set(
        toast.id,
        setTimeout(() => dismiss(toast.id), ms),
      )
    },
    [dismiss],
  )

  /**
   * `show` only ever computes the next list.
   *
   * Timers and the announcement happen in the effect below, not in the state
   * updater. React calls an updater more than once in development, and a
   * `setTimeout` started in there is a timer nobody holds a handle to.
   */
  const show = useCallback((req: ToastRequest) => {
    const toast: Toast = {
      id: `t${(seq.current += 1)}`,
      kind: req.kind ?? 'info',
      message: req.message,
      action: req.action,
      plural: req.plural,
      count: 1,
    }
    setList((cur) => pushToast(cur, toast))
  }, [])

  useEffect(() => {
    listRef.current = list
    const held = timers.current
    // Anything that fell out of the stack takes its timer with it.
    const alive = new Set(list.map((t) => t.id))
    for (const [id, handle] of held) {
      if (!alive.has(id)) {
        clearTimeout(handle)
        held.delete(id)
      }
    }
    for (const t of list) {
      // A repeat restarts the clock. Collapsing three saves into one toast and
      // letting it expire on the first one's timer would hide the last two.
      const restart = counts.current.get(t.id) !== t.count
      counts.current.set(t.id, t.count)
      if (!held.has(t.id) || restart) arm(t)
    }
    for (const id of counts.current.keys()) if (!alive.has(id)) counts.current.delete(id)

    // The newest toast is the one that just arrived, collapsed count and all.
    const landed = list[list.length - 1]
    if (landed) setSpoken(announce(landed))
  }, [list, arm])

  // Clear every pending timer on unmount, so a route change does not leave a
  // setTimeout holding a reference to a dead component.
  useEffect(() => {
    const held = timers.current
    return () => {
      for (const h of held.values()) clearTimeout(h)
      held.clear()
    }
  }, [])

  /**
   * Hovering or focusing anything in the stack pauses every timer in it.
   *
   * Undo is only real if you can reach it, and reaching for it with a mouse is
   * exactly the moment the toast would otherwise disappear.
   */
  const hold = useCallback(() => {
    paused.current = true
    for (const h of timers.current.values()) clearTimeout(h)
    timers.current.clear()
  }, [])

  const release = useCallback(() => {
    paused.current = false
    for (const t of listRef.current) arm(t)
  }, [arm])

  const api = useMemo<ToastApi>(() => ({ show, dismiss }), [show, dismiss])

  return (
    <Ctx.Provider value={api}>
      {children}
      <div
        className="ts-toast-stack"
        onMouseEnter={hold}
        onMouseLeave={release}
        onFocus={hold}
        onBlur={release}
      >
        {list.map((t) => (
          <ToastCard key={t.id} toast={t} onDismiss={() => dismiss(t.id)} />
        ))}
      </div>
      {/*
       * Polite, and separate from the visible stack. The stack is a pile of
       * buttons; this is the sentence. Announcing the buttons as they mount
       * and unmount is how a screen reader ends up reading "Dismiss" four
       * times for one saved bookmark.
       */}
      <div className="ts-sr-only" role="status" aria-live="polite" aria-atomic="true">
        {spoken}
      </div>
    </Ctx.Provider>
  )
}

function ToastCard({ toast, onDismiss }: { toast: Toast; onDismiss: () => void }) {
  return (
    <div className="ts-toast" data-kind={toast.kind}>
      <Icon name={ICONS[toast.kind]} size={16} />
      <span className="ts-toast-t">{toastText(toast)}</span>
      {toast.action ? (
        <button
          type="button"
          className="ts-toast-act"
          onClick={() => {
            toast.action?.onAct()
            onDismiss()
          }}
        >
          {toast.action.icon === 'refresh' ? <Icon name="refresh" size={14} /> : null}
          {toast.action.icon === 'undo' ? <Icon name="history" size={14} /> : null}
          <span>{toast.action.label}</span>
        </button>
      ) : null}
      {/* A 16px glyph in a 44px button, which is the rule everywhere. */}
      <button type="button" className="ts-toast-x" aria-label={t('Dismiss')} onClick={onDismiss}>
        <Icon name="close" size={16} />
      </button>
    </div>
  )
}

/**
 * Raise a toast from anywhere under the provider.
 *
 * Throws rather than no-oping when the provider is missing: a toast that
 * silently never appears is a bug that surfaces in front of a resident, at the
 * one moment the app was trying to tell them something.
 */
export function useToast(): ToastApi {
  const api = useContext(Ctx)
  if (!api) throw new Error('useToast needs a <ToastProvider> above it')
  return api
}

/**
 * The assertive region, and the only one in Town Square.
 *
 * A failed submission interrupts, because the resident is about to walk away
 * believing their post went out. Everything else is polite. A region that
 * always shouts is a region people turn off.
 */
export function AlertRegion({ message, className }: { message: string; className?: string }) {
  return (
    <div className={cx('ts-sr-only', className)} role="alert" aria-live="assertive">
      {message}
    </div>
  )
}
