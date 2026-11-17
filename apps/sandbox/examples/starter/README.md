# Starter creation

The smallest creation that works, written to be copied. `burrito-index` next
door is a finished app; this one is the blank page.

## Use it

1. Copy this folder. While you work locally, put the copy next to it in
   `apps/sandbox/examples/` (for example `apps/sandbox/examples/my-creation/`)
   so the sandbox loads it at startup. Your team's real copy lives in your own
   repo; see CONTRIBUTING.md at the repo root.
2. In `townsquare.json`, change `name`, `tagline`, `description` and `tags`.
   Leave `manifest_version` and `sdk` at `1`.
3. Replace `icon.png` with your own square PNG, SVG or WebP.
4. Restart `pnpm dev` (or `pnpm dev:sandbox` and `pnpm dev:api`). Examples are
   read once, at startup, through the same validator a real upload hits. If
   your folder would be rejected in production, the sandbox terminal says why
   and skips it.
5. Open http://townsquare.localhost:5173, then Browse, and open your creation.

## The files

| File | What it is |
|---|---|
| `townsquare.json` | The manifest. Strict: an unknown key is an error, not ignored |
| `index.html` | The entry document, named by `entry` in the manifest |
| `icon.png` | Named by `icon`. Must be square |
| `README.md` | This file. A bundle may carry `.md`, `.txt`, `.json` and the usual web files |

Everything the creation loads must be a file in this folder. No CDN, no npm at
runtime, no remote scripts: the sandbox serves it with `script-src 'self'`.

## Permissions: declare exactly what you use

This starter declares one permission, `"identity": "handle"`, because it calls
`user.current()`. Everything under `town.*` needs no declaration. A reviewer
reads the permissions block before the code, so an unused permission is a
reason to send a submission back.

What the other entries look like when you need them:

```json
"permissions": {
  "identity": "handle",
  "storage": true,
  "network": ["api.weather.gov"],
  "read": ["senior_service"],
  "write": ["senior_service"]
},
"defines": [
  {
    "type": "senior_service",
    "label": "Senior service",
    "schema": {
      "name": { "type": "string", "required": true, "maxLength": 120 },
      "phone": { "type": "string" },
      "website": { "type": "url" }
    }
  }
]
```

- `storage: true` unlocks `storage.get` and `storage.set`: 64 KB per resident,
  private to your creation. See `burrito-index` for a working example.
- `network` is a list of bare https hostnames (no scheme, port, path or
  wildcard). Each one is compiled into the frame's CSP.
- `read`, `write` and `defines` are for shared town records (`records.*`).

## Two limits to know about

### Some town.* reads answer empty in the local shell

`town.info` and `town.businesses` return real data. `town.thisWeek`,
`town.items` and `town.item` are documented and allowed, but the shell's data
source in `apps/web/src/townData.ts` still answers them with empty lists and
`null`. A creation that reads events will run without errors and show nothing,
so do not read an empty result there as a bug in your code.

### Records are not built yet

`records.list`, `records.get`, `records.create`, `records.update` and
`records.history` are part of the documented SDK and the manifest accepts
`read`, `write` and `defines` today, but the host does not serve them yet.
Every `records.*` call currently fails with "not available yet in this town"
(see `NotYetError` in `packages/host/src/bridge.ts`). Design your data model
against the documented shape, and expect to wire the calls once write-back
ships. This starter does not fake it.

## Read next

- `packages/sdk/generated/AGENTS.md`: every SDK method, what it requires and
  what it throws
- `spec-manifest-and-sdk.md`: the full contract
- `creation-authoring.md`: how a creation is submitted and reviewed
