# Database ERD

Entity-relationship diagrams for the Town Square Postgres database, drawn from
[`src/schema.ts`](src/schema.ts) (25 tables, migrations `0000` to `0002`).
GitHub draws the diagrams below automatically. Images for slides and reports
are in [`erd/`](erd/).

## How to read these

- **Crow's foot notation.** `||` exactly one, `o|` zero or one, `}o` zero or
  more, `}|` one or more.
- **Solid line:** the child's primary key includes the parent's key (an
  identifying relationship), e.g. a `content_items` row is keyed by `town_id`.
  **Dashed line:** an ordinary reference.
- **No relationship here is a database foreign key.** The schema declares none.
  Every line is a link the application keeps by naming convention (`user_id`,
  `creation_id`, `town_id`, ...). Some are deliberately loose; see
  [Links that are not lines](#links-that-are-not-lines).
- **PK** primary key, **FK** column that refers to another table, **UK** unique.
  A key made of several columns is marked on each of them.
- A box with no columns belongs to another section and is shown for context.

## Overview

How the areas connect: people, creations, and shared records. To keep this one
picture readable it leaves out two kinds of table, which the section diagrams
below show in full:

- **`towns`**, because almost every table carries a `town_id`.
- **Tables that link only to `users`:** `sessions`, `auth_challenges`,
  `vouches`, `mcp_tokens`, `saves`, `contribution_drafts` and
  `contribution_attempts`. Also `content_items` and `source_health`, which link
  only to `towns`, and `act_token_revocations`, which links to nothing.

```mermaid
erDiagram
    users ||..o{ creations : "owns"
    users ||..o{ creation_bundles : "uploads"
    users ||..o{ creation_storage : "keeps"
    users ||..o{ contributions : "proposes"
    users ||..o{ reports : "files"
    users ||..o{ moderation_actions : "acts as moderator"
    users |o..o{ record_versions : "authors"

    creations ||..o{ creation_versions : "has"
    creations |o..o| creation_versions : "runs active"
    creations |o..o{ creations : "forked from"
    creation_versions ||--o{ creation_files : "contains"
    creation_blobs ||..o{ creation_files : "stores bytes of"
    creations ||--o{ creation_storage : "scopes"
    creations ||..o{ api_keys : "has"
    creations ||..o{ moderation_actions : "is acted on"
    creations |o..o{ record_types : "defined"
    creations |o..o{ record_versions : "authored via"

    record_types ||..o{ records : "types"
    records ||..o{ record_versions : "has"
    records |o..o{ contributions : "is changed by"
    contributions |o..o{ record_versions : "produced"
```

`act_token_revocations` stands alone: it lists ids of stateless tokens to cut
off early, and those tokens have no table of their own.

## Town and ingested content

The town itself, and what is scraped into it. Content is never deleted; it is
marked `stale`.

```mermaid
erDiagram
    towns ||--o{ content_items : "has content"
    towns ||--o{ source_health : "tracks sources"

    towns {
        text id PK
        text name
        text state
        float8 center_lat
        float8 center_lng
        text timezone "default America/Chicago"
        timestamptz created_at
        timestamptz updated_at
    }
    content_items {
        text town_id PK, FK "-> towns"
        text tsp_id PK
        text type
        text title
        text description
        text source
        text republish_rule
        jsonb tags
        text community
        jsonb geo
        text canonical_url
        timestamptz starts_at
        timestamptz ends_at
        text location
        bool is_all_day
        text recurrence
        text cost
        text severity
        timestamptz expires_at
        bool is_active
        text category
        text address
        text phone
        text website
        text hours
        text author
        timestamptz published_at
        text image_url
        jsonb raw
        timestamptz first_seen_at
        timestamptz last_seen_at
        text status "active / stale, never deleted"
        timestamptz created_at
        timestamptz updated_at
    }
    source_health {
        text town_id PK, FK "-> towns"
        text source PK
        int item_count
        text status
        timestamptz last_seen_at
    }
```

## People and access

Accounts are deliberately thin: no real name, no password column anywhere.
Sign-in is by one-time email challenge.

```mermaid
erDiagram
    users ||..o{ sessions : "signs in with"
    users ||..o{ auth_challenges : "receives"
    users ||..o{ vouches : "vouches for (voucher_id)"
    users ||..o{ vouches : "is vouched by (vouchee_id)"
    users |o..o{ vouches : "revokes (revoked_by)"
    users ||..o{ mcp_tokens : "holds"
    users ||..o{ saves : "bookmarks"
    towns ||..o{ saves : "scopes"

    users {
        uuid id PK
        text handle UK "public, case-insensitive"
        text email UK "private, case-insensitive"
        bool email_confirmed
        text role "user / moderator / admin"
        bool verified_resident
        text verified_method "vouch / postcard / manual"
        timestamptz verified_at
        int vouch_budget_override
        timestamptz created_at
        timestamptz updated_at
    }
    sessions {
        uuid id PK
        uuid user_id FK "-> users"
        text token_hash UK
        timestamptz created_at
        timestamptz last_seen_at
        timestamptz expires_at
        timestamptz revoked_at
    }
    auth_challenges {
        uuid id PK
        uuid user_id FK "-> users"
        text purpose "confirm / signin"
        text token_hash UK
        timestamptz created_at
        timestamptz expires_at
        timestamptz consumed_at
        int attempts
    }
    vouches {
        uuid id PK
        uuid voucher_id FK "-> users, UK with vouchee_id"
        uuid vouchee_id FK "-> users"
        text note
        timestamptz created_at
        timestamptz revoked_at
        uuid revoked_by FK "-> users"
    }
    act_token_revocations {
        text jti PK
        text reason
        timestamptz revoked_at
        timestamptz expires_at
    }
    mcp_tokens {
        uuid id PK
        uuid user_id FK "-> users"
        text kind "pat / oauth_access / oauth_refresh"
        text token_hash UK
        text token_prefix
        jsonb scopes
        text label
        timestamptz created_at
        timestamptz last_used_at
        timestamptz expires_at
        timestamptz revoked_at
    }
    saves {
        uuid id PK
        text town_id FK "-> towns"
        uuid user_id FK "-> users"
        text kind "business / event / creation / story"
        text ref_id "not a FK, see below"
        text title "snapshot at save time"
        text detail
        text url
        timestamptz saved_at
    }
```

## Creations

Apps residents build. Every version is reviewed before it can run, files are
stored by content hash, and nothing is hard-deleted.

```mermaid
erDiagram
    towns ||..o{ creations : "hosts"
    users ||..o{ creations : "owns"
    creations |o..o{ creations : "forked from"
    creations ||..o{ creation_versions : "has"
    creations |o..o| creation_versions : "runs active"
    creation_versions |o..o{ creation_versions : "reverted from"
    users |o..o{ creation_versions : "reviews"
    creation_versions ||--o{ creation_files : "contains"
    creation_blobs ||..o{ creation_files : "stores bytes of"
    users ||..o{ creation_bundles : "uploads"
    towns ||..o{ creation_bundles : "targets"
    creations ||--o{ creation_storage : "scopes"
    users ||--o{ creation_storage : "keeps"
    creations ||..o{ api_keys : "has"

    creations {
        uuid id PK
        text town_id FK "-> towns, UK with slug"
        uuid owner_id FK "-> users"
        text origin_key UK "never reused"
        text slug
        text name
        text tagline
        text description
        jsonb tags
        text kind "embedded / linked"
        text url "linked only"
        text status "active / hidden / blocked"
        uuid active_version_id FK "-> creation_versions"
        text source_visibility
        uuid forked_from_id FK "-> creations"
        timestamptz last_seen_ok
        timestamptz created_at
        timestamptz updated_at
    }
    creation_versions {
        uuid id PK
        uuid creation_id FK "-> creations, UK with version"
        text version
        jsonb manifest
        text csp_header "frozen at publish"
        text bundle_sha256
        int byte_size
        int file_count
        text status "draft / submitted / approved / rejected / superseded"
        jsonb validation_report
        uuid reverted_from_version_id FK "-> creation_versions"
        timestamptz submitted_at
        uuid reviewed_by FK "-> users"
        timestamptz reviewed_at
        text review_notes
        timestamptz created_at
    }
    creation_files {
        uuid version_id PK, FK "-> creation_versions"
        text path PK
        text sha256 FK "-> creation_blobs"
        int byte_size
    }
    creation_blobs {
        text sha256 PK
        bytea bytes
        int byte_size
        timestamptz created_at
    }
    creation_bundles {
        uuid id PK
        uuid user_id FK "-> users"
        text town_id FK "-> towns"
        text status "staged / uploaded / finalized / expired"
        jsonb manifest
        jsonb inventory
        jsonb validation_report
        timestamptz created_at
        timestamptz expires_at
    }
    creation_storage {
        uuid creation_id PK, FK "-> creations"
        uuid user_id PK, FK "-> users"
        text key PK
        jsonb value
        int byte_size
        timestamptz updated_at
    }
    api_keys {
        uuid id PK
        uuid creation_id FK "-> creations"
        text key_hash UK
        text key_prefix
        timestamptz created_at
        timestamptz last_used_at
        timestamptz revoked_at
    }
```

## Records and contributions

Shared town data that creations read and write (the SDK's `records.*`), and
the proposals residents submit. Every change is a new version; there is no
delete. Drafts are the one thing that is ever really deleted.

```mermaid
erDiagram
    towns ||--o{ record_types : "defines"
    creations |o..o{ record_types : "defined (defined_by_creation_id)"
    creation_versions |o..o{ record_types : "defined in (defined_by_version_id)"
    record_types ||..o{ records : "types (town_id + type)"
    records ||..o{ record_versions : "has"
    users |o..o{ record_versions : "authors (author_user_id)"
    creations |o..o{ record_versions : "authored via (author_creation_id)"
    contributions |o..o{ record_versions : "produced"
    towns ||..o{ contributions : "scopes"
    users |o..o{ contributions : "proposes (contributor_id)"
    users |o..o{ contributions : "decides (decided_by)"
    records |o..o{ contributions : "is changed by"
    users ||..o{ contribution_drafts : "drafts"
    towns ||..o{ contribution_drafts : "scopes"
    users ||..o{ contribution_attempts : "attempts"

    record_types {
        text town_id PK, FK "-> towns"
        text type PK
        text label
        jsonb schema
        uuid defined_by_creation_id FK "-> creations"
        uuid defined_by_version_id FK "-> creation_versions"
        bool write_open
        timestamptz created_at
    }
    records {
        uuid id PK
        text town_id FK "-> record_types, with type"
        text type FK "-> record_types, with town_id"
        jsonb data
        int current_version
        text status "active / stale / hidden, no delete"
        timestamptz created_at
        timestamptz updated_at
    }
    record_versions {
        uuid id PK
        uuid record_id FK "-> records, UK with version"
        int version
        jsonb data
        uuid author_user_id FK "-> users"
        uuid author_creation_id FK "-> creations"
        uuid author_org_id "no organisations table yet"
        text author_source_label
        uuid contribution_id FK "-> contributions"
        int reverted_from "an earlier version number"
        timestamptz created_at
    }
    contributions {
        uuid id PK
        text town_id FK "-> towns"
        text type "event / correction / notice / collection / photo"
        jsonb content
        text content_digest
        jsonb attribution
        uuid contributor_id FK "-> users"
        text status
        text route "none / owner / moderator"
        bool counts_toward_pause
        uuid record_id FK "-> records"
        int record_version
        timestamptz scheduled_for
        uuid decided_by FK "-> users, null = system"
        text decision_note
        timestamptz decided_at
        timestamptz created_at
        timestamptz updated_at
    }
    contribution_drafts {
        uuid id PK
        text town_id FK "-> towns"
        uuid user_id FK "-> users"
        text type
        jsonb content "unvalidated"
        text title
        timestamptz created_at
        timestamptz updated_at
    }
    contribution_attempts {
        uuid id PK
        uuid user_id FK "-> users"
        bool allowed
        timestamptz created_at
    }
```

## Moderation

Reports are residents asking for a look; moderation actions are the town's
append-only record of what a moderator actually did.

```mermaid
erDiagram
    towns ||..o{ reports : ""
    users ||..o{ reports : "files (reporter_id)"
    users |o..o{ reports : "resolves (resolved_by)"
    creations |o..o{ reports : "may be target"
    records |o..o{ reports : "may be target"
    users |o..o{ reports : "may be target"
    towns ||..o{ moderation_actions : ""
    creations ||..o{ moderation_actions : "is acted on"
    users ||..o{ moderation_actions : "acts (actor_id)"
    creation_versions |o..o{ moderation_actions : "reverted from / to"

    reports {
        uuid id PK
        text town_id FK "-> towns"
        uuid reporter_id FK "-> users, verified only"
        text target_type "creation / record / user"
        text target_id "id in the target_type table"
        text target_version
        text reason
        text detail
        text resolution "upheld / dismissed / reverted"
        uuid resolved_by FK "-> users"
        timestamptz resolved_at
        text resolution_note
        timestamptz created_at
    }
    moderation_actions {
        uuid id PK
        text town_id FK "-> towns"
        uuid creation_id FK "-> creations"
        text action "hide / block / restore / revert"
        uuid actor_id FK "-> users"
        text note
        uuid from_version_id FK "-> creation_versions"
        uuid to_version_id FK "-> creation_versions"
        timestamptz created_at
    }
```

## Links that are not lines

- **`saves.ref_id`** names a business, event, creation or story (`kind` says
  which), but it is deliberately not a foreign key. Town content is re-scraped
  and its ids come and go, and a save is a snapshot (`title`, `detail` and
  `url` as they read when saved), so a bookmark survives its target changing.
- **`reports.target_id`** points into `creations`, `records` or `users`
  depending on `target_type`. That is why the moderation diagram shows three
  "may be target" lines.
- **`record_versions.author_org_id`** is reserved for organisations posting in
  public, and there is no organisations table yet.
- **`record_versions.reverted_from`** and **`contributions.record_version`**
  are version numbers, not ids: together with `record_id` they name a row in
  `record_versions`.
- **`creation_versions.bundle_sha256`** is a hash of the whole bundle, not a
  row in `creation_blobs`. Each file's `sha256` is.

## Keeping this up to date

This file is written by hand from `src/schema.ts`. When a migration adds or
changes a table, update the matching section and re-export the images in
[`erd/`](erd/).
