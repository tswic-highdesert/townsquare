/**
 * One error type for the whole package, carrying a code the HTTP layer maps.
 *
 * Same shape as `ReviewError`, and deliberately so: a route that already knows
 * how to turn `not_found` into a 404 and `forbidden` into a 403 should not need
 * a second vocabulary for the second queue in the building.
 *
 * `unavailable` is the one code that is not in `ReviewError`. It means the
 * policy allows this and the plumbing does not exist yet — a photo with no
 * image store behind it — and it is separate from `invalid` because telling a
 * resident their caption was wrong when the truth is we have nowhere to put
 * their picture sends them editing a sentence that was fine.
 */
export class ContributionError extends Error {
  constructor(
    readonly code:
      | 'invalid'
      | 'forbidden'
      | 'not_found'
      | 'conflict'
      | 'stale'
      | 'paused'
      | 'unavailable',
    message: string,
  ) {
    super(message)
    this.name = 'ContributionError'
  }
}
