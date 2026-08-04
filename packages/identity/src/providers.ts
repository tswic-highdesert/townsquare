/**
 * Verification providers.
 *
 * Each town picks how residency is proven, so the mechanism is pluggable and
 * the contract is narrow enough to implement in an afternoon. Two honest
 * shapes exist and the interface admits both rather than pretending one is the
 * other:
 *
 *   challenge — the user proves something. Postcard, code.
 *   grant     — someone else confers it. Vouch, admin.
 *
 * The structural rule: **a provider returns a boolean.** Core writes
 * `verified_resident`, `verified_method`, `verified_at`, and nothing else. Any
 * address, document or code the provider handled stays inside the provider and
 * never crosses this line. That is what makes "store the result, discard the
 * evidence" a property of the architecture rather than a promise in a doc.
 */

export type VerificationMethod = 'vouch' | 'manual' | 'postcard'

export interface ChallengeHandle {
  challengeId: string
  expiresAt: number
  /** Shown to the user. Never contains the answer. */
  instructions: string
}

export interface ChallengeProvider {
  name: VerificationMethod
  kind: 'challenge'
  initiate(userId: string): Promise<ChallengeHandle>
  confirm(challengeId: string, response: string): Promise<{ verified: boolean }>
}

export interface GrantProvider {
  name: VerificationMethod
  kind: 'grant'
  grant(actorId: string, subjectId: string): Promise<{ verified: boolean }>
}

export type VerificationProvider = ChallengeProvider | GrantProvider

/**
 * The postcard provider, deliberately unbuilt.
 *
 * It exists as a shape so the interface has been proved against a challenge
 * provider and not only against the two grants, which is the point at which an
 * interface designed around grants alone would quietly turn out to be wrong.
 * Building the mail integration before anyone is genuinely locked out would be
 * spending real money on a hypothetical. When that day comes, use PostGrid.
 */
export const postcardProvider: ChallengeProvider = {
  name: 'postcard',
  kind: 'challenge',
  async initiate(): Promise<ChallengeHandle> {
    throw new ProviderUnavailableError(
      'postcard',
      'Postcard verification is not enabled in this town yet. Ask a verified resident to vouch for you.',
    )
  },
  async confirm(): Promise<{ verified: boolean }> {
    throw new ProviderUnavailableError(
      'postcard',
      'Postcard verification is not enabled in this town yet.',
    )
  },
}

export class ProviderUnavailableError extends Error {
  constructor(
    readonly provider: VerificationMethod,
    message: string,
  ) {
    super(message)
    this.name = 'ProviderUnavailableError'
  }
}
