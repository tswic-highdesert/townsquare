# Getting started

From a clean machine to a running town. Every step below was run on a fresh
clone on 2026-10-25 (Linux, Node 24.20.0, pnpm 11.0.9), and the times and
counts are what that run printed. If yours differ, the section at the bottom
covers the usual reasons.

## What you need

- **Node 24.** The repo pins it in `.nvmrc`. With nvm, fnm or mise, run
  `nvm use`, `fnm use` or `mise use node@24` inside the repo.
- **pnpm 11.0.9.** Run `corepack enable` once and Node picks the version from
  `packageManager` in `package.json`. No global install needed.
- **git.**
- **Internet access.** The API scrapes the town's live sources when it starts.
- **Not needed:** Postgres, Docker, any account, any secret. Accounts, saves
  and contributions go to a local SQLite file, `/tmp/townsquare-data/residents.sqlite`
  unless `TOWNSQUARE_DB_PATH` says otherwise. Docker is optional and only
  un-skips five database tests.

Windows has not been tested. Use WSL2 and follow the Linux steps inside it.

## Five commands

```bash
git clone https://github.com/tswic-highdesert/townsquare.git
cd townsquare
pnpm install        # about 6 seconds
pnpm typecheck      # about 5 seconds, prints nothing on success
pnpm test           # about 2 seconds of tests
```

`pnpm test` should end with:

```
Test Files  81 passed | 1 skipped (82)
     Tests  1314 passed | 5 skipped (1319)
```

Five skipped is correct without Docker. Any failure is worth stopping for.

## Run the town

```bash
pnpm dev
```

That starts four processes and labels each line with its name:

| Name | What it is | Address |
|---|---|---|
| `api` | the read API and sign-in | http://localhost:3030/api |
| `sandbox` | serves creation bundles, one origin each | http://<origin-key>.tsq-apps.localhost:3031 |
| `web` | the shell you open in a browser | http://townsquare.localhost:5173 |
| `mcp` | the builder door for AI tools | http://localhost:8770/mcp |

Wait for the `web` line that says `ready`, then open
**http://townsquare.localhost:5173**. Use that name, not `127.0.0.1:5173`.
The shell and the bundles must be different sites for the security checks to
mean anything, and the `.localhost` names are how that works locally. Browsers
resolve them on their own, so there is nothing to add to `/etc/hosts`.

Press **Browse**, pick **The Burrito Index** (a finished creation) or
**Starter** (the one to copy), then press **Open** on the page that says what
it can reach. Ctrl-C stops all four processes. If one of them
crashes, `pnpm dev` stops the others too, on purpose.

### Signing in

Press **Sign in** in the shell and create an account with a handle and a
password of at least 12 characters. No email is sent, and there is no password
recovery.

To see the **Review queue**, give that account the moderator role from another
terminal:

```bash
TOWNSQUARE_DB_PATH=/tmp/townsquare-data/residents.sqlite \
  pnpm exec tsx apps/api/src/provisionReviewer.ts yourhandle moderator
```

If you started the API with a different `TOWNSQUARE_DB_PATH`, use that path.

### Connecting an AI tool to the builder door

With a seeded cohort, the `mcp` process prints a ready command, for example:

```bash
claude mcp add --transport http townsquare http://localhost:8770/mcp \
  --header "Authorization: Bearer ts_live_..."
```

That token works only with this local `mcp` process and is gone when it stops.

## Build your first creation

1. Copy `apps/sandbox/examples/starter/` to a new folder next to it.
2. Change `name` in its `townsquare.json`.
3. Restart `pnpm dev`. The new creation appears under Browse.

`apps/sandbox/examples/starter/README.md` explains each file, how to ask for
more permissions, and two limits of the local build today.

## The browser security suite (optional)

```bash
pnpm exec playwright install chromium   # once
pnpm test:e2e                           # 30 tests, about 25 seconds
```

**Stop `pnpm dev` first.** The suite reuses servers already on its ports, and
the ones `pnpm dev` started lack its test fixtures, so the results would mean
nothing. DEVELOPING.md has the detail.

## If something goes wrong

**`vitest: command not found`, or `tsc`, `tsx` or `vite` not found.** The
install is incomplete, usually from a copied or interrupted `node_modules`.
`pnpm install` alone often reports "Already up to date" and fixes nothing. The
repo checks for this before `pnpm test`, `pnpm typecheck` and `pnpm dev`, and
prints the fix:

```bash
rm -rf node_modules apps/*/node_modules packages/*/node_modules
pnpm install
```

**`Unsupported engine: wanted: {"node":">=24 <25"}`.** You are on a different
Node. It is only a warning and the tests pass on Node 26, but switch to 24 with
your version manager before reporting a bug.

**`5 skipped`.** Expected without Docker. Those tests need a throwaway
Postgres.

**`403` or `429` lines from the `api` at startup.** Some live sources rate
limit or block scrapers. The town still runs with what it got.

**`EADDRINUSE` or "port is already in use".** Something else holds 3030, 3031,
5173 or 8770, often an earlier `pnpm dev` that did not exit. Find it with
`lsof -i :5173` (macOS, Linux) and stop it.

**The page at 127.0.0.1:5173 loads but creations do not.** Use
http://townsquare.localhost:5173 instead.

## What to read next

1. [README.md](README.md), the map of the repo.
2. [VISION.md](VISION.md), what this is and why.
3. [packages/sdk/generated/AGENTS.md](packages/sdk/generated/AGENTS.md), the
   SDK reference written for AI tools. It is also the shortest complete one.
4. [spec-manifest-and-sdk.md](spec-manifest-and-sdk.md), the contract.
5. [DEVELOPING.md](DEVELOPING.md), how it works and the traps.
6. `apps/sandbox/examples/burrito-index/` and `starter/`, real creations.
7. [creation-authoring.md](creation-authoring.md), how a creation gets
   reviewed and published.
8. [CONTRIBUTING.md](CONTRIBUTING.md), where your work goes.
