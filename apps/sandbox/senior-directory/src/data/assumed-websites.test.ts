import { describe, expect, it } from 'vitest'
import assumedWebsites from './assumed-websites.json'
import seniorResources from './senior-resources.json'

const names = new Set((seniorResources as Array<{ company: string }>).map((r) => r.company))
const entries = Object.entries(assumedWebsites as Record<string, string>)

describe('assumed-websites.json', () => {
  it('names only places on the chamber list, spelled exactly', () => {
    // A typo here would silently drop the website, so catch it.
    expect(entries.map(([name]) => name).filter((name) => !names.has(name))).toEqual([])
  })

  it('holds only web addresses', () => {
    expect(entries.filter(([, url]) => !/^https?:\/\/[^/\s]+\.[a-z]{2,}/i.test(url))).toEqual([])
  })
})
