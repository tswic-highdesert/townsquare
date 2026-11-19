# Contributing

Town Square is infrastructure a town builds on. Most people who contribute
will never touch this repository: they build a creation and submit it through
the builder door. This page covers that path, the path for teams working
inside the repo (the ATU capstone teams, for example), and the path for
changing the platform itself.

Everyone here follows the [code of conduct](CODE_OF_CONDUCT.md). Security
problems go through [SECURITY.md](SECURITY.md), not a public issue.

## Building a creation (residents)

A creation is a resident's mini-app: a folder with `townsquare.json`, an entry
HTML file and an icon. **Build it in your own repository, not in this one.**
This repo is the platform. Your creation is yours, under whatever license you
choose.

1. Get the town running locally with [GETTING-STARTED.md](GETTING-STARTED.md).
2. Copy `apps/sandbox/examples/starter/` into your own repo and build there.
3. Try it locally by copying your folder into `apps/sandbox/examples/` in your
   clone of this repo and restarting `pnpm dev`. Do not commit it here.
4. Submit it through the builder door (the MCP server, `apps/mcp`): its
   `begin_upload`, `validate`, `preview` and `submit` tools, in that order.
   It goes into the review queue, and a reviewer approves it or sends it back
   with a reason. See [creation-authoring.md](creation-authoring.md).

The contract you build against is
[spec-manifest-and-sdk.md](spec-manifest-and-sdk.md) and
[packages/sdk/generated/AGENTS.md](packages/sdk/generated/AGENTS.md). If the
SDK cannot do something you need, that is a platform issue (below), not a
reason to work around the sandbox. Workarounds fail review.

## Building a creation inside this repo (students and partner teams)

Capstone teams and partner organizations sometimes build their creation here
so the maintainer can review it alongside the platform. Each such creation
lives in its own folder under `apps/sandbox/<creation-name>/`, with its own
`package.json`, and a `scripts/dev-<creation-name>.mjs` runner if it needs
one. The team owns that folder.

- **Branch:** `feat/<CreationName>` from `main`, one creation per branch.
  Keep follow-up work on branches that build on it (for example
  `feat/<CreationName>-DataSources`) until the first one merges.
- **Pull request:** open it early and mark it a draft while you work. In
  the description say what the creation does, what it reads from the SDK,
  and how you tested it. The PR template asks for exactly that.
- **Keep the root quiet.** If you must change root `package.json`,
  `pnpm-workspace.yaml` or `pnpm-lock.yaml`, say so in the PR. Lockfile churn
  is the most common cause of conflicts between teams.
- **Nobody edits another team's folder.** If you need a change there, ask in
  the PR or open an issue and tag them.
- **Data about people stays out.** A directory of organizations and public
  services is fine. Names, phone numbers or addresses of individual residents
  are not, in code, fixtures or test data. See
  [residency-verification.md](residency-verification.md) for the reasoning.

Review for these PRs is about the creation staying inside the sandbox
contract and the folder being self-contained. The maintainer does not
rewrite a team's work; review comments say what to change and why.

## Changing the platform

**Found a bug?** Open an issue with the smallest steps that show it: what you
ran, what you expected, what happened, and your Node version (`node -v`). The
bug report template walks through it.

**Want to change core code?** Open an issue and discuss it first. The security
boundary (`packages/host`, `packages/sandbox`, `packages/shared`, the CSP and
the identity surface) changes only with a written reason, because a small
change there can undo the whole design. [DEVELOPING.md](DEVELOPING.md)
explains why each piece is shaped the way it is.

**Opening a pull request:** branch from `main` (`fix/<what>`, `feat/<what>`
or `docs/<what>`), keep it to one change, and say in the description what it
fixes and how you checked it. These must all pass locally first:

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

## Credit

Your name stays on your work.

- **Commits are kept as you wrote them.** Pull requests are merged, not
  squashed into someone else's name, so the GitHub contributors graph and
  `git log` show who built what. Use the name and email you want seen; both
  are public once a commit lands here.
- **Creations carry their author.** The platform records the account that
  submitted a creation as its author (a manifest cannot claim one, see
  [spec-manifest-and-sdk.md](spec-manifest-and-sdk.md)), so attribution
  comes from the handle that did the work and nobody can be impersonated.
- **Teams are named in the release notes** for the release that first ships
  their creation, and in the README's history once the project has one.
- **Security reporters are credited** in the fix, unless they ask not to be
  (see [SECURITY.md](SECURITY.md)).

If you want to be credited differently, or not at all, say so in the PR.

## Licensing of contributions

The platform is [MIT](LICENSE). By opening a pull request against this
repository you agree that your contribution is licensed the same way. There
is no contributor license agreement to sign. Creations you build in your own
repository are yours, under whatever license you choose; submitting one
through the builder door grants the town the right to host and serve the
bundle you submitted, nothing more. [creation-authoring.md](creation-authoring.md)
describes that flow.

Do not add code, fonts, icons or images you do not have the right to publish
under a permissive license. If something arrives with a different license
(a font under the OFL, for example), put its license text next to it, as
`packages/tokens/fonts/` does.

## How main is protected

`main` takes changes by pull request only. The maintainer merges after the
four checks above pass and the change has been read.

For the maintainer, the ruleset to keep on (**Settings, Rules, Rulesets**,
default branch):

- Enforcement status: Active. Target: the default branch.
- Bypass list: Repository admin, so direct maintainer pushes keep working.
- Restrict deletions: on.
- Block force pushes: on.
- Require a pull request before merging: on, 1 approval.
- Require status checks to pass: on, with `typecheck and unit tests` and
  `sandbox boundary suite` (the two jobs in `.github/workflows/ci.yml`).
