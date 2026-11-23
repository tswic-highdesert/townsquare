/**
 * Plain-language "what do you need?" groups for the directory.
 *
 * The chamber's industry labels describe the business, not the help a senior
 * or caregiver is looking for (an eye clinic is filed under "Government
 * Relations", most of the list under "Healthcare"). Each entry is sorted into
 * one need by matching its name and category against the rules below, in
 * order, so the first match wins. Town directory listings go through the same
 * rules, which is why this is pattern-based rather than a list of names.
 */

import type { DirectoryEntry } from './directory.js'

export type NeedId =
  | 'living'
  | 'home'
  | 'memory'
  | 'doctors'
  | 'therapy'
  | 'teeth-eyes'
  | 'pharmacy'
  | 'money'
  | 'community'
  | 'everyday'
  | 'farewell'

export interface Need {
  id: NeedId
  label: string
  /** One line under the label, in the words a resident would use. */
  hint: string
  /** Tested against `${name} ${category}`, case-insensitive. */
  match: RegExp
}

/** In display order. Rule order (first match wins) is `RULE_ORDER` below. */
export const NEEDS: Need[] = [
  {
    id: 'living',
    label: 'A place to live',
    hint: 'Senior living, nursing care, housing help',
    match: /senior living|independent living|assisted living|nursing|manor|arbors|housing/i,
  },
  {
    id: 'home',
    label: 'Care at home',
    hint: 'Home health, hospice, medical alarms',
    match: /home health|hospice|alarm/i,
  },
  {
    id: 'memory',
    label: 'Memory & mental health',
    hint: "Alzheimer's support, counseling, wellness",
    match: /alzheimer|dementia|memory|mental health|tms |wellness|counsel/i,
  },
  {
    id: 'doctors',
    label: 'Doctors & hospitals',
    hint: 'Clinics, hospitals, specialists, air ambulance',
    match:
      /clinic|hospital|medical|health system|surgery|radiolog|dermatolog|orthopedic|foot|physician|drs\.|survival flight/i,
  },
  {
    id: 'therapy',
    label: 'Therapy & rehab',
    hint: 'Physical therapy, chiropractic, pain relief',
    match: /physical therapy|rehabilitation|chiropract|path to relief/i,
  },
  {
    id: 'teeth-eyes',
    label: 'Teeth & eyes',
    hint: 'Dentists and eye doctors',
    // Not a bare /dent/: that would catch "Independent Living".
    match: /dentist|dental|d\.d\.s|\beye|optom|vision/i,
  },
  {
    id: 'pharmacy',
    label: 'Pharmacy',
    hint: 'Prescriptions and drug stores',
    match: /pharmac|drug/i,
  },
  {
    id: 'money',
    label: 'Money & insurance',
    hint: 'Banks, advisors, insurance, accounting',
    match: /bank|wealth|financial|edward jones|insurance|qualchoice|accounting/i,
  },
  {
    id: 'community',
    label: 'Public & community help',
    hint: 'City services, police, assistance programs',
    match: /city of|police|arvac|governmental|nonprofit|senior citizen center|community/i,
  },
  {
    id: 'everyday',
    label: 'Everyday errands',
    hint: 'Laundry, cleaners, storage, travel',
    match: /laundry|cleaners|storage|travel|tours/i,
  },
  {
    id: 'farewell',
    label: 'Funeral & memorial',
    hint: 'Funeral homes and memorial gardens',
    match: /funeral|memorial gardens|cemetery/i,
  },
]

/**
 * The order rules are tried in. More specific groups go first, so "Atkins
 * Nursing & Rehabilitation" is a place to live (not therapy), "Baptist Health
 * Family Clinic" is a doctor (not the "family services" catch-all), and an
 * "Eye Clinic" is eyes (not doctors).
 */
const RULE_ORDER: NeedId[] = [
  'living',
  'home',
  'farewell',
  'memory',
  'teeth-eyes',
  'pharmacy',
  'therapy',
  'doctors',
  'money',
  'everyday',
  'community',
]

const byId = new Map(NEEDS.map((n) => [n.id, n]))

/** The need an entry belongs to, or `community` when nothing matches. */
export function needOf(entry: Pick<DirectoryEntry, 'name' | 'category'>): NeedId {
  const text = `${entry.name} ${entry.category}`
  for (const id of RULE_ORDER) {
    if (byId.get(id)!.match.test(text)) return id
  }
  return 'community'
}

export function needLabel(id: NeedId): string {
  return byId.get(id)?.label ?? id
}
