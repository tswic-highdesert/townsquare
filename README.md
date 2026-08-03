# Town Square

A community wide application for a town. It aggregates news, events and notices,
makes the town's businesses, articles and podcasts discoverable, and lets any
resident **build their own mini-app and link it into the infrastructure**.

Open source, so any community can adopt it and adapt it.

Start with [VISION.md](VISION.md).

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
| [VISION.md](VISION.md) | What this is and every decision made so far |
| [spec-manifest-and-sdk.md](spec-manifest-and-sdk.md) | **The contract.** Manifest, SDK surface, permissions, CSP, error codes |
| [spec-tier-0-1.md](spec-tier-0-1.md) | Identity, vouching, privilege tiers, the registry, the read API |
| [creation-authoring.md](creation-authoring.md) | How residents author creations (MCP) and the review flow |
| [residency-verification.md](residency-verification.md) | Verifying a resident without harvesting personal data |
| [build-layer-options.md](build-layer-options.md) | Prior art and why the build layer is shaped this way |
| [design/](design/) | Implementation designs. Where a design and a spec disagree, the spec wins |
| [brand/](brand/) | The approved identity, with a per-town lockup generator |

## Repository

```
packages/manifest    the townsquare.json schema, and additive-only type evolution
packages/shared      wire protocol, error codes, CSP compiler, path normalizer, origins
packages/tokens      design tokens, emitted for both the shell and the guest frame
packages/sdk         @townsquare/sdk, the contract creations are written against
packages/bundle      publish-time validation, autochecks, content addressing
packages/sandbox     the bundle server, as a pure request-in/response-out function
packages/host        the frame, the handshake, and the permission gate. no React
apps/api             the read API. holds the credential
apps/sandbox         serves untrusted bundles. holds nothing
apps/web             the shell: gallery, trust page, running creation
```

## Develop

```bash
pnpm install
pnpm typecheck
pnpm test
```

Running it locally takes three processes on three origins. See
[DEVELOPING.md](DEVELOPING.md).

## Two rules worth knowing before reading the code

**Everything a creation can reach is declared in its manifest, and the host
enforces the declaration.** The guest-side copy of its own permissions is
advisory, so it can produce a good error message, but it is never the boundary.
Hand-written messages that bypass the SDK entirely still fail closed.

**`script-src` is always `'self'` and is never influenced by a manifest.** That is
the mechanism behind "everything is vendored". Without it, vendoring is a policy
nobody checks.
