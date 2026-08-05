import { useCallback, useRef, useState, type ReactNode } from 'react'
import { Icon, type IconName } from '../Icon.js'
import { cx } from './cx.js'
import { nextFocusAfterRemoval, removalAnnouncement } from './rowRemoval.js'

/**
 * A row with one primary destination and small independent actions.
 *
 * **Contract: one primary destination, and up to two secondary actions that
 * must be reachable without going there first.**
 *
 * `Row` is one row, one target, and that is not a limitation to route around —
 * it is why `Row` can be an anchor. This is the other shape: ringing a shop
 * should not require opening its page, un-saving a thing should not require
 * visiting it, and neither action can live inside the link that goes there.
 *
 * ## Why this is a primitive rather than five local versions
 *
 * Not because five surfaces want it. Five hand-rolled rows that each work are
 * cheaper than a primitive nobody adopts. It is because **the correct
 * implementation has a wrong version that looks identical**: put the actions
 * inside the primary anchor and you have an anchor inside an anchor. The
 * browser silently reparents it, the row still looks right, the mouse still
 * works — and a screen reader user gets a row they cannot operate. That is the
 * kind of mistake that belongs in one reviewed place.
 *
 * ## The mechanism
 *
 * The container is **not** an anchor. The primary link sits inside it and is
 * stretched over the whole row with `::after { position: absolute; inset: 0 }`.
 * The secondary actions are siblings of that link, raised above it with
 * `position: relative`. So there is one large target and one or two small real
 * ones, no nesting, and tab order is document order: primary, then actions.
 *
 * ## The part that goes wrong
 *
 * A secondary action that removes its own row. The pressed button stops
 * existing, focus falls to `<body>`, and a keyboard user is returned to the
 * top of the page with no announcement. `SplitRowList` handles that: it moves
 * focus to the row that took the removed row's place and announces what
 * happened. The arithmetic is in `rowRemoval.ts`, tested, because it is the part
 * that can be wrong.
 */

export interface SplitAction {
  label: string
  icon?: IconName
  onAct: () => void
  /**
   * This action removes the row it is in.
   *
   * Tells `SplitRowList` to move focus and announce, rather than letting the
   * row vanish out from under the keyboard.
   */
  removes?: boolean
  /** Shown instead of the label for an icon-only action. Never optional. */
  iconOnly?: boolean
}

export interface SplitRowProps {
  /** The fixed leading block, same as `Row`. */
  lead?: ReactNode
  title: ReactNode
  meta?: ReactNode
  /** Where the whole row goes. */
  href?: string
  /** The href leaves town: adds `target="_blank" rel="noopener noreferrer"`. */
  external?: boolean
  /**
   * Two at most, and that is a real limit rather than a round number.
   *
   * A row with three small buttons on it is a menu wearing a row, and the
   * third one is always the one nobody can name from its icon.
   */
  actions?: SplitAction[]
  className?: string
}

export function SplitRow({
  lead,
  title,
  meta,
  href,
  external,
  actions = [],
  className,
}: SplitRowProps) {
  return (
    <div className={cx('ts-splitrow', className)} data-lead={lead ? '' : undefined}>
      {lead ? <span className="ts-row-lead">{lead}</span> : null}
      <span className="ts-row-body">
        {/*
          The stretched link. It covers the row through its own ::after rather
          than by wrapping anything, which is what keeps the actions out of it.
        */}
        {href ? (
          <a
            className="ts-splitrow-primary"
            href={href}
            target={external ? '_blank' : undefined}
            rel={external ? 'noopener noreferrer' : undefined}
          >
            {title}
          </a>
        ) : (
          <span className="ts-row-title">{title}</span>
        )}
        {meta ? <span className="ts-row-meta">{meta}</span> : null}
      </span>
      {actions.length > 0 ? (
        <span className="ts-splitrow-actions">
          {actions.slice(0, 2).map((a) => (
            <button
              key={a.label}
              type="button"
              className="ts-splitrow-action"
              data-icon-only={a.iconOnly || undefined}
              // An icon-only action still says what it does. There is no such
              // thing as an obvious glyph.
              aria-label={a.iconOnly ? a.label : undefined}
              onClick={a.onAct}
            >
              {a.icon ? <Icon name={a.icon} size={16} /> : null}
              {a.iconOnly ? null : <span>{a.label}</span>}
            </button>
          ))}
        </span>
      ) : null}
    </div>
  )
}

export interface SplitRowListProps<T> {
  items: readonly T[]
  /** Stable identity, used for keys and for finding the row after a removal. */
  itemKey: (item: T) => string
  /** What each row looks like. Return the props, not the element. */
  row: (item: T, index: number) => SplitRowProps
  /**
   * A name for the thing, used in the announcement after it is removed. Only
   * needed when a row can remove itself.
   */
  itemLabel?: (item: T) => string
  label: string
  framed?: boolean
  className?: string
}

/**
 * The list, which exists because focus after a removal is a list-level problem.
 *
 * A row cannot restore focus after it has stopped existing, so the thing that
 * owns the collection has to. Rendering `SplitRow` directly is fine when no
 * action removes anything.
 */
export function SplitRowList<T>({
  items,
  itemKey,
  row,
  itemLabel,
  label,
  framed = true,
  className,
}: SplitRowListProps<T>) {
  const listRef = useRef<HTMLUListElement | null>(null)
  const [announcement, setAnnouncement] = useState('')

  const handleRemoval = useCallback(
    (index: number, name: string, count: number) => {
      const target = nextFocusAfterRemoval({ count, removed: index })
      setAnnouncement(removalAnnouncement(name, count - 1))

      // After React has drawn the shorter list, not before: the row we want to
      // focus does not exist yet at the moment the click handler runs.
      requestAnimationFrame(() => {
        const list = listRef.current
        if (!list) return
        if (target.kind === 'list') {
          list.focus()
          return
        }
        const rows = list.querySelectorAll<HTMLElement>('li')
        const next = rows[target.index]
        /*
         * The primary, deliberately, and not the next remove button.
         *
         * Landing on the next destructive control would be convenient for
         * somebody clearing a list — one press, then another — and it is the
         * wrong default for everyone else, because it puts a delete under a
         * key the user is already pressing. It is the same rule the dialogs
         * follow: focus lands on the heading rather than on "Remove listing",
         * since landing on the destructive option is how an accident happens.
         * One extra Tab is a cheaper mistake than one extra deletion.
         */
        const focusable = next?.querySelector<HTMLElement>('a, button')
        focusable?.focus()
      })
    },
    [],
  )

  return (
    <>
      <ul
        ref={listRef}
        className={cx('ts-rows', className)}
        data-framed={framed || undefined}
        aria-label={label}
        // Focusable only as a fallback, when the last row has gone and there is
        // nothing else left to hold focus.
        tabIndex={-1}
      >
        {items.map((item, i) => {
          const props = row(item, i)
          return (
            <li key={itemKey(item)}>
              <SplitRow
                {...props}
                actions={props.actions?.map((a) =>
                  a.removes
                    ? {
                        ...a,
                        onAct: () => {
                          a.onAct()
                          handleRemoval(i, itemLabel?.(item) ?? 'Item', items.length)
                        },
                      }
                    : a,
                )}
              />
            </li>
          )
        })}
      </ul>
      {/*
        Mounted with the list rather than created on removal: a live region
        that appears at the same moment as its text announces nothing.
      */}
      <div className="ts-sr-only" role="status" aria-live="polite">
        {announcement}
      </div>
    </>
  )
}
