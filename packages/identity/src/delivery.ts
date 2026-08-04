/**
 * Getting a challenge link to a person.
 *
 * Production will post to a mail provider. Development prints to the terminal
 * and keeps the last link per address, because the alternative — wiring an
 * SMTP account before anyone can sign in locally — is the kind of setup cost
 * that stops a contributor at the first screen.
 *
 * The dev implementation is opt-in at the process level, never by request, and
 * `apps/api` refuses to construct it outside development. An echoed sign-in
 * link is a complete account takeover if it ever reaches production.
 */

import type { ChallengeDelivery } from './service.js'
import type { ChallengePurpose } from './store.js'

export interface EchoedChallenge {
  email: string
  handle: string
  purpose: ChallengePurpose
  url: string
  expiresAt: number
}

export class ConsoleDelivery implements ChallengeDelivery {
  private readonly last = new Map<string, EchoedChallenge>()
  private readonly shellOrigin: string
  private readonly log: (line: string) => void

  constructor(opts: { shellOrigin: string; log?: (line: string) => void }) {
    this.shellOrigin = opts.shellOrigin.replace(/\/+$/, '')
    this.log = opts.log ?? ((line) => console.log(line))
  }

  async deliver(input: {
    email: string
    handle: string
    purpose: ChallengePurpose
    token: string
    expiresAt: number
  }): Promise<void> {
    const url = `${this.shellOrigin}/?confirm=${encodeURIComponent(input.token)}`
    this.last.set(input.email.toLowerCase(), {
      email: input.email,
      handle: input.handle,
      purpose: input.purpose,
      url,
      expiresAt: input.expiresAt,
    })
    this.log(
      `\n  ✉  ${input.purpose === 'confirm' ? 'Confirm' : 'Sign in'} — ${input.handle} <${input.email}>\n     ${url}\n`,
    )
  }

  /** Dev only. The API exposes this behind an explicit environment flag. */
  latestFor(email: string): EchoedChallenge | null {
    return this.last.get(email.toLowerCase()) ?? null
  }

  latest(): EchoedChallenge | null {
    let newest: EchoedChallenge | null = null
    for (const c of this.last.values()) {
      if (!newest || c.expiresAt > newest.expiresAt) newest = c
    }
    return newest
  }
}
