---
type: design
title: Town Square MCP server - implementation design
status: draft
updated: 2026-08-03
---

> Design pass generated 2026-08-03. Where this and a spec disagree after the
> Phase 0 spec fixes land, the spec wins.

# Town Square MCP

`townsquare-mcp` is its own Railway service, stateless per request, fully authenticated
before an `McpServer` exists. It exposes a frozen `TOOL_DEFS` table gated by a fixed chain:
**authenticate, resolve resident, gate scope, gate privilege tier, rate limit, execute,
meter**. It teaches the SDK from a *generated* artifact that cannot drift, moves bundle
bytes out of band via presigned upload so they never enter the model's context, and runs
the exact same validator that `submit` runs, so the reviewer only ever sees bundles that
already passed every mechanical check.

House style is lifted from `team/naturalstateintel/stategov-app/src/mcp/`.

## Scopes and tiers

```ts
export const TS_SCOPES = Object.freeze(['docs', 'town_read', 'author', 'publish'] as const)
export const TS_TIERS  = Object.freeze(['account', 'confirmed', 'verified'] as const)
```

`account` = a live token. `confirmed` = `users.email_confirmed`. `verified` =
`users.verified_resident`. Monotonic, so the gate is an index comparison.

`requires` is a required field on every ToolDef: a tool that forgets to declare its
privilege floor must fail to compile.

## The 16 tools

| # | tool | scope | requires | returns |
|---|---|---|---|---|
| 1 | `whoami` | docs | account | handle, verified status, what you may do next, quota |
| 2 | `get_sdk_docs` | docs | account | the generated contract, sectioned |
| 3 | `list_templates` | docs | account | working shapes with a "pick this when" line |
| 4 | `scaffold` | docs | account | complete file contents for one template |
| 5 | `get_town_info` | town_read | account | town id, name, timezone, tokens, counts |
| 6 | `list_record_types` | town_read | account | every type + schema + definer + row count |
| 7 | `query_town_data` | town_read | account | items / businesses / this-week, paginated |
| 8 | `query_records` | town_read | account | live rows of one record type |
| 9 | `validate` | author | account | structured findings; same fn `submit` runs |
| 10 | `create_bundle_upload` | author | confirmed | bundle_id, upload_url, expires_at, howto |
| 11 | `finalize_bundle` | author | confirmed | inventory verification + validation report |
| 12 | `preview` | author | confirmed | tokenized sandbox URL |
| 13 | `submit` | publish | **verified** | submission id, queue position, next steps |
| 14 | `get_submission_status` | publish | confirmed | status, reviewer notes, per-finding reasons |
| 15 | `list_my_creations` | publish | confirmed | your creations, live version, pending, health |
| 16 | `fork_creation` | author | confirmed | full source of a public creation as a draft |

Deliberately **not** tools: `records.create` (writes belong to the running creation with
dual attribution; a write path through the authoring server is an attribution forgery hole),
`delete_creation`, and `publish` (there is no direct publish, that is the whole review
decision).

Additions beyond the spec's original seven, and why each is load-bearing:

- **`whoami`** must be called first. An unverified resident can build, validate and preview
  and then cannot submit. Discovering that at the end wastes the entire session.
- **`list_record_types`** is how creations compound. Without it the whole `defines` story is
  unreachable and every builder reinvents a parallel type for the same fact.
- **bundle transfer tools** exist because files cannot travel through tool calls (see below).
- **`get_submission_status`** closes the loop after a rejection.

## Tool descriptions are the load-bearing part

They must state WHEN to call, what the id schemes mean, what the failure modes are, and
which errors are answers rather than retries. Server-level instructions state the four rules
no tool can enforce: everything is vendored, every capability is declared, the signed-out
user is the common case, and never minify.

Error codes are closed and stable. `not_verified` and `validation_failed` are ANSWERS,
relay them and change course. Only `service_unavailable` and `rate_limited` are retryable.

## Auth: one principal, two front doors

Claude Code accepts a static bearer. claude.ai web and ChatGPT require OAuth 2.1 with PKCE,
RFC 8414 and RFC 9728 metadata, and in practice RFC 7591 dynamic client registration.
Supporting only one strands half the audience, but Claude Code is the launch audience so
**OAuth is deferred to Phase 4 of the MCP work**.

The MCP is a pure OAuth *resource server*. The authorization server lives in the Fastify web
app, which already owns sessions and the login page. The MCP never sees a password, never
renders HTML, never sets a cookie.

Both credential families are rows in one `mcp_tokens` table distinguished by `kind`, so the
resolver has one code path. Token format `ts_live_` + 43 base62, minted by a single
`mintToken()`, shown once, sha256 at rest, with a non-secret `token_prefix` as the only
fragment ever logged.

**Nothing is cached.** Every request re-reads the token and the user row, so a revoked token
and a just-un-verified resident both take effect on the very next call.

The privilege gate lives in the registration loop, not the handler, because the SDK parses
JSON-RPC internally and the handler never sees a tool name. All tools stay registered for
every caller so an under-privileged call gets an actionable refusal naming the exact next
action, rather than a generic unknown-tool error that an agent will retry three times and
then work around.

## Bundles move out of band

**Files through tool calls is fatal, specifically because of vendoring.** A vendored map
library is ~150 KB. That is tens of thousands of tokens the resident pays for, and worse,
the model must reproduce it byte-exact through its own context. It will not. It will reflow,
truncate with an ellipsis comment, or "improve" a minified file. That is asking a language
model to be a lossy file-copy utility on the one class of file where lossiness is a
security-relevant corruption.

```
create_bundle_upload({ manifest, files: [{ path, bytes, sha256 }] })
   -> validate manifest NOW (cheap, model-authored, catch it before the upload)
   -> reject on size/count/path/type BEFORE a byte moves
   -> { bundle_id, upload_url (presigned PUT, 15 min), expected_sha256, howto }
<agent runs one shell command>
finalize_bundle({ bundle_id })
   -> unpack, verify every file against the declared inventory, full validation report
```

**The inventory is the audit primitive.** The agent declares what it is shipping and the
server verifies the tarball matches. A file present in the upload but absent from the
inventory is `invalid_bundle`. That single check is what makes "all deps vendored"
enforceable rather than aspirational.

Three ergonomic layers over one contract: `npx @townsquare/cli push` (the documented happy
path), raw `curl` from `howto`, and `put_bundle_inline` capped at 128 KB of text files with
zero vendored dependencies, so a resident on claude.ai web can ship a first simple creation
without being tempted to push a library through it.

Limits enforced before the URL is issued: 5 MB uncompressed total, 1 MB single file, 200
files, relative POSIX paths only (no `..`, no leading `/`, no symlinks, no dotfiles except
`.well-known`), a closed extension allowlist, and a >100:1 compression ratio rejection for
zip bombs.

## Docs cannot drift

Drift is prevented by making the drifted state fail to build. `packages/sdk` is the single
source of truth (implementation + TSDoc + `examples/` that are compiled and executed against
a mock bridge). `packages/docs-gen` walks the TS AST and the zod schema to emit a frozen,
hashed, version-stamped artifact consumed by the MCP, the templates' `AGENTS.md`, the docs
site, and the validator's SDK symbol table.

Three locks:

1. **CI diff.** Regenerate and `git diff --exit-code`. Necessary, insufficient alone.
2. **Boot guard.** The MCP refuses to start if the artifact hash is inconsistent or the SDK
   version does not match. A docs/SDK skew is as dangerous as an unauthenticated endpoint,
   because it silently teaches an entire generation of creations a contract that does not
   exist.
3. **The validator eats its own docs.** The table of legal SDK call sites *is* the `symbols`
   array from the artifact, not a hand-written list. Document a function the SDK does not
   export and the validator rejects code calling it; add an export without TSDoc and the
   generator throws. This is the lock that actually holds, because it makes the docs
   load-bearing at runtime rather than merely published.

## Validation

`packages/validate` is pure: unpacked bundle plus docs artifact in, findings out. No network,
no DB, no filesystem. That is what lets `validate` (advisory), `finalize_bundle`, and
`submit` call the identical function. **`submit` re-runs it server-side and refuses on any
error** — `validate` is a convenience, never the gate.

- **A. Manifest.** Strict zod, no unknown keys (a typo'd `permisions` must not silently mean
  zero permissions). Slug pattern, semver strictly greater than the approved version, icon
  is 1:1 and actually parsed, `author` present is a hard error.
- **B. Undeclared permission use.** Parse JS with a real parser (acorn/oxc, never regex).
  Map SDK call sites through the artifact's permission table. A **non-literal** record type
  is `error: dynamic_record_type` — a reviewer cannot see what it reads. Over-declaration is
  a `warn`, which matters because LLMs over-declare reflexively and a permissions block full
  of unused capabilities is unreadable.
- **C. Network/CSP.** Collect outbound hosts from fetch, XHR, WebSocket, EventSource,
  sendBeacon, Image.src, every element src/href, CSS `url()` and `@import`, Worker,
  importScripts. Dynamic hosts are an error. Emit the `compiled_csp` string.
- **D. Vendoring.** No bare specifiers except `@townsquare/sdk`, no absolute-URL imports, no
  dynamic import with a non-literal argument, no `node_modules/`, no lockfile, every relative
  path resolves inside the inventory, known CDN hosts named explicitly in the error.
- **E. Reviewability.** No `eval`/`new Function`/`document.write`. No `postMessage` to
  parent/top outside the SDK, because code that opens its own door invalidates the entire
  audit story. Minification heuristics as hard errors. Secret scanning (`sk-`, `ghp_`,
  `AKIA`, `ts_live_`, PEM, JWT shape), because a vibecoded app will paste an API key into a
  config file and source is public by default.
- **F. Bundle hygiene.** All limits re-checked post-unpack, inventory mismatch,
  no `.git`/`.env`/`.DS_Store`, valid UTF-8.
- **G. Runtime smoke** (at finalize, deferred until blank-white-box submissions appear).
  Load headless in the real sandbox with the compiled CSP; assert `app.ready()` within 5s,
  no uncaught exception, no CSP violation.

The reviewer's screen is then: manifest diff, declared-vs-observed permission tables, the
compiled CSP, the source tree, the smoke screenshot, and warnings. Nothing mechanical
remains. That is the bound on Tal's time.

## Layout

```
apps/mcp/
  src/townsquare-mcp.ts           entrypoint: assert env, start
  src/townsquare-mcp-server.ts    lifecycle, boot guards, SIGTERM drain
  src/townsquare-mcp-handler.ts   http, CORS, /health, RFC 9728, auth-before-McpServer
  src/townsquare-tools.ts         SERVER_INFO, SERVER_INSTRUCTIONS, TOOL_DEFS, register loop
  src/authenticate.ts src/principal.ts src/bundles.ts
  src/rate-limit.ts src/usage.ts src/errors.ts src/scopes.ts src/tiers.ts
Dockerfile.mcp + railway.mcp.json at repo root
```

Tables beyond Tier 0/1: `mcp_tokens`, `oauth_clients`, `oauth_auth_codes`,
`creation_bundles`, `creation_versions`, `record_types`, `preview_sessions`, `mcp_usage`,
`mcp_rate_windows`. `mcp_usage` carries a check constraint that a rejection must have an
error code, mirrored in TS as a discriminated union so the mismatch fails to compile.

Boot guards, all fail-closed: `DATABASE_URL`, bundle storage credentials,
`TOWNSQUARE_API_BASE`, `SANDBOX_ORIGIN` (an unset one would emit same-origin previews, which
is a sandbox escape), `MCP_PUBLIC_ORIGIN`, plus `assertSdkDocsCoherent()` and
`assertToolDefs()`.

## Build sequence

- **Phase 0** the contract. The MCP is a wrapper; wrapping a contract that does not exist
  yet produces a wrapper you throw away.
- **Phase 1** read-only MCP: skeleton, PAT auth, `/settings/connect`, tools 1-8. Ship it. A
  resident can point Claude Code at Town Square, learn the SDK, and read live town data.
  Complete and demoable on its own.
- **Phase 2** the author loop: validator, tools 9-12, bundle storage, preview, CLI.
- **Phase 3** submission and review: `creation_versions`, tools 13-15, reviewer screen,
  `record_types` reconciliation, the verified gate.
- **Phase 4** OAuth 2.1. Last, because building an authorization server before anyone has
  shipped a creation is building for an unproven audience.

Deferred: `fork_creation` (worthless before ~10 approved creations), trusted-builder
auto-approve (wire the column in Phase 3, leave it unused until there is approval history to
set a threshold), runtime smoke, ChatGPT adapters, multi-town.

## Testing

Table invariants asserted at module load and in a test. In-process MCP client over
`InMemoryTransport`. HTTP integration that boots, serves, shuts down and reboots on the same
store. A nine-case auth matrix whose two tier cases assert the actionable message by string.
A validator golden corpus with one broken fixture per finding code, plus a table test
asserting every code in the union has a fixture, which is what keeps the check list from
rotting. Docs coherence regenerated in CI. An end-to-end Flock camera map driven entirely
through MCP tool calls. And a sandbox escape suite where each attack must be caught by
`validate` *and* refused at runtime by the bridge, because either layer alone will
eventually have a hole.
