# Hosted customer database bootstrap

Status: 27 October 2026. This is the operator procedure for a new dedicated
customer Supabase project. It reuses the approved Phase 1O baseline and the
normal forward migration set; it does not replay the historical chain and does
not create a second migration history.

## Authority

- Baseline: `supabase/baselines/phase1o-1/baseline.sql`
  SHA-256 `52ac69bea6587301c9d50fca809847bb077f03471406476b1d01ed2520c5a372`.
- Baseline cut: `20260913160000_reconcile_indexes_and_check_contracts.sql`.
- Excluded data-operation migration:
  `20260810190000_cleanup_phase1_material_test_fixtures.sql`.
- Release manifest: `ops/releases/<version>.json` (`database.baseline`,
  `database.baselineSha256`, `database.migrationTarget`).
- Baseline proof: the Phase 1O local proof remains a proof, not a hosted
  provisioning service. Hosted live-state reconciliation is still an approval
  gate for calling a baseline production-authoritative.

## Safety properties

The command:

- is dry-run by default and requires `--apply`;
- refuses `mvxyxvrxaorzglppxzzz` (Main), `ibjyzpyuqupsxqakpzxj` (Alpha) and
  `pcekmljoyrlacdsrlmiy` (Hub);
- requires the database host to contain the expected project ref;
- refuses a non-empty `public` schema unless `--resume` proves the ledger
  contains only approved baseline/forward versions;
- verifies the baseline SHA against the release manifest;
- applies only migrations after the baseline cut, in order, each in a
  transaction with its ledger row;
- verifies the final ledger exactly (target applied, no missing, no unexpected);
- never prints the database URL or password;
- can write a `pg_dump` custom-format backup before mutation.

It does **not** create a Supabase project, change billing, configure Auth, or
restore backups. Those remain external operator actions.

## Preconditions

1. A new, dedicated Supabase project exists in the approved organisation and
   region (Sydney for TradeLynk).
2. The project is empty: no customer `public` tables, no prior customer data.
3. The customer repository has the approved `supabase/migrations` snapshot.
4. The DB password and service-role key are in the approved secret store.
5. `psql` (PostgreSQL client) is available on the trusted operator host.
6. The operator has explicit approval to mutate this project.

Never run this against Alpha, Main or the Business Hub database.

## Dry run

```bash
CUSTOMER_DATABASE_URL='postgresql://postgres:...@db.<ref>.supabase.co:5432/postgres' \
node scripts/ops/bootstrap-customer-database.mjs \
  --customer-key tradelynk \
  --project-ref <20-character-ref> \
  --customer-repo /path/to/tradesstack-client-tradelynk \
  --release 1.2.5
```

Expected output includes `PLAN_ONLY`, the baseline/forward counts, the target,
and `baselineSha256`. No SQL is executed.

## Apply

```bash
CUSTOMER_DATABASE_URL='postgresql://postgres:...@db.<ref>.supabase.co:5432/postgres' \
node scripts/ops/bootstrap-customer-database.mjs \
  --customer-key tradelynk \
  --project-ref <20-character-ref> \
  --customer-repo /path/to/tradesstack-client-tradelynk \
  --release 1.2.5 \
  --backup-dir /secure/customer-backups \
  --apply
```

The command:

1. preflights the database identity and emptiness;
2. writes a timestamped custom-format backup;
3. ensures `supabase_migrations.schema_migrations`;
4. applies the baseline SQL once;
5. records exactly the baseline-covered versions (504 at this cut);
6. applies the forward migrations through the release target;
7. verifies the ledger.

Expected status: `APPLIED` with `verification.status: PASS`, target applied,
and no missing/unexpected versions.

## Resume

If a forward migration fails, fix the cause and re-run with `--resume`. The
command:

- refuses if the ledger contains versions outside the approved baseline and
  forward set;
- records the baseline versions idempotently;
- skips forward versions already in the ledger;
- applies only the remaining forward migrations;
- re-verifies the whole ledger.

Do not use `supabase db reset`, `--include-all`, manual ledger edits or a
historical replay to “repair” a production project.

## Backup and restore

- Backup is a `pg_dump --format=custom` file written outside the repository.
- Restore into a **separate** project first:

```bash
pg_restore --no-owner --no-acl --clean --if-exists \
  --dbname 'postgresql://postgres:...@db.<new-ref>.supabase.co:5432/postgres' \
  /secure/customer-backups/<file>.dump
```

- Validate Auth users, organisations, RLS, Storage metadata and object storage
  separately. A database dump does not restore Supabase Storage objects.
- Only repoint the customer after the restore is verified.
- Supabase Free has no managed backups/PITR. Decide the plan or implement
  encrypted logical backups and test a restore before go-live.

## Verification after apply

1. Ledger: target applied, counts match, no unexpected versions.
2. Auth: site URL and redirect URLs set; invite/reset tested.
3. RLS: ordinary-user own-org allowed; cross-org denied; anonymous denied.
4. Storage: buckets/policies exist; private signed access works.
5. Application: `/api/health` reports the expected release/environment; smoke
   tests pass.
6. Evidence: record the project ref, release, source SHA, baseline SHA, target,
   applied counts and restore evidence in the implementation record.

## Current validation state

Validated locally:

- baseline cut and migration classification (504 baseline, 20 forward at 1.2.4);
- baseline SHA against the release manifest;
- platform-ref refusal, host mismatch and baseline mismatch;
- dry-run plan for 1.2.0 and 1.2.4.

Not validated here:

- a real hosted project apply, because no disposable project, paid resource or
  approval was available;
- Auth/RLS/Storage acceptance on a new hosted project;
- backup restore rehearsal.

Do not describe the local plan tests as live hosted database verification.
