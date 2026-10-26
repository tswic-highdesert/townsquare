# Contributing

Town Square has two kinds of work, and they live in different places.

## Building a creation (most people)

A creation is a resident's mini-app: a folder with `townsquare.json`, an entry
HTML file and an icon. **Build it in your own repository, not in this one.**
This repo is the platform. Your creation is yours.

1. Get the town running locally with [GETTING-STARTED.md](GETTING-STARTED.md).
2. Copy `apps/sandbox/examples/starter/` into your own repo and build there.
3. Try it locally by copying your folder into `apps/sandbox/examples/` in your
   clone of this repo and restarting `pnpm dev`. Do not commit it here.
4. Submit it through the builder door (the MCP server, `apps/mcp`): its
   `begin_upload`, `validate`, `preview` and `submit` tools, in that order.
   It goes into the review queue, and a reviewer approves it or sends it back
   with a reason. See
   [creation-authoring.md](creation-authoring.md).

The contract you build against is
[spec-manifest-and-sdk.md](spec-manifest-and-sdk.md) and
[packages/sdk/generated/AGENTS.md](packages/sdk/generated/AGENTS.md). If the
SDK cannot do something you need, that is a platform issue (below), not a
reason to work around the sandbox. Workarounds fail review.

## Changing the platform

**Found a bug?** Open an issue with the smallest steps that show it: what you
ran, what you expected, what happened, and your Node version (`node -v`).

**Want to change core code?** Open an issue and discuss it first. The security
boundary (`packages/host`, `packages/sandbox`, `packages/shared`, the CSP and
the identity surface) changes only with a written reason, because a small
change there can undo the whole design. DEVELOPING.md explains why each piece
is shaped the way it is.

**Opening a pull request:** branch from `main`, keep it to one change, and say
in the description what it fixes and how you checked it. These must all pass
locally first:

```bash
pnpm typecheck
pnpm gen:check      # the generated SDK docs match the source
pnpm test
pnpm test:e2e       # stop pnpm dev first, see GETTING-STARTED.md
```

CI runs the same four on every push and pull request.

If you change the SDK surface, run `pnpm gen` and commit what it writes, or
`pnpm gen:check` fails. If you change the database schema in `packages/db`,
generate a migration with drizzle-kit and commit it with the schema change.

## How main is protected

Today it is not, by settings. The repository is private on GitHub's free plan,
which offers no branch protection or rulesets for private repositories. Until
that changes, the rules above are by agreement: nobody but the maintainer
pushes to `main`, and everything else arrives as a pull request.

For the maintainer, the settings to turn on once the repo is public or on a
paid plan (**Settings, Rules, Rulesets, New branch ruleset**):

- Enforcement status: Active. Target: the default branch.
- Bypass list: Repository admin, so direct maintainer pushes keep working.
- Restrict deletions: on.
- Block force pushes: on.
- Require a pull request before merging: on, 1 approval.
- Require status checks to pass: on, with `typecheck and unit tests` and
  `sandbox boundary suite` (the two jobs in `.github/workflows/ci.yml`).
