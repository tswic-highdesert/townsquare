# SDK Demo (React)

A Town Square creation written in React and built with Vite. Right now it is a
minimal starter: it renders, calls `app.ready()`, and shows `town.info()`. It
is the base for a test bench that exercises every SDK method.

This folder is **source**. The creation itself is the build output in
`apps/sandbox/dev-creations/sdk-demo/`, which is gitignored for now.

## Run it

```sh
pnpm dev:demo
```

That builds this app, then starts `pnpm dev` with
`TOWNSQUARE_EXTRA_EXAMPLES` pointing at `apps/sandbox/dev-creations/`. Open
http://townsquare.localhost:5173, then **Browse**, then **SDK Demo**.

Creations are read from disk **once at startup**. After changing the source,
stop the servers and run `pnpm dev:demo` again. While iterating you can keep
`pnpm --filter @townsquare/sdk-demo watch` running in another terminal and
restart only the servers (`pnpm dev` with the same env var).

## The files

| File | What it is |
|---|---|
| `public/townsquare.json` | The manifest, copied as-is into the build |
| `public/icon.png` | The icon, copied as-is |
| `index.html` | Vite's entry; becomes the creation's `index.html` |
| `src/main.tsx` | Mounts React and calls `app.ready()` |
| `src/App.tsx` | The UI |
| `src/townsquare-sdk.d.ts` | Types for `@townsquare/sdk`. Extend as you use more of it |
| `vite.config.ts` | Build settings, each commented with the reason |

## Rules the build config enforces

- **Not minified.** The bundle validator rejects minified code.
- **`@townsquare/sdk` stays external.** Town Square's import map supplies it at
  serve time, and a bundled copy is rejected.
- **No preload polyfill**, so the output contains only code we or React wrote.
- **Hashed file names** (`app-<hash>.js`). The sandbox caches bundle files as
  immutable, so a fixed name would keep serving the old build.

## Troubleshooting

**"This one didn't start" (handshake timeout).** Check the address bar: the
shell must be opened at http://townsquare.localhost:5173, not the
`127.0.0.1:5173` that Vite prints. Creations may only be framed by
`townsquare.localhost`, so every creation fails from `127.0.0.1`.

## Known validator warnings

The sandbox prints two `undeclared_host` warnings for the `app-<hash>.js` file:
`react.dev` and `www.w3.org`. They come from strings inside React (links in
its error messages and the SVG namespace), not from network requests. They are
warnings, not errors, and the creation loads. Do not add those hosts to
`permissions.network`.

## Permissions

The manifest declares nothing, because `town.*` and `app.*` need no
permission. As the demo grows, declare exactly what it calls:
`identity: "handle"` for `user.current()`, `storage: true` for `storage.*`,
and record types under `read`/`write` for `records.*`.
