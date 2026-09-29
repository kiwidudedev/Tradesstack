# TradesStack Phase 1N — First Isolated Client Supabase/Auth/RLS Proof

Status: **PASS 1N COMPLETE — ISOLATED CLIENT SUPABASE/AUTH/RLS PROVEN**

Date: 2026-09-27
Scope: first disposable, isolated client Supabase/Postgres/Auth target consuming the versioned `@tradesstack/suppliers` package.

Phase 1O extends this proof with the versioned baseline and forward-migration equivalence authority in [TRADESSTACK_CLIENT_DATABASE_BASELINE.md](TRADESSTACK_CLIENT_DATABASE_BASELINE.md).

## Executive decision

The first client database boundary is proven locally and safely. The proof did not connect to the hosted project, the Master local project, or any production secret. It used a temporary source copy, project marker `tradesstack-client-1n-20260927`, ports `61421–61423`, and database host `127.0.0.1`.

The recommended long-term bootstrap strategy is **HYBRID BASELINE + FORWARD MIGRATIONS**, subject to the existing live/deployment reconciliation described in the database baseline documents:

1. Keep the historical migration chain authoritative and replayable.
2. Produce a reviewed, versioned baseline only after reconciling the deployed Master state and classifying the current migration debt.
3. Bootstrap new isolated clients from that approved baseline, then apply forward migrations.
4. Continue using forward migrations for existing clients; never edit applied migrations.

Phase 1N proves the disposable bootstrap and acceptance harness. It does not claim that a hosted client project has been provisioned or that a baseline artifact is ready for production distribution.

## Current Master characterization

The repository contains one full Supabase configuration at `supabase/config.toml`, with Auth, Postgres, Storage, REST, and the broader local service topology. The linked-project metadata points at a hosted Supabase project and was deliberately not used.

At proof time there were 508 migration files in the working tree. The replay candidate contained 507 files:

- the 504 committed migration files;
- `20260913170000_fix_commercial_item_takeoff_reference_read_permission.sql`;
- `20260913180000_align_supplier_invoice_accounting_resolution_status.sql`;
- `20260926100000_fix_organization_logo_storage_policy_scope.sql`.

The excluded `20260810190000_cleanup_phase1_material_test_fixtures.sql` is documented as data-specific fixture cleanup, not normal schema bootstrap. No seed file was used. The reset ran with `--no-seed`.

The relevant security chain is:

```text
ordinary Auth user
        │
        ▼
signup trigger / invite acceptance
        │
        ▼
organizations + organization_members
        │
        ▼
role permissions + member overrides
        │
        ▼
has_org_permission(organization_id, permission_key)
        │
        ▼
organization_suppliers RLS
```

The first signup membership is characterized as `owner` by the current replay; legacy `member` roles are migrated to `worker`. Supplier writes are protected by the `suppliers.write` permission path, while member/worker access does not receive that permission.

## Isolated target and safety controls

The proof harness is at `proofs/isolated-client-supabase/` and is intentionally separate from the root application runtime. It:

- copies only `supabase/config.toml` and selected migration SQL into a temporary directory;
- rewrites project identity and ports to disposable values;
- runs `scripts/verify-disposable-supabase-target.mjs` before start;
- rejects the protected Master project identity and protected local ports;
- starts only the temporary Supabase workdir;
- reads local ephemeral keys only in memory for the test process;
- stops the temporary stack and removes only its own temporary directory in `finally`.

The package consumes the exact locally packed Phase 1M Supplier artifact `0.0.0-phase1m.1`. The Supplier package contains no Supabase, database, Next.js, React, provider, or environment dependency.

## Acceptance evidence

The passing run performed these actions using ordinary authenticated Supabase clients for all application reads/writes. The service-role client was used only for controlled bootstrap actions (creating test users, reading bootstrap membership, and creating the invitation).

| Area | Result |
| --- | --- |
| Disposable target guard | PASS |
| Full candidate migration replay | PASS — 507 files |
| Auth user creation and sign-in | PASS |
| Two independent organizations | PASS |
| Org A sees only its Supplier | PASS |
| Org B sees only its Supplier | PASS |
| Cross-org Supplier insert | DENIED |
| Cross-org Supplier update | DENIED |
| Cross-org Supplier delete | DENIED |
| Worker/member without `suppliers.write` insert | DENIED |
| Anonymous Supplier read | DENIED / zero rows |
| Supplier package validation | PASS — invalid input rejected |
| SupplierReference mapping | PASS |
| Temporary stack cleanup | PASS |

The first run also caught and corrected two harness assumptions: the replay’s signup role is `owner` rather than `admin`, and the migrated no-write invite role is `worker` rather than legacy `member`. Those findings are recorded characterization, not suppressed failures.

## What this proves

This is sufficient to prove that a client can have its own local Supabase/Postgres/Auth boundary, that the current organization tenancy and Supplier RLS chain works through ordinary user JWTs, and that the versioned Supplier package can be consumed without a database dependency.

It also proves that the current candidate migration chain is replayable in a clean disposable database after excluding the documented data-only fixture migration.

## What remains deferred

The following were not part of this proof and remain explicitly deferred:

- hosted client Supabase project creation or deployment;
- production or hosted secrets, billing, domains, email delivery, and external provider credentials;
- Storage object upload/download and signed-URL acceptance;
- Edge Functions, cron/queues, webhooks, Xero/OpenAI/Resend integrations;
- a production-ready baseline artifact and live Master/deployed-state reconciliation;
- client-specific seed/data import and operational backup/restore validation;
- broad application route/browser acceptance against the isolated client.

No database or migration file was changed by the proof. The harness and this authority document are the Phase 1N additions; the isolated package has its own lockfile and dependency boundary.

## Reproduction

From the repository root:

```bash
cd proofs/isolated-client-supabase
npm install --ignore-scripts --no-audit --no-fund
npm run proof
```

The command requires a local Docker runtime. It must not be pointed at `supabase/.temp/linked-project.json`, a hosted project, or the root Master Supabase workdir.
