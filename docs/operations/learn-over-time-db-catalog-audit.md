# Learn Over Time DB Catalog Audit

This audit complements migration tests by verifying the deployed Learn Over Time schema through one of two modes:

- `live-catalog-direct`
- `live-schema-dump`

Both modes verify the same important Learn Over Time objects:

- RLS enabled
- forced RLS enabled
- expected policies on policy-bearing tables
- append-only immutability triggers on immutable history tables
- key indexes
- key constraints
- key queue/provenance functions

## Command

```bash
npm run audit:learn-over-time:db-catalog
```

## Mode Selection

The script supports:

- `AUDIT_DB_CATALOG_MODE=auto`
- `AUDIT_DB_CATALOG_MODE=direct`
- `AUDIT_DB_CATALOG_MODE=schema-dump`

Default:

- `auto`

### Direct Mode

Mode label:

- `live-catalog-direct`

Direct mode uses PostgreSQL catalog queries through `pg` and is the strongest proof level.

Required env:

- `SUPABASE_DB_URL`
- or `DATABASE_URL`

The URL must be a real direct PostgreSQL connection string, not a placeholder.

This mode queries live catalog tables such as:

- `pg_class`
- `pg_namespace`
- `pg_policies`
- `pg_trigger`
- `pg_indexes`
- `pg_constraint`
- `pg_proc`

### Supabase CLI Schema-Dump Mode

Mode label:

- `live-schema-dump`

Schema-dump mode is the fallback when direct credentials are unavailable or deliberately not used.

It uses the linked Supabase CLI project and runs a live remote schema dump:

- `supabase db dump --linked --schema public --file <tmp-file>`

This mode verifies objects from dumped SQL text rather than direct `pg_catalog` queries.

The audit output labels these checks as:

- `CHECKED_FROM_SCHEMA_DUMP`

not:

- `CHECKED_FROM_PG_CATALOG`

## Auto Mode Behavior

`AUDIT_DB_CATALOG_MODE=auto` behaves like this:

1. use direct mode if `SUPABASE_DB_URL` or `DATABASE_URL` is real and usable
2. otherwise use linked Supabase CLI schema-dump mode if the project is linked
3. otherwise fail clearly

## How To Link The Supabase Project

The schema-dump fallback requires the local project to be linked.

Typical link command:

```bash
npx supabase link --project-ref <project-ref>
```

Useful local checks:

```bash
npx supabase status
cat supabase/.temp/project-ref
```

If the project is not linked, the audit fails with:

```text
Supabase CLI project is not linked. Run `npx supabase link --project-ref <project-ref>` or provide SUPABASE_DB_URL.
```

The linked CLI path also requires Supabase CLI authentication.

Provide it with either:

- `npx supabase login`
- or `SUPABASE_ACCESS_TOKEN`

## What Each Mode Proves

### `live-catalog-direct`

Strongest proof:

- live object existence from PostgreSQL catalog
- live RLS flags from `pg_class`
- live policies from `pg_policies`
- live triggers from `pg_trigger`
- live functions from `pg_proc`

### `live-schema-dump`

Operational fallback:

- verifies deployed schema text from the linked remote database
- still checks for required objects
- honestly reports that the proof came from schema dump parsing, not direct `pg_catalog`

This mode reduces the old caveat substantially, but it is still not identical to direct catalog SQL.

## What PASS Means

`PASS` means the selected mode found the expected Learn Over Time security and audit foundations:

- expected tables have RLS enabled and forced
- expected policy-bearing tables have policies
- immutable history triggers exist
- key indexes exist
- key constraints exist
- key worker/RPC functions exist

## What FAIL Means

`FAIL` means at least one expected object is missing or drifted.

The output lists:

- audit mode
- verification source
- missing category
- missing item
- message

Do not treat migration tests as a substitute for a direct or schema-dump audit result.

## What To Do If Password Auth Fails

If direct mode is configured but the connection fails, the script reports:

```text
Direct DB connection failed. To use Supabase CLI fallback, unset SUPABASE_DB_URL/DATABASE_URL or run with AUDIT_DB_CATALOG_MODE=schema-dump.
```

That prevents silent weakening when a real direct URL was explicitly provided.

If schema-dump mode is selected but CLI auth is missing, the script reports:

```text
Supabase CLI schema dump failed because no CLI access token is available. Run `npx supabase login` or set SUPABASE_ACCESS_TOKEN, then rerun the audit.
```

## Expected PASS Output

Example:

```text
Audit mode: live-schema-dump
Verification source: CHECKED_FROM_SCHEMA_DUMP
Result: PASS
```

or:

```text
Audit mode: live-catalog-direct
Verification source: CHECKED_FROM_PG_CATALOG
Result: PASS
```

## When To Run

Run this:

1. before production-readiness signoff
2. after Supabase schema changes
3. after linked-project migration pushes
4. during incident response if RLS or immutability drift is suspected

## Why This Exists

Migration tests prove intent.

The catalog audit proves deployed state through either:

- direct PostgreSQL catalog inspection
- or linked Supabase remote schema dump inspection

Both are useful:

- migration tests catch code-review drift
- catalog audit catches deployment/config drift
