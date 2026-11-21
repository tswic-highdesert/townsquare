import { describe, expect, it } from 'vitest'
import { checkOutboundLink, MAX_LINK_CHARS, type OutboundLink } from './links.js'

function ok(raw: string): OutboundLink {
  const r = checkOutboundLink(raw)
  if (!r.ok) throw new Error(`expected ${JSON.stringify(raw)} to pass: ${r.reason}`)
  return r.link
}

function refused(raw: unknown): string {
  const r = checkOutboundLink(raw)
  if (r.ok) throw new Error(`expected ${JSON.stringify(raw)} to be refused, got ${r.link.href}`)
  return r.reason
}

describe('web links', () => {
  it('accepts an https link and shows its host', () => {
    expect(ok('https://www.arkansas.gov/aging?x=1#top')).toEqual({
      kind: 'web',
      href: 'https://www.arkansas.gov/aging?x=1#top',
      host: 'www.arkansas.gov',
      secure: true,
      international: false,
    })
  })

  it('accepts http but marks it as not secure', () => {
    expect(ok('http://example.org')).toMatchObject({ secure: false, href: 'http://example.org/' })
  })

  it('normalises case, default ports and spaces', () => {
    expect(ok('  HTTPS://Example.ORG:443/a b  ')).toMatchObject({
      href: 'https://example.org/a%20b',
      host: 'example.org',
    })
  })

  it('shows a non-default port as part of the host', () => {
    expect(ok('https://example.org:8443/')).toMatchObject({ host: 'example.org:8443' })
  })

  it('shows a look-alike name in punycode and flags it', () => {
    // "аpple.com" with a Cyrillic а.
    const link = ok('https://аpple.com/')
    expect(link).toMatchObject({ host: 'xn--pple-43d.com', international: true })
  })

  it('refuses an embedded username or password', () => {
    expect(refused('https://bank.example@evil.example/')).toMatch(/username or password/)
    expect(refused('https://user:pass@example.org/')).toMatch(/username or password/)
  })

  it('refuses IP literals in every spelling', () => {
    for (const raw of [
      'http://127.0.0.1/',
      'http://0x7f.1/',
      'http://2130706433/',
      'http://192.168.1.1/admin',
      'http://[::1]/',
    ]) {
      expect(refused(raw), raw).toMatch(/IP address/)
    }
  })

  it('refuses private-network and single-label names', () => {
    for (const raw of [
      'http://localhost:3000/',
      'http://router.local/',
      'http://metadata.google.internal/',
      'http://printer.home.arpa/',
      'http://intranet/',
    ]) {
      expect(refused(raw), raw).toMatch(/not a public web address/)
    }
  })
})

describe('phone links', () => {
  it('keeps the number as written for display and dials digits only', () => {
    expect(ok('tel:+1 (479) 555-1212')).toEqual({
      kind: 'phone',
      href: 'tel:+14795551212',
      number: '+1 (479) 555-1212',
    })
  })

  it('accepts an extension', () => {
    expect(ok('tel:479.555.1212;ext=12')).toMatchObject({
      href: 'tel:4795551212;ext=12',
      number: '479.555.1212 ext. 12',
    })
    expect(ok('tel:4795551212,34')).toMatchObject({ href: 'tel:4795551212;ext=34' })
  })

  it('decodes a percent-encoded number', () => {
    expect(ok('tel:479%20555%201212')).toMatchObject({ href: 'tel:4795551212' })
  })

  it('refuses anything that is not a number', () => {
    for (const raw of ['tel:call-me', 'tel:12', 'tel:1234567890123456', 'tel:123?x=1', 'tel:555;ext=abc']) {
      refused(raw)
    }
  })
})

describe('email links', () => {
  it('accepts one address with a subject and body, and rebuilds the link', () => {
    expect(ok('mailto:Help@Example.ORG?subject=Rides%20to%20church&body=Hello')).toEqual({
      kind: 'email',
      href: 'mailto:Help@example.org?subject=Rides%20to%20church&body=Hello',
      to: 'Help@example.org',
      subject: 'Rides to church',
      hasBody: true,
    })
  })

  it('accepts a bare address', () => {
    expect(ok('mailto:info@chamber.org')).toMatchObject({ href: 'mailto:info@chamber.org', hasBody: false })
  })

  it('refuses cc, bcc and anything else that would copy the message elsewhere', () => {
    expect(refused('mailto:a@example.org?bcc=evil@example.net')).toMatch(/"bcc"/)
    expect(refused('mailto:a@example.org?cc=b@example.org')).toMatch(/"cc"/)
    expect(refused('mailto:a@example.org?to=b@example.org')).toMatch(/"to"/)
  })

  it('refuses more than one recipient', () => {
    expect(refused('mailto:a@example.org,b@example.org')).toMatch(/exactly one/)
    expect(refused('mailto:?subject=hi')).toMatch(/exactly one/)
  })
})

describe('everything else', () => {
  it('refuses schemes that run code or read local files', () => {
    for (const raw of [
      'javascript:alert(1)',
      'JavaScript:alert(1)',
      'data:text/html,<script>alert(1)</script>',
      'blob:https://example.org/uuid',
      'file:///etc/passwd',
      'vbscript:msgbox',
      'sms:+14795551212',
      'ftp://example.org/',
    ]) {
      expect(refused(raw), raw).toMatch(/cannot be opened/)
    }
  })

  it('refuses control characters before the parser can strip them', () => {
    expect(refused('java\tscript:alert(1)')).toMatch(/hidden or control/)
    expect(refused('https://exa\nmple.org/')).toMatch(/hidden or control/)
  })

  it('refuses bidi overrides and zero-width characters', () => {
    expect(refused('https://example.org/‮gnp.exe')).toMatch(/hidden or control/)
    expect(refused('https://exam​ple.org/')).toMatch(/hidden or control/)
  })

  it('refuses relative links, which only the guest can resolve', () => {
    expect(refused('/about')).toMatch(/complete link/)
    expect(refused('example.org')).toMatch(/complete link/)
  })

  it('refuses non-strings, empty strings and overlong links', () => {
    for (const raw of [undefined, null, 42, {}, ['https://example.org']]) refused(raw)
    refused('')
    refused('   ')
    expect(refused('https://example.org/' + 'a'.repeat(MAX_LINK_CHARS))).toMatch(/limited/)
  })
})
