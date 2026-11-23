## What this changes

<!-- One change per PR. Say what it fixes or adds and why. For a creation: what it does and what it reads from the SDK. -->

## How I checked it

<!-- Which of these ran locally, and what else you did (opened it in the shell, ran a creation against it). -->

- [ ] `pnpm typecheck`
- [ ] `pnpm gen:check`
- [ ] `pnpm test`
- [ ] `pnpm test:e2e` (stop `pnpm dev` first)

## Boundary and data

- [ ] Does not touch `packages/host`, `packages/sandbox`, `packages/shared`, the CSP or the identity surface, or the description above says why it must.
- [ ] Adds no data about individual residents (names, phones, addresses) in code, fixtures or tests.
- [ ] Changes to root `package.json`, `pnpm-workspace.yaml` or `pnpm-lock.yaml` are called out above, or there are none.
- [ ] Any added font, icon, image or copied code has a license that allows publishing here, with its license text alongside.
