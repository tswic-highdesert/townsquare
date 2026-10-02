# Running the Town Square preview

## Live services

The resident app is https://townsquare-live-production.up.railway.app. The starter creation is served separately from https://q02aheqxh3jz.up.railway.app and should be opened through the app's Creations screen so that the host bridge is present.

All services are in Railway project `20d807a4-40ae-471f-abf8-eecc8d00a427`, production environment `9e7b4cb1-3ff3-4343-b225-9bbe71bab994`.

| Service | ID | Runtime |
| --- | --- | --- |
| townsquare-live | `3f5124af-9bd3-4ac2-bed3-7daacd0bc873` | Node 24 API and built web app, one replica, 0.5 vCPU / 0.75 GB cap |
| townsquare-example | `1f445642-c4e1-4eff-983e-30e4a1b5478f` | Separate sandbox process, 0.25 vCPU / 0.25 GB cap |
| rvts-api | `fe36ccef-bde1-4b25-8b94-f2560eac7964` | Existing feed API; preserved |
| rvts-worker | `d4b22c0d-7cf0-4b6c-ac2e-05a31f2c2ad5` | Existing scheduled ingestion; repaired separately |

The app volume `townsquare-resident-data` (`fa1b219f-222b-481b-92c4-b08a812f20ce`) mounts at `/data` with 1 GB provisioned. `TOWNSQUARE_DB_PATH=/data/residents.sqlite`; `DATA_DIR=/data`. The sandbox has no resident volume or session credentials. Existing Postgres and custom domains were not changed.

The two added services and volume incur Railway usage charges. Resource caps are not fixed monthly prices; a reliable incremental bill is not yet available. No paid mapping, email, analytics or image-generation subscription was added. The OSM map is served locally with attribution.

## Local development

Install Node 24 and pnpm 11.0.9, then run `pnpm install --frozen-lockfile` from the repository root. Use three terminals:

```sh
API_PORT=4311 SANDBOX_PORT=4312 SHELL_ORIGIN=http://townsquare.localhost:4310 TOWNSQUARE_DB_PATH=/tmp/townsquare-dev/residents.sqlite DATA_DIR=/tmp/townsquare-dev pnpm dev:api
```

```sh
SHELL_PORT=4310 API_PORT=4311 pnpm dev:web
```

```sh
SANDBOX_PORT=4312 SHELL_ORIGINS=http://townsquare.localhost:4310 pnpm dev:sandbox
```

Open http://townsquare.localhost:4310 in Chromium. Creation origins use `*.tsq-apps.localhost`; Chromium maps those names to loopback. Accounts use handles and passwords of at least 12 characters. No email is sent; password recovery is not provided in this preview.

## Deployment

The root Dockerfile builds the web app and starts `apps/api/src/main.ts`. Railway's sandbox service overrides the start command with `pnpm exec tsx apps/sandbox/src/main.ts`. Both listen on `PORT=8080` and expose `/healthz`.

The resident service requires `NODE_ENV=production`, its HTTPS `SHELL_ORIGIN`, matching `SHELL_ORIGINS`, `APPS_DOMAIN=up.railway.app`, the persistent database path, and a securely generated `ACT_TOKEN_SECRET`. The sandbox requires `NODE_ENV=production`, the same allowed shell origin, and `APPS_DOMAIN=up.railway.app`. Never copy the resident database or secrets into the sandbox.

Upload the checked-out branch:

```sh
railway up --project 20d807a4-40ae-471f-abf8-eecc8d00a427 --service 3f5124af-9bd3-4ac2-bed3-7daacd0bc873 --environment production --detach
```

Use the sandbox service ID only when sandbox code changes. A SQLite volume means one API replica, and deployments can have brief handoff downtime. Startup refuses an absent or temporary production database path. SIGTERM drains requests before closing SQLite.

The existing `railway.toml` works during this build; Railway warns that this configuration format is deprecated and needs migration before December 1, 2026. Do not change the production domain or volume as part of that migration.

## Validation

```sh
pnpm typecheck
pnpm gen:check
pnpm test
pnpm --filter @townsquare/web build
pnpm test:e2e
TOWNSQUARE_BASE_URL=https://townsquare-live-production.up.railway.app pnpm exec playwright test --config e2e/resident.config.ts
```

Database tests need a working Docker endpoint. On the build machine, Colima required `DOCKER_HOST=unix:///Users/talswicegood/.colima/default/docker.sock TESTCONTAINERS_RYUK_DISABLED=true`. Those are machine-specific test settings, not application deployment settings. The boundary suite creates isolated servers on ports 4410–4412. The resident suite starts no servers and exercises the URL supplied. Moderator tests require explicit operator CLI access; ordinary resident tests do not grant roles. Auth traces are disabled.

No lint script is configured; use `git diff --check` plus the type and test checks above.

## Operating limits

- Listing corrections are the durable contribution/review path. Broader creation publishing and its moderation stores are not production-connected; the app says publishing is unavailable.
- A server operator can grant an existing account the moderator role with `provisionReviewer.ts`; see [accounts and persistence](../persistence-and-accounts.md). There is no shared moderator login or public role-grant route.
- Directory hours come from dated public listings. They are not a live business-availability feed. The app shows provenance and asks residents to confirm hours.
- Empty upstream feeds can mean no new items or a source failure. `/healthz` exposes this uncertainty separately from process liveness; see [source health](source-health.md).
- Production backups, password recovery and a broader moderation operation remain future work. Do not treat successful demo checks as an uptime guarantee.

## Delivered revision

The final application deployment is `9f2b697e-5949-4658-af52-2d2c0eefcd4e`, built from product commit `2801efc` on `codex/townsquare-live`. Later commits contain handoff evidence only. The sandbox remains on `f9cdf45a-a36d-4435-932c-6dcad90c3407`. The repaired worker remains on `67b61203-2588-419c-acb9-6a78cf66b3b1`; the worker branch is pushed through evidence commit `17582f6`.

The deployments were uploaded from the review branches. Neither private repository's main branch was changed. Merge the reviewed worker repair before a future deployment from main so that the fix is not replaced by old code.
