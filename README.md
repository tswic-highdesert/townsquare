# Town Square

Town Square connects Russellville and the Arkansas River Valley through local stories, events, places and useful small apps.

The live preview includes real local feeds, a town map, a day planner, handle/password accounts, persistent saves and reviewed directory corrections. The starter creation uses real public listings and is clearly labeled as an example. Resident app publishing is not open yet.

**[Open the live preview](https://townsquare-live-production.up.railway.app)** · [Tour and handoff](docs/execution-2026-10-01/handoff.md) · [Setup and deployment](docs/execution-2026-10-01/deployment.md) · [Accounts and persistence](docs/persistence-and-accounts.md) · [Design evidence](docs/execution-2026-10-01/design.md)

The code is MIT-licensed; this repository is currently private. [VISION.md](VISION.md) describes the longer-term community platform, including capabilities beyond this preview.

## The idea in one paragraph

Every community app so far has been a product the community consumes. This is
infrastructure the community builds on. A resident who wants a map of every Flock
camera in town, or a ranking of the best burritos, builds it against a documented
SDK and links it in, and the next builder reads their data instead of starting
over. The value compounds with the number of people building, not the number
reading.

## Documents

| File | What it covers |
|---|---|
| [GETTING-STARTED.md](GETTING-STARTED.md) | **New here? Start with this.** Clean machine to a running town, step by step |
| [CONTRIBUTING.md](CONTRIBUTING.md) | Where your work lives, how it is submitted, and what must pass |
| [VISION.md](VISION.md) | What this is and every decision made so far |
| [spec-manifest-and-sdk.md](spec-manifest-and-sdk.md) | **The contract.** Manifest, SDK surface, permissions, CSP, error codes |
| [spec-tier-0-1.md](spec-tier-0-1.md) | Identity, vouching, privilege tiers, the registry, the read API |
| [creation-authoring.md](creation-authoring.md) | How residents author creations (MCP) and the review flow |
| [residency-verification.md](residency-verification.md) | Verifying a resident without harvesting personal data |
| [build-layer-options.md](build-layer-options.md) | Prior art and why the build layer is shaped this way |
| [design/system/](design/system/) | **Approved Daily visual system**, locked 2026-09-10: rules, tokens, and font reference |
| [design/](design/) | Design hierarchy and historical screen references. Product/security specs still take precedence |
| [brand/](brand/) | The approved identity, with a per-town lockup generator |

## Repository

```
packages/manifest       the townsquare.json schema, and additive-only type evolution
packages/identity       handles, sessions, vouching, act tokens. no email leaves it
packages/storage        per creation, per user scratch space, with the quota rules
packages/saves          a resident's private bookmarks on things the town publishes
packages/shared         wire protocol, error codes, CSP compiler, path normalizer, origins
packages/tokens         design tokens, emitted for both the shell and the guest frame
packages/sdk            @townsquare/sdk, the contract creations are written against
packages/bundle         publish-time validation, autochecks, content addressing
packages/sandbox        the bundle server, as a pure request-in/response-out function
packages/host           the frame, the handshake, and the permission gate. no React
packages/mcp            the builder door's tools: scaffold, upload, validate, preview, submit
packages/review         the review queue, reports, and moderation actions
packages/contributions  residents adding to the town's own record: proposals, drafts, versions
packages/civic          notices and their severity ladder, public meetings, alert subscriptions
packages/content        contracts for ingested town content. nothing here describes a person
packages/feed           the source adapters that ingest the town into one feed
packages/db             the Postgres schema (Drizzle), its migrations, and ingest
apps/api                the read API and every auth route. holds the credential
apps/sandbox            serves untrusted bundles. holds nothing
apps/web                the shell: gallery, trust page, running creation
apps/mcp                the builder door: an MCP server residents point their AI tool at
```

Example creations live in `apps/sandbox/examples/`: `burrito-index` (a
finished app) and `starter` (the one to copy).

## Develop

```bash
pnpm install
pnpm typecheck
pnpm test
pnpm dev        # all four local processes, Ctrl-C stops them
```

Running it locally takes four processes on four ports, and `pnpm dev` starts
them together. New to the repo: [GETTING-STARTED.md](GETTING-STARTED.md). The
detail: [DEVELOPING.md](DEVELOPING.md).

## Two rules worth knowing before reading the code

**Everything a creation can reach is declared in its manifest, and the host
enforces the declaration.** The guest-side copy of its own permissions is
advisory, so it can produce a good error message, but it is never the boundary.
Hand-written messages that bypass the SDK entirely still fail closed.

**A creation learns `{ handle, verified }` about you, or nothing.** That is the
whole identity surface — no email, no real name, no user id — and it is
projected server-side from a fifteen-minute act token that names one creation
and one approved version. The token never enters the frame, and the session
cookie is unreachable from JavaScript anywhere, including the shell's own.

**`script-src` is always `'self'` and is never influenced by a manifest.** That is
the mechanism behind "everything is vendored". Without it, vendoring is a policy
nobody checks.
