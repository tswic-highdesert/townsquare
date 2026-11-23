/**
 * Outbound links: what a creation may ask Town Square to open for a resident.
 *
 * A creation's frame has no `allow-popups` and no `allow-top-navigation`, so it
 * cannot open anything itself. It asks the host instead, through
 * `app.openLink`, and the host shows the resident where they are going before
 * anything opens. This module is the check that runs before that dialog. The
 * host runs it on every request; the guest's copy of a link is never trusted.
 *
 * The check does two jobs:
 *
 *  1. **Refuse what should never open.** Only `https:`, `http:`, `tel:` and
 *     `mailto:`. No `javascript:`, `data:`, `blob:` or `file:`, which would run
 *     code or read local files under the shell's authority. No embedded
 *     username and password, the `https://bank.example@evil.example` trick. No
 *     IP literals or private-network names, which a resident's browser can
 *     reach and a reviewer cannot.
 *
 *  2. **Produce what the dialog shows.** The host name comes from the parsed
 *     URL, in its ASCII (punycode) form, so a look-alike name such as
 *     `xn--pple-43d.com` cannot pass itself off as `apple.com`. The `href` that
 *     opens is rebuilt from the parsed parts, so the resident sees exactly
 *     what will open.
 *
 * The dialog is what closes the exfiltration channel `allow-popups` would
 * open: a link can still carry data in its address, but only to a place the
 * resident has seen and agreed to visit.
 */

import { isReservedHostname } from './csp.js'

/** Longest link accepted, in characters. Matches the practical browser limit. */
export const MAX_LINK_CHARS = 2048

export type OutboundLink =
  | {
      kind: 'web'
      /** The exact URL that will open. */
      href: string
      /** `host[:port]`, ASCII. What the dialog shows in large type. */
      host: string
      /** False for `http:`. The dialog says the connection is not private. */
      secure: boolean
      /** True when any label is punycode, so the name may imitate another. */
      international: boolean
    }
  | {
      kind: 'phone'
      href: string
      /** The number as written, with only digits and separators left. */
      number: string
    }
  | {
      kind: 'email'
      href: string
      /** Exactly one address. */
      to: string
      subject?: string
      /** True when the link drafts a message body for the resident to review. */
      hasBody: boolean
    }

export type LinkCheck = { ok: true; link: OutboundLink } | { ok: false; reason: string }

/**
 * Characters that can make a link read differently from what it does.
 *
 * C0 controls and DEL are silently stripped by the URL parser, so
 * `java\tscript:` would read one way and parse another. Bidi overrides can
 * reorder a displayed name, and zero-width characters can hide inside one.
 */
const DECEPTIVE = /[\u0000-\u001F\u007F­​-‏‪-‮⁠-⁩﻿]/

const IPV4 = /^\d{1,3}(\.\d{1,3}){3}$/

/** A dotted name with an alphabetic final label, as in `./csp.ts`. */
const HOSTNAME = /^(?=.{1,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/

/** Separators people write in phone numbers. Nothing else survives. */
const PHONE = /^\+?[0-9 ().-]+$/
const PHONE_EXTENSION = /^(?:;ext=|,)([0-9]{1,8})$/

/**
 * One plain address. Deliberately narrower than RFC 5322: quoted local parts
 * and comments are legal and essentially never real, and every character left
 * out here is one that could otherwise change how the link parses.
 */
const EMAIL = /^[a-z0-9.!$'*+=^_`{|}~-]{1,64}@([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/i

const MAX_SUBJECT_CHARS = 200
const MAX_BODY_CHARS = 1500

const fail = (reason: string): LinkCheck => ({ ok: false, reason })

/**
 * Check one absolute link and describe it for the leaving dialog.
 *
 * Relative links are refused. The guest resolves its own relative links before
 * sending, because only the guest knows its base URL.
 */
export function checkOutboundLink(raw: unknown): LinkCheck {
  if (typeof raw !== 'string') return fail('A link must be a string.')
  const text = raw.trim()
  if (text.length === 0) return fail('The link is empty.')
  if (text.length > MAX_LINK_CHARS) {
    return fail(`Links are limited to ${MAX_LINK_CHARS} characters.`)
  }
  if (DECEPTIVE.test(text)) {
    return fail('The link contains hidden or control characters.')
  }

  let url: URL
  try {
    url = new URL(text)
  } catch {
    return fail('That is not a complete link. Use a full address such as https://example.org.')
  }

  switch (url.protocol) {
    case 'https:':
    case 'http:':
      return checkWeb(url)
    case 'tel:':
      return checkPhone(url)
    case 'mailto:':
      return checkEmail(url)
    default:
      return fail(
        `Links starting with "${url.protocol}" cannot be opened. ` +
          'Use https:, http:, tel: or mailto:.',
      )
  }
}

function checkWeb(url: URL): LinkCheck {
  if (url.username || url.password) {
    return fail('Links with a username or password in them are not allowed.')
  }

  const host = url.hostname
  // The parser has already normalised `0x7f.1` and friends to dotted decimal,
  // so this one pattern catches every IPv4 spelling.
  if (host.startsWith('[') || IPV4.test(host)) {
    return fail('Links must use a name, not a numeric IP address.')
  }
  if (!HOSTNAME.test(host) || isReservedHostname(host)) {
    return fail(`"${host}" is not a public web address.`)
  }

  const href = url.href
  if (href.length > MAX_LINK_CHARS) {
    return fail(`Links are limited to ${MAX_LINK_CHARS} characters.`)
  }

  return {
    ok: true,
    link: {
      kind: 'web',
      href,
      host: url.host,
      secure: url.protocol === 'https:',
      international: host.split('.').some((label) => label.startsWith('xn--')),
    },
  }
}

function checkPhone(url: URL): LinkCheck {
  if (url.search || url.hash) return fail('A phone link must be just a number.')

  let body: string
  try {
    body = decodeURIComponent(url.pathname).trim()
  } catch {
    return fail('The phone number is not readable.')
  }

  // Split off an extension, written as `;ext=12` or a pause comma.
  const at = body.search(/;ext=|,/)
  const number = (at === -1 ? body : body.slice(0, at)).trim()
  const extension = at === -1 ? '' : body.slice(at)

  if (!PHONE.test(number)) return fail('A phone link may only contain digits and separators.')
  const digits = number.replace(/[^0-9]/g, '')
  // E.164 caps a number at 15 digits; anything under 3 is not a number.
  if (digits.length < 3 || digits.length > 15) {
    return fail('That does not look like a phone number.')
  }

  let ext = ''
  if (extension) {
    const m = PHONE_EXTENSION.exec(extension)
    if (!m) return fail('A phone extension may only contain digits.')
    ext = `;ext=${m[1]}`
  }

  const plus = number.startsWith('+') ? '+' : ''
  return {
    ok: true,
    link: {
      kind: 'phone',
      href: `tel:${plus}${digits}${ext}`,
      number: ext ? `${number} ext. ${ext.slice(5)}` : number,
    },
  }
}

function checkEmail(url: URL): LinkCheck {
  if (url.hash) return fail('An email link cannot have a # fragment.')

  let to: string
  try {
    to = decodeURIComponent(url.pathname).trim()
  } catch {
    return fail('The email address is not readable.')
  }
  if (to.length > 254 || !EMAIL.test(to)) {
    return fail('An email link must name exactly one valid address.')
  }

  // Only a subject and a body. `cc` and `bcc` are refused rather than dropped:
  // a hidden `bcc` is a copy of the resident's message going somewhere the
  // dialog did not show, and silently dropping it would hide a builder's bug.
  let subject: string | undefined
  let body: string | undefined
  for (const [key, value] of url.searchParams) {
    const k = key.toLowerCase()
    if (k === 'subject' && subject === undefined) subject = value
    else if (k === 'body' && body === undefined) body = value
    else return fail(`Email links may set only a subject and a body, not "${key}".`)
  }
  if (subject !== undefined && subject.length > MAX_SUBJECT_CHARS) {
    return fail(`An email subject is limited to ${MAX_SUBJECT_CHARS} characters.`)
  }
  if (body !== undefined && body.length > MAX_BODY_CHARS) {
    return fail(`An email body is limited to ${MAX_BODY_CHARS} characters.`)
  }
  if (subject !== undefined && DECEPTIVE.test(subject)) {
    return fail('The email subject contains hidden or control characters.')
  }

  const params: string[] = []
  if (subject) params.push(`subject=${encodeURIComponent(subject)}`)
  if (body) params.push(`body=${encodeURIComponent(body)}`)

  // Domains are case-insensitive and local parts, strictly, are not.
  const at = to.lastIndexOf('@')
  const address = to.slice(0, at) + to.slice(at).toLowerCase()
  const href = `mailto:${address}${params.length ? '?' + params.join('&') : ''}`
  if (href.length > MAX_LINK_CHARS) {
    return fail(`Links are limited to ${MAX_LINK_CHARS} characters.`)
  }

  return {
    ok: true,
    link: {
      kind: 'email',
      href,
      to: address,
      ...(subject ? { subject } : {}),
      hasBody: Boolean(body),
    },
  }
}
