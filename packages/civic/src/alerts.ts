/**
 * What a resident has agreed to be interrupted by.
 *
 * This is the smallest surface in section 9 and the one with the most product
 * in it, because of a fact the design states plainly: **notification permission
 * is spent once.** A resident installs Town Square in July to find out what is
 * on this weekend. If the first three pushes are a planning commission agenda,
 * a leaf pickup schedule and a heat advisory, notifications are off by August,
 * and they are off in November when the ice storm comes. So the default is
 * conservative on purpose and the settings screen is an argument for turning
 * things *on*, made after the app has earned it.
 *
 * Three rules are enforced here rather than in a route or a screen.
 *
 * **The emergency channel cannot be stored as off.** Not "is defaulted on", not
 * "is hard to turn off". There is no representable state of this record in
 * which an emergency does not reach a resident, because a preference store that
 * can hold `emergency: false` will eventually be asked to honour it, and the
 * request will come from a bug rather than from a person. The design draws it
 * as a switch that is visibly locked with an explanation, on the argument that
 * a control you cannot find is worse than one you cannot move — so the state is
 * legible, and it is legible because it is fixed.
 *
 * **Quiet hours hold advisories, never emergencies.** Same reason, same shape.
 *
 * **No address, ever.** Alerts match the town and zones a resident picks by
 * name. There is no field here for a location and no method that takes one.
 * Section 9 promises this in a sentence at the bottom of the screen; this file
 * is what makes the sentence true.
 */

import { LADDER, SEVERITIES, heldByQuietHours, reaches, type Severity } from './ladder.js'

export class AlertsError extends Error {
  constructor(
    readonly code: 'invalid' | 'not_found',
    message: string,
  ) {
    super(message)
    this.name = 'AlertsError'
  }
}

/**
 * Topics a resident can ask to hear about beyond the threshold.
 *
 * A closed set, named for what a resident would call them rather than for the
 * source that happens to produce them today. "School board and closings" is one
 * topic because it is one thing a parent cares about, even though a closing and
 * an agenda arrive through different scrapers.
 */
export const ALERT_TOPICS = [
  'council_agendas',
  'school',
  'planning',
  'trash',
  'roads',
  'nuclear_one',
] as const

export type AlertTopic = (typeof ALERT_TOPICS)[number]

/** What each topic is called, and roughly what subscribing to it costs you. */
export const TOPIC_LABELS: Record<AlertTopic, string> = {
  council_agendas: 'City Council agendas',
  school: 'School board and closings',
  planning: 'Planning and rezonings',
  trash: 'Trash and recycling changes',
  roads: 'Road closures',
  nuclear_one: 'Arkansas Nuclear One notices',
}

/**
 * The default, which is the whole design.
 *
 * Urgent and up, quiet hours on. Most people never change this, which is why it
 * has to be right rather than merely defensible.
 */
export const DEFAULT_THRESHOLD: Severity = 'urgent'
export const DEFAULT_QUIET_FROM_MINUTE = 22 * 60
export const DEFAULT_QUIET_TO_MINUTE = 6 * 60 + 30

/**
 * The topics on by default.
 *
 * Chosen by what a resident would be annoyed to have missed rather than by what
 * is cheapest to send: a school closing and a bin day change reorganise a
 * morning, a rezoning notice does not.
 */
const DEFAULT_TOPICS: readonly AlertTopic[] = ['school', 'trash', 'roads', 'nuclear_one']

export interface AlertPreferences {
  townId: string
  userId: string
  /** The quietest rung that is allowed to push. `emergency` always is. */
  threshold: Severity
  quietHours: {
    enabled: boolean
    /** Minutes past midnight, in the town's timezone. Wraps past midnight. */
    fromMinute: number
    toMinute: number
  }
  topics: readonly AlertTopic[]
  updatedAt: number
}

export interface AlertPreferenceStore {
  get(townId: string, userId: string): Promise<AlertPreferences | null>
  put(prefs: AlertPreferences): Promise<AlertPreferences>
}

export function defaultPreferences(
  townId: string,
  userId: string,
  now: number,
): AlertPreferences {
  return {
    townId,
    userId,
    threshold: DEFAULT_THRESHOLD,
    quietHours: {
      enabled: true,
      fromMinute: DEFAULT_QUIET_FROM_MINUTE,
      toMinute: DEFAULT_QUIET_TO_MINUTE,
    },
    topics: DEFAULT_TOPICS,
    updatedAt: now,
  }
}

export interface AlertsOptions {
  store: AlertPreferenceStore
  now?: () => number
}

/** What the settings screen renders, defaults and locked state included. */
export interface AlertSettingsView {
  preferences: AlertPreferences
  /** Every rung, with what choosing it actually costs. */
  rungs: Array<{
    severity: Severity
    label: string
    consequence: string
    /** True for the one that cannot be moved. Rendered, not hidden. */
    locked: boolean
    selected: boolean
  }>
  topics: Array<{ topic: AlertTopic; label: string; on: boolean }>
  /**
   * Said out loud rather than enforced silently, because a person who finds out
   * at 3am that they could not have turned it off is a person who no longer
   * believes the rest of the screen.
   */
  emergencyNote: string
}

export class Alerts {
  private readonly store: AlertPreferenceStore
  private readonly clock: () => number

  constructor(opts: AlertsOptions) {
    this.store = opts.store
    this.clock = opts.now ?? (() => Date.now())
  }

  /** A resident who has never opened this screen still has preferences. */
  async forUser(townId: string, userId: string): Promise<AlertPreferences> {
    return (await this.store.get(townId, userId)) ?? defaultPreferences(townId, userId, this.clock())
  }

  async view(townId: string, userId: string): Promise<AlertSettingsView> {
    const preferences = await this.forUser(townId, userId)
    return {
      preferences,
      rungs: SEVERITIES.map((severity) => ({
        severity,
        label: LADDER[severity].label,
        consequence: LADDER[severity].consequence,
        // "Emergency only" is a selectable threshold. The rung itself is what
        // is locked: choosing a higher threshold silences everything below it,
        // and no threshold silences an emergency.
        locked: LADDER[severity].breaksThroughSilent,
        selected: preferences.threshold === severity,
      })),
      topics: ALERT_TOPICS.map((topic) => ({
        topic,
        label: TOPIC_LABELS[topic],
        on: preferences.topics.includes(topic),
      })),
      emergencyNote:
        'An emergency always comes through, and it comes through on silent. There is no setting that turns that off.',
    }
  }

  /**
   * Save a change.
   *
   * Every field is optional and absent means unchanged, so the settings screen
   * can send one switch rather than the whole record and two devices editing
   * different rows do not overwrite each other's.
   */
  async update(
    townId: string,
    userId: string,
    patch: {
      threshold?: unknown
      quietHours?: { enabled?: unknown; fromMinute?: unknown; toMinute?: unknown }
      topics?: unknown
    },
  ): Promise<AlertPreferences> {
    const current = await this.forUser(townId, userId)

    const threshold =
      patch.threshold === undefined ? current.threshold : severity(patch.threshold)

    const quietHours = patch.quietHours
      ? {
          enabled:
            patch.quietHours.enabled === undefined
              ? current.quietHours.enabled
              : bool(patch.quietHours.enabled, 'quietHours.enabled'),
          fromMinute:
            patch.quietHours.fromMinute === undefined
              ? current.quietHours.fromMinute
              : minute(patch.quietHours.fromMinute, 'quietHours.fromMinute'),
          toMinute:
            patch.quietHours.toMinute === undefined
              ? current.quietHours.toMinute
              : minute(patch.quietHours.toMinute, 'quietHours.toMinute'),
        }
      : current.quietHours

    const topics = patch.topics === undefined ? current.topics : topicList(patch.topics)

    return this.store.put({
      townId,
      userId,
      threshold,
      quietHours,
      topics,
      updatedAt: this.clock(),
    })
  }

  /**
   * Whether one notice reaches one resident right now, and how.
   *
   * The single decision point. Everything about who hears what is answered
   * here, so a second delivery channel later cannot arrive at a different
   * answer by reimplementing four checks and getting three of them right.
   *
   * There is no push infrastructure in Town Square yet, so nothing calls this
   * to actually send anything. It is the rule, tested, waiting for a sender.
   */
  decide(
    preferences: AlertPreferences,
    notice: { severity: Severity; topic?: AlertTopic | null },
    minuteOfDay: number,
  ): { push: boolean; heldUntilMorning: boolean; reason: string } {
    if (LADDER[notice.severity].breaksThroughSilent) {
      return {
        push: true,
        heldUntilMorning: false,
        reason: 'an emergency reaches everybody, on silent, whatever the settings say',
      }
    }

    if (!LADDER[notice.severity].pushes) {
      return {
        push: false,
        heldUntilMorning: false,
        // Not a preference and not a failure: this rung never reaches a lock
        // screen for anybody. It is in the app and in the weekly digest.
        reason: 'informational notices do not push, for anyone',
      }
    }

    const byTopic = notice.topic != null && preferences.topics.includes(notice.topic)
    if (!reaches(notice.severity, preferences.threshold) && !byTopic) {
      return {
        push: false,
        heldUntilMorning: false,
        reason: `below this resident's threshold of ${preferences.threshold}`,
      }
    }

    if (
      preferences.quietHours.enabled &&
      heldByQuietHours(notice.severity) &&
      inQuietHours(preferences.quietHours, minuteOfDay)
    ) {
      return { push: true, heldUntilMorning: true, reason: 'held by quiet hours until morning' }
    }

    return { push: true, heldUntilMorning: false, reason: 'clears the threshold' }
  }
}

/** Quiet hours wrap past midnight, which is the only interesting case. */
export function inQuietHours(
  quiet: { fromMinute: number; toMinute: number },
  minuteOfDay: number,
): boolean {
  if (quiet.fromMinute === quiet.toMinute) return false
  return quiet.fromMinute < quiet.toMinute
    ? minuteOfDay >= quiet.fromMinute && minuteOfDay < quiet.toMinute
    : minuteOfDay >= quiet.fromMinute || minuteOfDay < quiet.toMinute
}

function severity(value: unknown): Severity {
  if (typeof value !== 'string' || !SEVERITIES.includes(value as Severity)) {
    throw new AlertsError('invalid', `threshold must be one of ${SEVERITIES.join(', ')}`)
  }
  return value as Severity
}

function bool(value: unknown, field: string): boolean {
  if (typeof value !== 'boolean') throw new AlertsError('invalid', `${field} must be true or false`)
  return value
}

function minute(value: unknown, field: string): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0 || value > 1439) {
    throw new AlertsError('invalid', `${field} must be a minute of the day, 0 to 1439`)
  }
  return value
}

function topicList(value: unknown): readonly AlertTopic[] {
  if (!Array.isArray(value)) throw new AlertsError('invalid', 'topics must be a list')
  const out: AlertTopic[] = []
  for (const entry of value) {
    if (typeof entry !== 'string' || !ALERT_TOPICS.includes(entry as AlertTopic)) {
      throw new AlertsError('invalid', `topics must be from ${ALERT_TOPICS.join(', ')}`)
    }
    if (!out.includes(entry as AlertTopic)) out.push(entry as AlertTopic)
  }
  return out
}

export class MemoryAlertPreferenceStore implements AlertPreferenceStore {
  private readonly rows = new Map<string, AlertPreferences>()

  private key(townId: string, userId: string): string {
    return `${townId} ${userId}`
  }

  async get(townId: string, userId: string): Promise<AlertPreferences | null> {
    const row = this.rows.get(this.key(townId, userId))
    return row ? { ...row, topics: [...row.topics] } : null
  }

  async put(prefs: AlertPreferences): Promise<AlertPreferences> {
    const row: AlertPreferences = { ...prefs, topics: [...prefs.topics] }
    this.rows.set(this.key(prefs.townId, prefs.userId), row)
    return { ...row, topics: [...row.topics] }
  }
}
