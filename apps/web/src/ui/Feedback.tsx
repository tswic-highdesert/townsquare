import type { ReactNode } from 'react'
import { Icon, type IconName } from '../Icon.js'
import { cx } from './cx.js'
import { t } from '../i18n/index.js'

/**
 * The states a screen spends most of its life in.
 *
 * Town Square is assembled from a dozen scraped sources that break on their
 * own schedule and read on one bar of signal out past Lake Dardanelle, so
 * "empty", "loading" and "that source is down" are not footnotes to the happy
 * path, they are most Tuesdays. The components here are the ones from
 * `design/hifi-v2/sections/10-states`.
 *
 * The colour rule for all of them: every recoverable problem is terracotta.
 * Brick appears nowhere in this file. It is the one alarm register, and if a
 * resident learns it means "that handle is taken" then it means nothing at 6am
 * when the Illinois Bayou is over Weir Road.
 */

/* ── loading ────────────────────────────────────────────────────────────── */

export interface SkeletonProps {
  shape?: 'line' | 'block' | 'circle'
  /** CSS width. A skeleton line at 100% teaches a layout that will not arrive. */
  width?: string
  height?: number
  className?: string
}

/**
 * A skeleton's only job is to hold the exact shape the real thing will take.
 *
 * Measured against the live component, never drawn by eye: if the page shifts
 * when content lands, the skeleton failed and showing nothing would have been
 * more honest. The shimmer travels rather than pulsing, because a pulsing
 * block reads as broken and a travelling one reads as working, and it stops
 * entirely under reduced motion, leaving a flat fill that still reads as
 * pending.
 */
export function Skeleton({ shape = 'line', width, height, className }: SkeletonProps) {
  return (
    <span
      className={cx('ts-skel', className)}
      data-shape={shape}
      style={{ width, height }}
      // Never announced. A screen reader reading forty empty boxes is a worse
      // loading state than silence; the container carries `aria-busy` instead.
      aria-hidden="true"
    />
  )
}

export interface ProgressProps {
  /** Omit for indeterminate. Never invent a percentage we cannot count. */
  value?: number
  label: string
  state?: 'running' | 'done' | 'failed'
  className?: string
}

export function Progress({ value, label, state = 'running', className }: ProgressProps) {
  const indeterminate = value === undefined
  return (
    <div
      className={cx('ts-bar', className)}
      data-state={indeterminate ? 'indeterminate' : state}
      role="progressbar"
      aria-label={label}
      // Determinate bars carry their own value. Announcing each percent is
      // unusable, so nothing here is in a live region.
      aria-valuenow={indeterminate ? undefined : Math.round(value)}
      aria-valuemin={indeterminate ? undefined : 0}
      aria-valuemax={indeterminate ? undefined : 100}
    >
      <span className="ts-bar-fill" style={indeterminate ? undefined : { width: `${value}%` }} />
    </div>
  )
}

/* ── nothing there ──────────────────────────────────────────────────────── */

export type EmptyMark =
  | 'news'
  | 'calendar'
  | 'bookmark'
  | 'shelf'
  | 'lens'
  | 'sprout'
  | 'grid'
  | 'tray'

export interface EmptyStateProps {
  /**
   * The drawn mark. Optional, and dropped in a dense list slot where a 56px
   * illustration inside a 180px card reads as a broken card.
   */
  mark?: EmptyMark
  /** States the fact. Newsreader, never an apology. */
  line: string
  /** Says what happens next or what else is true. */
  sub?: ReactNode
  /** Only if there is genuinely somewhere better to be. */
  action?: { label: string; onAct: () => void }
  /** Centred when it owns the screen, left when it sits in a slot. */
  align?: 'center' | 'start'
  /** When it owns the screen, the line is the screen's `h1`. */
  heading?: boolean
  /**
   * `good` is the cleared moderation queue and the only empty in the product
   * that swaps its accent to sage: it is the one place where "there is nothing
   * here" is the outcome somebody was working toward. That is the whole
   * exception and it does not spread.
   */
  tone?: 'neutral' | 'good' | 'young'
  children?: ReactNode
  className?: string
}

/**
 * The voice test for `line`: read it out loud to a neighbour.
 *
 * "No results found" fails. "Oops, nothing here!" fails harder. "Nothing has
 * come in yet today" is what you would actually say, and it leaves room for
 * the possibility that something will.
 */
export function EmptyState({
  mark,
  line,
  sub,
  action,
  align = 'center',
  heading = false,
  tone = 'neutral',
  children,
  className,
}: EmptyStateProps) {
  const Line = heading ? 'h1' : 'p'
  return (
    <div
      className={cx('ts-empty', className)}
      data-align={align === 'start' ? 'start' : undefined}
      data-tone={tone === 'neutral' ? undefined : tone}
    >
      {mark ? <span className={`ts-mark ts-mark--${mark}`} aria-hidden="true" /> : null}
      <Line className="ts-empty-line">{line}</Line>
      {sub ? <p className="ts-empty-sub">{sub}</p> : null}
      {children}
      {action ? (
        <button type="button" className="ts-act" onClick={action.onAct}>
          {action.label}
        </button>
      ) : null}
    </div>
  )
}

/* ── something broke ────────────────────────────────────────────────────── */

export interface ErrorStateProps {
  /** The fact, in the words a resident uses: "the library calendar", not "events service". */
  line: string
  sub?: ReactNode
  onRetry?: () => void
  retryLabel?: string
  /**
   * `section` is one block down on an otherwise fine page, and it is the state
   * this app lives in. `screen` is everything down, which is rare and is the
   * only one of the two that gets to apologise.
   */
  scope?: 'section' | 'screen'
  mark?: EmptyMark
  /** Time, reference and status page. Only on a whole-screen failure. */
  meta?: string
  /** When nothing else on the screen loaded, the line is the screen's `h1`. */
  heading?: boolean
  children?: ReactNode
  className?: string
}

/**
 * A failed block is bounded and holds its own height.
 *
 * Nothing below it moves when the retry succeeds, which is the difference
 * between a page that recovered and a page that jumped. It does not shout,
 * because a library feed being down is not news.
 */
export function ErrorState({
  line,
  sub,
  onRetry,
  retryLabel = t('Try now'),
  scope = 'section',
  mark,
  meta,
  heading = false,
  children,
  className,
}: ErrorStateProps) {
  const Line = heading ? 'h1' : 'p'
  if (scope === 'screen') {
    return (
      <div className={cx('ts-screen-fail', className)}>
        {mark ? <span className={`ts-mark ts-mark--${mark}`} aria-hidden="true" /> : null}
        <Line className="ts-screen-fail-line">{line}</Line>
        {sub ? <p className="ts-screen-fail-sub">{sub}</p> : null}
        {children}
        {onRetry ? (
          <button type="button" className="ts-btn" data-variant="secondary" data-size="md" onClick={onRetry}>
            <Icon name="refresh" size={16} />
            <span>{retryLabel}</span>
          </button>
        ) : null}
        {meta ? <p className="ts-screen-meta">{meta}</p> : null}
      </div>
    )
  }

  return (
    <div className={cx('ts-sect-fail', className)}>
      <Line className="ts-sect-fail-line">{line}</Line>
      {sub ? <p className="ts-sect-fail-sub">{sub}</p> : null}
      {children}
      {onRetry ? (
        <button type="button" className="ts-act" onClick={onRetry}>
          <Icon name="refresh" size={14} />
          <span>{retryLabel}</span>
        </button>
      ) : null}
    </div>
  )
}

/**
 * The strip above data we are serving from a copy.
 *
 * This line is the only thing standing between "the app is quietly serving you
 * Tuesday" and a resident driving to a meeting that was cancelled. Removing it
 * to tidy a layout is the one change in this system that would be a genuine
 * failure. It always states the time of the copy, never just the word "stale".
 */
export function StaleStrip({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <p className={cx('ts-stale-strip', className)}>
      <Icon name="clock" size={14} />
      <span>{children}</span>
    </p>
  )
}

/**
 * A condition, not an event, which is why it is a banner and not a toast.
 *
 * The test: if the statement is still true in thirty seconds, a toast is the
 * wrong shape, because in thirty seconds the toast is gone and the truth is
 * not. Offline is a condition. Stale data is a condition. A feed being down is
 * a condition.
 */
export function Banner({
  tone = 'stale',
  icon = 'clock',
  title,
  children,
  action,
  className,
}: {
  tone?: 'stale' | 'offline' | 'slow' | 'back'
  icon?: IconName
  title?: string
  children: ReactNode
  action?: ReactNode
  className?: string
}) {
  return (
    <div className={cx('ts-banner', className)} data-tone={tone} role="status">
      <Icon name={icon} size={tone === 'stale' ? 22 : 16} />
      <div>
        {title ? <p className="ts-banner-t">{title}</p> : null}
        <p className="ts-banner-s">{children}</p>
      </div>
      {action}
    </div>
  )
}
