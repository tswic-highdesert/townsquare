# Senior Directory (React)

A Town Square creation written in React and built with Vite: a directory of
local help for older adults and their caregivers.

- **Two sources, one list.** 63 senior resources from the Russellville Chamber
  of Commerce are bundled in, so they always show; senior-related listings
  from `town.businesses()` merge in when the town directory answers.
- **Sorted by need, not by industry.** `src/data/needs.ts` puts every listing
  into one of eleven plain-language groups ("A place to live", "Care at
  home", "Teeth & eyes"…), using name and category patterns, so town listings
  get grouped too.
- **Made for older eyes.** 18px body text, 48px tap targets, a "Larger text"
  switch, a large Call button on every card, and Email, Website and
  Directions links. Links go through the SDK's link handling (`app.openLink`).
- **Two screens, one decision at a time.** Home shows a picture card for each
  need and a search box; tapping one opens a list of just those places, with
  a large "All services" button above and below it. Nothing reshapes the page
  in place, and the browser's Back button is not relied on (the creation is a
  frame). The list has an "Only in Russellville" box where it matters.
- **Forgiving search**: plurals and apostrophes don't matter ("pharmacies",
  "dentists", "marys"), and each word matches the start of a word in the
  name, address or group.
- **Print this list** on every list screen: a paper version with each phone
  number and email spelled out, for caregivers.
- The screen's name shows in Town Square's title bar (`app.setTitle`), and
  Back returns you to the card you opened.
- A 911 reminder on the home screen.

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
| `src/data/directory.ts` | Loads and merges the chamber list and `town.businesses()` |
| `src/data/needs.ts` | The "what do you need?" groups and the rules that sort listings into them |
| `src/data/assumed-websites.json` | Websites for chamber listings, **found by web search and not yet confirmed** with the businesses. The UI labels each one "Unconfirmed link"; a website from the town directory replaces it. Delete an entry once confirmed or wrong |
| `src/data/search.ts` | Search matching, the in-town check, and phone and map links |
| `src/data/*.test.ts` | Tests for the grouping rules and search; run with `pnpm test` from the repo root |
| `src/Icons.tsx` | The picture for each group and card |
| `src/data/senior-resources.json` | The chamber's senior resource list |
| `src/styles.css` | Styles, using the `--ts-*` tokens Town Square injects |
| `src/townsquare-sdk.d.ts` | Types for `@townsquare/sdk`. Extend as you use more of it |
| `vite.config.ts` | Build settings, each commented with the reason |

## Build rules (enforced by `vite.config.ts`)

- **Not minified.** The bundle validator rejects minified code.
- **`@townsquare/sdk` stays external.** Town Square supplies it at serve time.
- **No preload polyfill**, so the output contains only code we or React wrote.
- **Hashed file names**, because the sandbox caches bundle files as immutable.

## Known validator warnings

Three `undeclared_host` warnings, none of them network requests, so do not add
these hosts to `permissions.network`:

- `react.dev` and `www.w3.org` come from strings inside React.
- `www.google.com` is the Directions link (a Google Maps search), which the
  resident opens through `app.openLink`; the app never fetches it.
- One warning per site in `src/data/assumed-websites.json`, for the same
  reason: they are links a resident can open, not requests.

## Permissions

The manifest declares none, because `town.*` and `app.*` need no permission.
Declare exactly what you add: `identity: "handle"` for `user.current()`,
`storage: true` for `storage.*`, and record types under `read`/`write` (plus
`defines`) for `records.*`.
