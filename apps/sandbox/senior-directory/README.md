# Senior Directory (React)

A Town Square creation written in React and built with Vite. Right now it is a
blank starting point: it renders, calls `app.ready()`, reports its height, and
shows the town name from `town.info()`.

This folder is **source**. The creation itself is the build output in
`apps/sandbox/dev-creations/senior-directory/`, which is gitignored.

The setup mirrors the SDK demo on `feat/sdk-demo`; see its README for more
background on the build rules.

## Run it

```sh
pnpm dev:senior
```

That builds this app, then starts `pnpm dev` with `TOWNSQUARE_EXTRA_EXAMPLES`
pointing at `apps/sandbox/dev-creations/`. Open
http://townsquare.localhost:5173 (not `127.0.0.1`), then **Browse**, then
**Senior Directory**.

Creations are read from disk **once at startup**, so after changing the source,
stop the servers and run `pnpm dev:senior` again. While iterating you can keep
`pnpm --filter @townsquare/senior-directory watch` running in another terminal.

## The files

| File | What it is |
|---|---|
| `public/townsquare.json` | The manifest, copied as-is into the build |
| `public/icon.png` | The icon (placeholder, copied from the starter) |
| `index.html` | Vite's entry; becomes the creation's `index.html` |
| `src/main.tsx` | Mounts React, calls `app.ready()`, reports height |
| `src/App.tsx` | The UI. Start here |
| `src/styles.css` | Styles, using the `--ts-*` tokens Town Square injects |
| `src/townsquare-sdk.d.ts` | Types for `@townsquare/sdk`. Extend as you use more of it |
| `vite.config.ts` | Build settings, each commented with the reason |

## Build rules (enforced by `vite.config.ts`)

- **Not minified.** The bundle validator rejects minified code.
- **`@townsquare/sdk` stays external.** Town Square supplies it at serve time.
- **No preload polyfill**, so the output contains only code we or React wrote.
- **Hashed file names**, because the sandbox caches bundle files as immutable.

## Known validator warnings

Two `undeclared_host` warnings (`react.dev`, `www.w3.org`) come from strings
inside React, not network requests. Do not add those hosts to
`permissions.network`.

## Permissions

The manifest declares none, because `town.*` and `app.*` need no permission.
Declare exactly what you add: `identity: "handle"` for `user.current()`,
`storage: true` for `storage.*`, and record types under `read`/`write` (plus
`defines`) for `records.*`.
