import { describe, expect, it } from 'vitest'
import { needOf, NEEDS, type NeedId } from './needs.js'
import seniorResources from './senior-resources.json'

const rows = seniorResources as Array<{ company: string; industry: string }>
const needFor = (company: string): NeedId => {
  const row = rows.find((r) => r.company === company)
  if (!row) throw new Error(`no chamber row named ${company}`)
  return needOf({ name: row.company, category: row.industry })
}

describe('needOf, on the chamber list', () => {
  it.each<[string, NeedId]>([
    // Rule order matters for each of these.
    ['Atkins Nursing & Rehabilitation Center', 'living'], // not therapy
    ['The Arbors Independent Living Community', 'living'], // "Independent" is not "dent"
    ['Lieblong Eye Clinic', 'teeth-eyes'], // chamber files it under Government Relations
    ['Baptist Health Family Clinic - Russellville', 'doctors'],
    ["Alzheimer's Arkansas Programs and Services", 'memory'], // not the nonprofit catch-all
    ['Center Valley Memorial Gardens', 'farewell'], // "Memorial" is not memory
    ['Digital Alarm Systems', 'home'],
    ['TMS Arkansas', 'memory'],
    ['Russellville Police Department', 'community'], // "Department" is not "dent"
    ['QualChoice', 'money'],
    ['Village tours Travel', 'everyday'],
    ['Russellville Housing Authority', 'living'],
  ])('%s → %s', (company, need) => {
    expect(needFor(company)).toBe(need)
  })

  it('puts every chamber row in a group by a rule, not by falling through', () => {
    const unmatched = rows.filter((r) => {
      const text = `${r.company} ${r.industry}`
      return !NEEDS.some((n) => n.match.test(text))
    })
    expect(unmatched.map((r) => r.company)).toEqual([])
  })
})

describe('needOf, on town directory categories', () => {
  it.each<[string, string, NeedId]>([
    ['Sunrise Senior Center', 'Senior citizen center', 'community'],
    ['River Valley Home Care', 'Home health care service', 'home'],
    ['CVS Pharmacy', 'Pharmacy', 'pharmacy'],
    ['Oak Manor', 'Nursing home', 'living'],
  ])('%s (%s) → %s', (name, category, need) => {
    expect(needOf({ name, category })).toBe(need)
  })
})
