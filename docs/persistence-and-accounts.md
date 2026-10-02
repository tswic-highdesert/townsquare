# Durable accounts and resident contributions

The deployed account path uses a handle and password. It sends no email. A new account is an ordinary, unverified resident. Password recovery is intentionally unavailable and the account form says so before registration.

## Runtime and deployment

Use Node 22.13 or newer (Node 24 is recommended for the deployment). The API uses the built-in `node:sqlite` module without a database dependency. Set `TOWNSQUARE_DB_PATH=/data/townsquare.sqlite` and mount a persistent Railway volume at `/data`. Run exactly one API replica. Do not use the container's temporary filesystem for the deployed database.

The database uses WAL journaling, full synchronous commits, a five-second busy timeout, and owner-only file permissions. Startup creates additive tables and indexes. It never resets existing data. The existing Postgres service is untouched.

The SQLite adapters implement the existing identity, saves, contribution, record-history, draft, and contribution-attempt interfaces. Each row mutation is committed before its promise resolves. Account creation and password storage commit together. Record creation and history append commit together. These adapters use SQL-backed row collections rather than serializing an in-memory snapshot during shutdown, so an abrupt exit does not discard successful requests.

The broader creation publishing/moderation services still use their original memory stores. The working durable review path covered here is a listing correction. Do not advertise durable user-built app publication until those remaining stores and artifact publishing have been connected.

## Account security

The deployed `createAccountRoutes` handler must run before `createIdentityRoutes`. It owns signup and signin and returns HTTP 410 for old email confirmation. The password path never invokes challenge delivery or echoes a link.

Passwords are 12–128 characters. They are hashed with scrypt (N=32768, r=8, p=1), an independent random 32-byte salt, and a 64-byte derived key. Only salt and hash are stored. Authentication compares derived keys with `timingSafeEqual`, including a dummy calculation for unknown accounts. At most four expensive password operations run concurrently. Persistent rate limits apply to account handles and the socket peer; behind a reverse proxy, the network limit is shared by that proxy's traffic. This is a deliberate conservative demo limit, not a claim of distributed abuse prevention.

Account mutations require the exact configured `SHELL_ORIGIN`. HTTPS deployments receive `__Host-tsq_session` cookies with Secure, HttpOnly, SameSite=Lax, Path=/ and no Domain. The server stores only a hash of each random session token. Sign-out revokes it durably. Sign-in creates a new session, and saves remain linked to the same account. No submitted role, verification flag, or user ID is trusted. Creation identity remains exactly `{ handle, verified }`.

## Moderation without an admin bypass

A resident can suggest a directory correction while unverified. It enters the moderator queue; it does not change residency status or public data automatically. Submitted drafts, correction status, reviewer decision, notes, and versioned records persist across restarts.

First create the reviewer account through the ordinary account form. A server operator with deployment shell access can then run:

```sh
TOWNSQUARE_DB_PATH=/data/townsquare.sqlite pnpm exec tsx apps/api/src/provisionReviewer.ts chosen-handle moderator
```

The command changes only the role. It never grants verified residency or creates a credential. `user` can be passed in place of `moderator` to revoke review access. There is no HTTP role-grant route, environment password, shared demo login, or admin bypass.

The existing review screen uses `/api/review/contributions` and the decision endpoints. Guests receive 401; ordinary signed-in residents receive 404. Approval stores a versioned listing record. The API's content loader must apply those record overrides for approved changes to appear in the public directory.

## Verification

`pnpm exec vitest run apps/api/src/persistence.test.ts` exercises the routes through a real HTTP socket, with the HTTPS cookie policy selected. It checks:

- Registration, sign-out revocation, and sign-in with a fresh session.
- Persistent saves after database close/reopen.
- Rejection of wrong passwords, missing/bad origins, anonymous writes, and role escalation attempts.
- Salted password storage, hashed session storage, and exact public identity projection.
- Durable rate limits across restart.
- Draft edits, unverified correction submission, moderator approval, status, notes, and immutable record history after reopen.
- A separate Node process commits a save, exits, and a subsequent connection reads it.

Existing identity, save, contribution, and review tests remain applicable. Browser and Railway-volume verification are separate integration gates; the local suite does not prove that a deployed mount or proxy is configured correctly.

## Reviewed corrections in the public feed

`withApprovedCorrections(loadContent, records, townId)` supplies the API's public content loader. Its pure helper accepts only active business records for that town and only the supported fields. Name changes also update the title. Address changes clear the previous geocode rather than moving a map pin by guesswork. A reviewed “Closed for good” statement removes a listing from discovery; reverting that record to its empty baseline restores the source listing. Saved snapshots are retained. Source timestamps stay unchanged, because a review is not a fresh scrape.

The directory route can cache an assembled response for up to 60 seconds. The HTTP integration test checks the original public listing while a correction is queued, approves it through the moderator endpoint, expires that cache, and checks the changed public phone. It then reopens the database and checks the decision and record history. `correctionOverlay.test.ts` covers closures, address/geocode consistency, source immutability, unsupported fields, and wrong-town/inactive records.

## Deployed resident browser evidence

On October 1, 2026, the early deployment at `https://townsquare-live-production.up.railway.app` passed the resident journey on desktop (1440 pixels wide) and phone (390 pixels wide). The test created an unverified `qa_` account, saved a real directory listing, refreshed Saved, signed out, signed in from a fresh browser context, found the save, submitted a labeled QA correction, refreshed its queued status, and verified that the resident could neither read nor approve the moderator queue. It withdrew the QA correction afterward. The proposed value equaled the original listing name; no invented public business fact was proposed.

The separate guest/signature test was not completed against that early build, whose bundle preceded the newer design and weekend experience. Run the full suite against the final deployment:

```sh
TOWNSQUARE_BASE_URL=https://townsquare-live-production.up.railway.app pnpm exec playwright test --config e2e/resident.config.ts
```

The config starts no servers and records no auth traces. It captures account, saved, contribution, and guest-screen screenshots under `artifacts/resident-e2e`. Playwright clears this output directory at the start of a run, so run both projects in one invocation to retain both desktop and phone evidence.
