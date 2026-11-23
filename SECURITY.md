# Security

Town Square runs untrusted code from residents inside a browser sandbox, so
the security boundary is the product. If you think you have found a way
through it, we want to hear from you, and we want to hear privately first.

## Report a problem

Email **tal@rvtownsquare.com** with "Town Square security" in the subject, or
use GitHub's private vulnerability report form on this repository
(**Security**, **Report a vulnerability**) if it is enabled.

Please include:

- What you found and why it matters (what an attacker could do).
- The smallest steps that reproduce it: a creation bundle, a request, a
  message to the host bridge, or a Playwright test.
- The commit or deployed version you tested against.

You will get an acknowledgement within three working days and a fix or a
written decision within thirty. We credit reporters in the fix's commit
message and release notes unless you ask us not to.

Do not open a public issue for a security problem. Do not test against the
live preview with anything that could affect other residents' accounts or
data; run the town locally (see [GETTING-STARTED.md](GETTING-STARTED.md)).

## What counts

Anything that breaks a promise the design makes. The short list, with where
the promise is written:

- A creation reaching data or capabilities its manifest did not declare, or
  the host failing to enforce the declaration (`packages/host`,
  `packages/shared`, [spec-manifest-and-sdk.md](spec-manifest-and-sdk.md)).
- A creation learning more than `{ handle, verified }` about a resident, or
  an act token or session cookie reaching a frame
  ([spec-tier-0-1.md](spec-tier-0-1.md), `packages/identity`).
- A bundle loading script from anywhere but its own origin, or a manifest
  influencing `script-src` (`packages/shared/src/csp.ts`).
- The sandbox origin, the shell origin and the API origin becoming
  confusable (`packages/sandbox`, `apps/sandbox`, the Playwright boundary
  suite in `e2e/`).
- The builder door (`apps/mcp`) accepting an upload, preview or submit it
  should have rejected, or leaking another resident's draft.
- Anything that exposes a resident's password hash, session, saves or
  unpublished contributions.

Bugs that are not security problems (wrong content, a broken page, a scraper
that stopped working) are welcome as ordinary issues.

## Supported versions

Only `main` and the current deployed preview are supported. There are no
release branches yet.

## Dependencies

Dependency advisories are handled through GitHub's Dependabot alerts on this
repository. A fix for an advisory that affects a shipped path lands on `main`
and is deployed; one that affects only a development tool is upgraded in the
normal course of work.
